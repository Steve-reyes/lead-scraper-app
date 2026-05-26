/**
 * Enrichment routes — explicitly triggered from the Enrichment page.
 *
 * POST /api/enrich        — Enrich a single lead (synchronous)
 * POST /api/enrich/batch  — Enrich multiple leads with WebSocket streaming
 *
 * Enrichment never runs automatically during search.
 * It must be explicitly invoked from the /enrich page.
 */

import { Router, Request, Response } from 'express';
import { enrichLead, enrichLeadBatch } from '../workers/enrichmentWorker';
import { Lead } from '../types';
import { sendToClient } from '../index';
import { saveLead } from '../store';

const router = Router();

// ── POST /api/enrich — Enrich a single lead (synchronous) ──
router.post('/', async (req: Request, res: Response) => {
  try {
    const { lead } = req.body;

    if (!lead) {
      return res.status(400).json({ error: 'Lead data is required' });
    }

    const enrichedLead = await enrichLead(lead, () => {});

    return res.json({
      success: true,
      lead: enrichedLead,
    });
  } catch (error: any) {
    console.error('[Enrich] Error:', error);
    return res.status(500).json({
      error: 'Enrichment failed',
      details: error?.message || 'Internal server error',
    });
  }
});

// ── POST /api/enrich/batch — Enrich multiple leads ──
// Accepts full lead objects or an array of lead IDs (if leads[] with IDs provided,
// frontend must have previously loaded the full lead data).
// When clientId is provided, results stream via WebSocket.
router.post('/batch', async (req: Request, res: Response) => {
  try {
    const { leads, clientId } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Leads array is required' });
    }

    console.log(`[Enrich Batch] Enriching ${leads.length} leads${clientId ? ` for client ${clientId}` : ''}`);

    // Acknowledge immediately
    res.json({
      success: true,
      total: leads.length,
      status: 'started',
      message: `Enriching ${leads.length} leads...`,
    });

    // Build the sendMessage function for WS streaming
    const sendMessage = clientId && sendToClient
      ? (msg: object) => sendToClient(clientId, msg)
      : () => {}; // No streaming if no clientId

    sendMessage({
      type: 'progress',
      payload: { message: `Starting enrichment for ${leads.length} leads...` },
    });

    // Download enrichment progress per lead
    const onUpdate = (lead: Lead) => {
      sendMessage({
        type: 'lead_enriched',
        payload: { lead },
      });
    };

    const enrichedLeads = await enrichLeadBatch(leads, onUpdate, 5);

    sendMessage({
      type: 'enrich_complete',
      payload: {
        totalEnriched: enrichedLeads.length,
        message: `Enriched ${enrichedLeads.length} leads.`,
      },
    });

  } catch (error: any) {
    console.error('[Enrich Batch] Error:', error);
    // Error sent via WS if possible
    if (req.body?.clientId && sendToClient) {
      sendToClient(req.body.clientId, {
        type: 'error',
        payload: { error: `Batch enrichment failed: ${error?.message || 'Unknown error'}` },
      });
    }
  }
});

export default router;
