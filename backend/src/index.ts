/**
 * Lead Scraper Backend Server
 *
 * Express + WebSocket server that powers the lead scraping application.
 * - REST API for search and enrichment
 * - WebSocket for real-time streaming of leads during scraping
 *
 * Flow:
 *   1. Frontend POSTs to /api/search → triggers async scrape, returns {searchId}
 *   2. Results are streamed via WebSocket to the registered client
 *   3. WebSocket also accepts direct `search` messages for full-duplex mode
 */

import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import searchRouter from './routes/search';
import enrichRouter from './routes/enrich';
import enrichDeepRouter from './routes/enrichDeep';
import leadScoresRouter from './routes/leadScores';
import enrichedGroupsRouter from './routes/enrichedGroups';
import savedListsRouter from './routes/savedLists';
import { searchGoogleMaps } from './services/googleMaps';
import { enrichLeadBatch } from './workers/enrichmentWorker';
import { globalDeduplicator } from './services/deduplicator';
import { loadLeads, saveLead, clearLeads } from './store';
import { SearchRequest, SearchProgress, Lead } from './types';

const PORT = process.env.PORT || 3001;
const WS_PORT = parseInt(process.env.WS_PORT || '4001');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Persisted leads
app.get('/api/leads', (_req, res) => {
  res.json({ success: true, leads: loadLeads() });
});

app.delete('/api/leads', (_req, res) => {
  clearLeads();
  res.json({ success: true });
});

// ── WebSocket Manager ──
// Maps clientId → WebSocket for targeted streaming
const wsClients = new Map<string, WebSocket>();
// Track active enrichment per client for cancel support
const enrichAbort = new Map<string, AbortController>();

function sendToClient(clientId: string, data: object): void {
  const ws = wsClients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data: object): void {
  const msg = JSON.stringify(data);
  for (const [, ws] of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// ── Export for routes to use ──
export { sendToClient, broadcast, wsClients };

// ── Mount routes ──
app.use('/api', searchRouter);
app.use('/api/enrich', enrichRouter);
app.use('/api/enrich', enrichDeepRouter);
app.use('/api', leadScoresRouter);
app.use('/api', enrichedGroupsRouter);
app.use('/api', savedListsRouter);

// ── WebSocket Server ──
const wss = new WebSocketServer({ port: WS_PORT });

console.log(`[Server] WebSocket server starting on port ${WS_PORT}`);

wss.on('connection', (ws: WebSocket) => {
  const clientId = uuidv4().slice(0, 8);
  console.log(`[WS] Client connected: ${clientId}`);

  // Send a welcome message with the client ID
  ws.send(JSON.stringify({
    type: 'connected',
    payload: { clientId, message: 'Connected to Lead Scraper backend' },
  }));

  // Register on receive of register message
  ws.on('message', async (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString());
      console.log(`[WS] Received from ${clientId}:`, message.type);

      switch (message.type) {
        case 'register': {
          // Client can provide its own clientId (e.g. from POST response) or use the auto-generated one
          const customId = message.payload?.clientId;
          if (customId) {
            // Remove old registration
            wsClients.delete(clientId);
            wsClients.set(customId, ws);
            // Mutate the local clientId for logging
            (ws as any)._clientId = customId;
            console.log(`[WS] Client re-registered as: ${customId}`);
            ws.send(JSON.stringify({
              type: 'registered',
              payload: { clientId: customId },
            }));
          } else {
            wsClients.set(clientId, ws);
            ws.send(JSON.stringify({
              type: 'registered',
              payload: { clientId },
            }));
          }
          break;
        }

        case 'search': {
          // Full search + enrichment flow with streaming (direct WS trigger)
          const { keyword, location, country, maxResults } = message.payload;

          if (!keyword || !location) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { error: 'keyword and location are required' },
            }));
            return;
          }

          const searchRequest: SearchRequest = {
            keyword: keyword.trim(),
            location: location.trim(),
            country: (country || 'United States').trim(),
            maxResults: Math.min(maxResults || 30, 100),
          };

          // Run the streaming search (Google Maps only)
          await runStreamingSearch(searchRequest, (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(data));
            }
          });
          break;
        }

        case 'enrich_batch': {
          // Batch enrichment triggered from the Enrichment page
          const { leads } = message.payload;
          if (!leads || !Array.isArray(leads) || leads.length === 0) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { error: 'leads array is required' },
            }));
            return;
          }

          // Store abort controller for cancel support
          const ac = new AbortController();
          enrichAbort.set(clientId, ac);

          ws.send(JSON.stringify({
            type: 'progress',
            payload: { message: `Starting enrichment for ${leads.length} leads...` },
          }));

          const onUpdate = (lead: Lead) => {
            if (ac.signal.aborted) return;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'lead_enriched',
                payload: { lead },
              }));
            }
            saveLead(lead);
          };

          try {
            // Lower concurrency to 2 to avoid CDP overload
            const enriched = await enrichLeadBatch(leads, onUpdate, 2, ac.signal);
            if (!ac.signal.aborted && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'enrich_complete',
                payload: {
                  totalEnriched: enriched.length,
                  message: `Enriched ${enriched.length} leads.`,
                },
              }));
            }
          } catch (error: any) {
            if (error?.name === 'AbortError') {
              console.log(`[Enrich] Enrichment cancelled for client ${clientId}`);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'enrich_cancelled',
                  payload: { message: 'Enrichment stopped by user.' },
                }));
              }
            } else if (!ac.signal.aborted && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'error',
                payload: { error: `Batch enrichment failed: ${error?.message || 'Unknown error'}` },
              }));
            }
          } finally {
            enrichAbort.delete(clientId);
          }
          break;
        }

        case 'cancel_enrich': {
          const ac = enrichAbort.get(clientId);
          if (ac) {
            ac.abort();
            enrichAbort.delete(clientId);
            console.log(`[WS] Enrichment cancelled by client ${clientId}`);
            ws.send(JSON.stringify({
              type: 'enrich_cancelled',
              payload: { message: 'Enrichment stop requested.' },
            }));
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
          break;
        }

        default: {
          ws.send(JSON.stringify({
            type: 'error',
            payload: { error: `Unknown message type: ${message.type}` },
          }));
        }
      }
    } catch (error: any) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { error: `Invalid message: ${error?.message}` },
      }));
    }
  });

  ws.on('close', () => {
    // Remove from client map
    for (const [key, sock] of wsClients) {
      if (sock === ws) {
        wsClients.delete(key);
        // Cleanup enrichment if client disconnects mid-enrich
        const ac = enrichAbort.get(key);
        if (ac) { ac.abort(); enrichAbort.delete(key); }
        console.log(`[WS] Client disconnected: ${key}`);
      }
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS] Error on client ${clientId}:`, error.message);
  });
});

// ── Streaming Search Engine ──

/**
 * Run Google Maps search only (no enrichment waterfall).
 * Each found lead is streamed via `sendMessage(msg)`.
 * Used by both the WS handler and the REST API trigger.
 */
export async function runStreamingSearch(
  request: SearchRequest,
  sendMessage: (msg: object) => void,
): Promise<Lead[]> {
  globalDeduplicator.reset();

  sendMessage({
    type: 'progress',
    payload: { message: `Searching Google Maps for ${request.keyword} in ${request.location}...` },
  });

  try {
    // Phase 1: Get leads from Google Maps only — no enrichment waterfall
    const leads = await searchGoogleMaps(request);
    const uniqueLeads: Lead[] = [];

    for (const lead of leads) {
      if (globalDeduplicator.tryAdd(lead.businessName, lead.address)) {
        uniqueLeads.push(lead);
        sendMessage({
          type: 'lead_found',
          payload: { lead, totalFound: uniqueLeads.length },
        });
      }
    }

    // Save all leads to persistent storage
    uniqueLeads.forEach(l => saveLead(l));

    // Done — no enrichment phase
    sendMessage({
      type: 'complete',
      payload: {
        totalFound: uniqueLeads.length,
        enrichedWithEmail: 0,
        phonesFound: 0,
        fallbackSitesScraped: 0,
        message: `Found ${uniqueLeads.length} businesses on Google Maps.`,
      },
    });

    return uniqueLeads;
  } catch (error: any) {
    sendMessage({
      type: 'error',
      payload: { error: `Search failed: ${error?.message || 'Unknown error'}` },
    });
    return [];
  }
}

// ── Start Server ──
function startServers() {
  server.listen(PORT, () => {
    console.log(`[Server] HTTP API running on http://localhost:${PORT}`);
    console.log(`[Server] WebSocket running on ws://localhost:${WS_PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });
}

startServers();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  wss.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  wss.close();
  server.close(() => process.exit(0));
});
// build trigger 1779848735
