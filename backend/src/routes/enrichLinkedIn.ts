/**
 * Combined browser + directories enrichment route.
 *
 * POST /api/enrich/linkedin — For each lead:
 *   1. Searches LinkedIn via browser (Chrome CDP)
 *   2. Searches directory sites via FlareSolverr (Cylex, Kompass, Hotfrog, Bing Places)
 *   3. Returns best combined result
 *
 * "LinkedIn" is the button name on frontend, but it runs directory searches too.
 */

import { Router, Request, Response } from 'express';
import { Lead, DirectoryResult } from '../types';
import { searchLinkedIn } from '../services/linkedInScraper';
import { findInDirectoriesDeep } from '../services/directoryFlare';
import { detectCountry } from '../utils/validators';
import { sendToClient } from '../index';

const router = Router();

router.post('/linkedin', async (req: Request, res: Response) => {
  try {
    const { leads, clientId } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Leads array is required' });
    }

    console.log(`[Browser Enrich] Starting for ${leads.length} leads${clientId ? ` (client ${clientId})` : ''}`);

    res.json({
      success: true,
      total: leads.length,
      status: 'started',
      message: `Browser-enriching ${leads.length} leads via LinkedIn + directories...`,
    });

    const sendMessage = clientId && sendToClient
      ? (msg: object) => sendToClient(clientId, msg)
      : () => {};

    sendMessage({
      type: 'progress',
      payload: { message: `Starting browser enrichment for ${leads.length} leads...` },
    });

    const enrichedLeads: Lead[] = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i] as Lead;
      sendMessage({
        type: 'progress',
        payload: { message: `[${i + 1}/${leads.length}] Scraping for ${lead.businessName}...` },
      });

      const city = lead.city || lead.address?.split(',')[0]?.trim() || '';
      const country = lead.country || detectCountry(lead.address || '');

      try {
        // Run LinkedIn + directories in parallel
        const [linkedInResult, dirResult] = await Promise.allSettled([
          searchLinkedIn(lead.businessName, city),
          findInDirectoriesDeep(lead.businessName, city, country),
        ]);

        const enriched: Lead = {
          ...lead,
          sources: [...(lead.sources || [])],
          enrichmentStatus: 'complete',
          updatedAt: new Date().toISOString(),
        };

        // Apply LinkedIn result
        if (linkedInResult.status === 'fulfilled' && linkedInResult.value) {
          const r = linkedInResult.value;
          if (r.website && !enriched.website) enriched.website = r.website;
          if (r.email && !enriched.email) enriched.email = r.email;
          if (r.phone && !enriched.phone) enriched.phone = r.phone;

          if (r.website?.includes('linkedin.com')) {
            enriched.socialLinks = { ...(enriched.socialLinks || {}), linkedin: r.website };
          }

          if (!enriched.sources.some((s) => s.type === r.source.type)) {
            enriched.sources.push(r.source);
          }
        }

        // Apply directory result (Cylex, Kompass, Hotfrog, Bing Places)
        if (dirResult.status === 'fulfilled' && dirResult.value) {
          const r = dirResult.value;
          if (r.email && !enriched.email) enriched.email = r.email;
          if (r.phone && !enriched.phone) enriched.phone = r.phone;
          if (r.website && !enriched.website) enriched.website = r.website;

          if (!enriched.sources.some((s) => s.type === r.source.type)) {
            enriched.sources.push(r.source);
          }
        }

        enrichedLeads.push(enriched);
        sendMessage({ type: 'lead_enriched', payload: { lead: enriched } });
      } catch (error: any) {
        const failed: Lead = {
          ...lead,
          enrichmentStatus: 'failed',
          enrichmentError: `Browser enrich failed: ${error?.message || 'Unknown'}`,
          updatedAt: new Date().toISOString(),
        };
        enrichedLeads.push(failed);
        sendMessage({ type: 'lead_enriched', payload: { lead: failed } });
      }
    }

    sendMessage({
      type: 'enrich_complete',
      payload: {
        totalEnriched: enrichedLeads.length,
        message: `Browser-enriched ${enrichedLeads.length} leads.`,
      },
    });

  } catch (error: any) {
    console.error('[Browser Enrich] Error:', error);
    if (req.body?.clientId && sendToClient) {
      sendToClient(req.body.clientId, {
        type: 'error',
        payload: { error: `Browser enrichment failed: ${error?.message || 'Unknown error'}` },
      });
    }
  }
});

export default router;
