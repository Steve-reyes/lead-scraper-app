/**
 * API client for the Lead Scraper backend.
 *
 * Search flow:
 *   1. Frontend POSTs to /api/search with params + clientId → triggers async scrape
 *   2. Backend returns { searchId, status: "started" } immediately
 *   3. Results stream in via the persistent WebSocket connection
 *
 * Enrichment flow:
 *   1. Frontend POSTs to /api/enrich/batch with leads[] + clientId
 *   2. Backend returns { status: "started" } immediately
 *   3. Progress for each lead streams via WebSocket
 *
 * The WebSocket is auto-connected when you call connectWebSocket().
 */

// Use same-origin for production (nginx proxy routes /api/ to backend)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface SearchParams {
  keyword: string;
  location: string;
  country: string;
  maxResults?: number;
  radius?: number;
}

export interface SearchResult {
  success: boolean;
  totalFound: number;
  leads: Lead[];
}

export interface EnrichResult {
  success: boolean;
  lead: Lead;
  errors?: number;
}

// We re-export types from the types file for convenience
import type { Lead, WSMessage } from './types';

export type { Lead, WSMessage };

/**
 * Connect to the backend WebSocket for real-time streaming.
 * Returns the WebSocket instance and the assigned clientId (via callback).
 *
 * The connection persists across searches. Call .close() to disconnect.
 */
let wsInstance: WebSocket | null = null;
let wsOnMessage: ((data: WSMessage) => void) | null = null;
let wsOnConnected: ((clientId: string) => void) | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function createWS() {
  if (wsInstance) {
    try { wsInstance.close(); } catch {}
    wsInstance = null;
  }

  const wsUrl = getWsUrl();
  const ws = new WebSocket(wsUrl);
  wsInstance = ws;

  ws.onopen = () => {
    console.log('[WS] Connected to backend');
    ws.send(JSON.stringify({ type: 'register', payload: {} }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WSMessage;
      if (data.type === 'connected' || data.type === 'registered') {
        const clientId = data.payload?.clientId;
        if (clientId && wsOnConnected) {
          wsOnConnected(clientId);
        }
      }
      if (wsOnMessage) wsOnMessage(data);
    } catch (error) {
      console.error('[WS] Parse error:', error);
    }
  };

  ws.onerror = () => {
    console.error('[WS] Connection error');
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected — reconnecting in 3s...');
    wsInstance = null;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    wsReconnectTimer = setTimeout(() => {
      console.log('[WS] Reconnecting...');
      createWS();
    }, 3000);
  };
}

export function connectWebSocket(onMessage: (data: WSMessage) => void, onConnected?: (clientId: string) => void): WebSocket {
  wsOnMessage = onMessage;
  wsOnConnected = onConnected || null;

  // If no instance or disconnected, create one
  if (!wsInstance || wsInstance.readyState === WebSocket.CLOSED || wsInstance.readyState === WebSocket.CLOSING) {
    createWS();
  }

  // Return the current instance (caller tracks ref)
  return wsInstance!;
}

export function disconnectWS() {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (wsInstance) {
    try { wsInstance.close(); } catch {}
    wsInstance = null;
  }
  wsOnMessage = null;
  wsOnConnected = null;
}

/**
 * Trigger a Google Maps search via POST /api/search.
 * Backend starts the scrape asynchronously and streams results via WebSocket.
 */
export async function triggerSearch(params: SearchParams, clientId?: string): Promise<{ searchId: string; message: string }> {
  const response = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: params.keyword,
      location: params.location,
      country: params.country,
      maxResults: params.maxResults ?? 30,
      radius: params.radius || 0,
      clientId,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Trigger batch enrichment via POST /api/enrich/batch.
 * Backend enriches leads and streams progress via WebSocket.
 */
export async function triggerBatchEnrich(leads: Lead[], clientId?: string): Promise<{ success: boolean; total: number; message: string }> {
  const response = await fetch(`${API_BASE}/api/enrich/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads, clientId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Trigger deep batch enrichment via POST /api/enrich/deep.
 * Uses FlareSolverr to bypass Cloudflare on directory sites.
 */
export async function triggerDeepBatchEnrich(leads: Lead[], clientId?: string): Promise<{ success: boolean; total: number; message: string }> {
  const response = await fetch(`${API_BASE}/api/enrich/deep`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leads, clientId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Enrich a single lead via REST (synchronous, for non-streaming use).
 */
export async function enrichLead(lead: Lead): Promise<EnrichResult> {
  const response = await fetch(`${API_BASE}/api/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead }),
  });

  if (!response.ok) {
    throw new Error(`Enrichment failed: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Health check.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get WebSocket URL from env or derive from API_BASE.
 */
export function getWsUrl(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '4001';
  try {
    const url = new URL(apiBase);
    return `ws://${url.hostname}:${wsPort}`;
  } catch {
    return `ws://localhost:${wsPort}`;
  }
}
