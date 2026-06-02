/**
 * Deep enrichment route — uses FlareSolverr to scrape directory sites.
 *
 * POST /api/enrich/deep — Enrich leads using directory site scraping
 *   via FlareSolverr (bypasses Cloudflare).
 *
 * Same streaming pattern as /api/enrich/batch but routes through FlareSolverr
 * for directory lookups instead of direct fetch.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { load } from 'cheerio';
import { Lead, ScrapedContact } from '../types';
import { findInDirectoriesDeep } from '../services/directoryFlare';
import { detectCountry, extractEmails, extractPhones } from '../utils/validators';
import { sendToClient } from '../index';
import { saveLead } from '../store';

/**
 * Quick website scrape — tries direct fetch first, falls back to FlareSolverr.
 * Only scrapes the home page (fast ~2-3s via direct, ~5-10s via Flare).
 * Returns emails + phones found on the page.
 */
async function scrapeBusinessWebsite(websiteUrl: string): Promise<ScrapedContact> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  const contact = { emails: [] as string[], phones: [] as string[], socials: {} as any };

  // Try direct fetch first (fast)
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const text = await resp.text();
      contact.emails = extractEmails(text);
      const $ = load(text);
      contact.phones = extractPhones($('body').text());
      if (contact.emails.length > 0 || contact.phones.length > 0) return contact;
    }
  } catch { /* fall through to FlareSolverr */ }

  // Fallback: FlareSolverr
  try {
    const resp = await fetch('http://127.0.0.1:8191/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 15000 }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await resp.json() as any;
    if (data.status === 'ok') {
      const html = data.solution?.response || '';
      contact.emails = extractEmails(html);
      const $ = load(html);
      contact.phones = extractPhones($('body').text());
    }
  } catch { /* ignore */ }

  return contact;
}

const router = Router();

router.post('/deep', async (req: Request, res: Response) => {
  try {
    const { leads, clientId } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Leads array is required' });
    }

    console.log(`[Deep Enrich] Starting deep enrichment for ${leads.length} leads${clientId ? ` (client ${clientId})` : ''}`);

    // Acknowledge immediately
    res.json({
      success: true,
      total: leads.length,
      status: 'started',
      message: `Deep enriching ${leads.length} leads through directory sites...`,
    });

    const sendMessage = clientId && sendToClient
      ? (msg: object) => sendToClient(clientId, msg)
      : () => {};

    sendMessage({
      type: 'progress',
      payload: { message: `Starting deep enrichment for ${leads.length} leads...` },
    });

    // Process leads sequentially (FlareSolverr handles 1 req at a time efficiently)
    const enrichedLeads: Lead[] = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i] as Lead;
      sendMessage({
        type: 'progress',
        payload: { message: `[${i + 1}/${leads.length}] Searching directories for ${lead.businessName}...` },
      });

      const city = lead.city || lead.address?.split(',')[0]?.trim() || '';
      const country = lead.country || detectCountry(lead.address || '');

      try {
        const dirResult = await findInDirectoriesDeep(lead.businessName, city, country, (progressMsg) => {
          sendMessage({
            type: 'progress',
            payload: { message: `[${i + 1}/${leads.length}] ${lead.businessName}: ${progressMsg}` },
          });
        });

        const websiteUrl = dirResult?.website || lead.website;

        // If we found a website, scrape it for emails/phones (parallel)
        let scraped: ScrapedContact | null = null;
        if (websiteUrl) {
          sendMessage({
            type: 'progress',
            payload: { message: `[${i + 1}/${leads.length}] ${lead.businessName}: scraping website...` },
          });
          scraped = await scrapeBusinessWebsite(websiteUrl);
        }

        const enriched: Lead = {
          ...lead,
          sources: [...(lead.sources || [])],
          enrichmentStatus: 'complete',
          updatedAt: new Date().toISOString(),
        };

        if (dirResult) {
          if (dirResult.phone && !enriched.phone) enriched.phone = dirResult.phone;
          if (dirResult.email && !enriched.email) enriched.email = dirResult.email;
          if (dirResult.website && !enriched.website) enriched.website = dirResult.website;

          const alreadyHasSource = enriched.sources.some((s) => s.type === dirResult.source.type);
          if (!alreadyHasSource) enriched.sources.push(dirResult.source);
        }

        // Merge website scrape results (emails/phones take priority)
        if (scraped) {
          if (scraped.emails.length > 0 && !enriched.email) enriched.email = scraped.emails[0];
          if (scraped.phones.length > 0 && !enriched.phone) enriched.phone = scraped.phones[0];
          if (scraped.emails.length > 0 || scraped.phones.length > 0) {
            enriched.sources.push({ type: 'website_scrape', name: websiteUrl, url: websiteUrl });
          }
        }

        enrichedLeads.push(enriched);

        sendMessage({
          type: 'lead_enriched',
          payload: {
            lead: enriched,
            enrichedWithEmail: enriched.email ? 1 : 0,
            phonesFound: enriched.phone ? 1 : 0,
            fallbackSitesScraped: 1,
          },
        });
      } catch (error: any) {
        const failed: Lead = {
          ...lead,
          enrichmentStatus: 'failed',
          enrichmentError: `Deep enrichment failed: ${error?.message || 'Unknown'}`,
          updatedAt: new Date().toISOString(),
        };
        enrichedLeads.push(failed);
        saveLead(failed);
        sendMessage({ type: 'lead_enriched', payload: { lead: failed } });
      }
    }

    sendMessage({
      type: 'enrich_complete',
      payload: {
        totalEnriched: enrichedLeads.length,
        message: `Deep enriched ${enrichedLeads.length} leads.`,
      },
    });

  } catch (error: any) {
    console.error('[Deep Enrich] Error:', error);
    if (req.body?.clientId && sendToClient) {
      sendToClient(req.body.clientId, {
        type: 'error',
        payload: { error: `Deep enrichment failed: ${error?.message || 'Unknown error'}` },
      });
    }
  }
});

export default router;
