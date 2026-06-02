/**
 * Search routes — REST endpoints for lead scraping.
 *
 * POST /api/search   — Trigger a new Google Maps search.
 *                      Returns { searchId, status } immediately.
 *                      Results stream via WebSocket to the registered client.
 *
 * Enrichment has been moved to routes/enrich.ts — it runs only when
 * explicitly triggered from the /enrich page.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { searchGoogleMaps } from '../services/googleMaps';
import { globalDeduplicator } from '../services/deduplicator';
import { SearchRequest } from '../types';
import { sendToClient } from '../index';
import { runStreamingSearch } from '../index';

const router = Router();

// ── POST /api/search — trigger a new streaming search (Google Maps only) ──
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { keyword, location, country, radius, maxResults, clientId, freshSession } = req.body;

    if (!keyword || !location) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'keyword and location are required',
      });
    }

    const searchRequest: SearchRequest = {
      keyword: keyword.trim(),
      location: location.trim(),
      country: (country || 'United States').trim(),
      radiusKm: Math.min(Math.max(parseInt(radius) || 0, 0), 50),
      maxResults: Math.min(parseInt(maxResults) || 500, 2000),
      freshSession: freshSession === true || freshSession === 'true',
    };

    const searchId = uuidv4().slice(0, 12);

    console.log(`[Search] POST trigger: "${searchRequest.keyword}" in "${searchRequest.location}" (id=${searchId})`);

    // Acknowledge immediately — search runs asynchronously
    res.json({
      success: true,
      searchId,
      status: 'started',
      message: `Searching Google Maps for "${searchRequest.keyword}" in "${searchRequest.location}"...`,
    });

    // If a clientId was provided, send results specifically to that WS client.
    // Otherwise broadcast to all connected clients.
    const sendMessage = clientId && sendToClient
      ? (msg: object) => sendToClient(clientId, msg)
      : (msg: object) => {
          const { broadcast } = require('../index');
          broadcast(msg);
        };

    // Reset deduplicator for new search
    globalDeduplicator.reset();

    // Run Google Maps search only — no enrichment waterfall
    await runStreamingSearch(searchRequest, sendMessage);

  } catch (error: any) {
    console.error('[Search] Background error:', error);
  }
});

export default router;
