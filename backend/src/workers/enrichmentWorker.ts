/**
 * Aggressive Enrichment Worker.
 *
 * For every lead submitted for enrichment:
 *   1. Scrape the website (if lead has one) — homepage, /contact, /about
 *   2. Query all directory sites via Google Maps / FlareSolverr for that business
 *
 * No conditional skips. Every lead gets the full treatment.
 * Results merge into the lead (doesn't overwrite existing good data, but enriches missing fields).
 */

import { Lead } from '../types';
import { scrapeWebsite } from '../services/scraper';
import { findInDirectories, mergeDirectoryResult } from '../services/directoryFallback';
import { detectCountry } from '../utils/validators';

export type EnrichmentCallback = (lead: Lead) => void;

/**
 * Run full enrichment on a single lead — website scrape + all directories.
 * Reports each state update via the callback for real-time streaming.
 */
export async function enrichLead(
  lead: Lead,
  onUpdate: EnrichmentCallback
): Promise<Lead> {
  const enriched = { ...lead };
  enriched.sources = [...(lead.sources || [])];

  const city = lead.city || lead.address?.split(',')[0]?.trim() || '';
  const country = lead.country || detectCountry(lead.address || '');

  // ── Step 1: Always scrape website if lead has one ──
  if (lead.website) {
    enriched.enrichmentStatus = 'scanning_website';
    onUpdate(enriched);

    try {
      const scraped = await scrapeWebsite(lead.website);

      if (scraped.emails.length > 0 && !enriched.email) {
        enriched.email = scraped.emails[0];
      }

      if (scraped.phones.length > 0 && !enriched.phone) {
        enriched.phone = scraped.phones[0];
      }

      if (scraped.socials.linkedin || scraped.socials.facebook || scraped.socials.instagram || scraped.socials.twitter) {
        enriched.socialLinks = {
          ...(enriched.socialLinks || {}),
          ...scraped.socials,
        };
      }

      // Track source
      const alreadyHasSource = enriched.sources.some((s) => s.type === 'website_scrape');
      if (!alreadyHasSource) {
        enriched.sources.push({ type: 'website_scrape', name: 'Web Scrape', url: lead.website });
      }
    } catch (error: any) {
      enriched.enrichmentError = enriched.enrichmentError
        ? `${enriched.enrichmentError} | Website scrape failed: ${error?.message || 'Unknown'}`
        : `Website scrape failed: ${error?.message || 'Unknown'}`;
    }
  }

  // ── Step 2: Always query directories ──
  enriched.enrichmentStatus = 'scanning_directories';
  onUpdate(enriched);

  try {
    const dirResult = await findInDirectories(lead.businessName, city, country);

    if (dirResult) {
      if (dirResult.phone && !enriched.phone) enriched.phone = dirResult.phone;
      if (dirResult.email && !enriched.email) enriched.email = dirResult.email;
      if (dirResult.website && !enriched.website) enriched.website = dirResult.website;

      // Track source
      const alreadyHasSource = enriched.sources.some((s) => s.type === dirResult.source.type);
      if (!alreadyHasSource) {
        enriched.sources.push(dirResult.source);
      }
    }
  } catch (error: any) {
    enriched.enrichmentError = enriched.enrichmentError
      ? `${enriched.enrichmentError} | Directory lookup failed: ${error?.message || 'Unknown'}`
      : `Directory lookup failed: ${error?.message || 'Unknown'}`;
  }

  // ── Final status ──
  enriched.enrichmentStatus = enriched.enrichmentError ? 'failed' : 'complete';
  enriched.updatedAt = new Date().toISOString();

  onUpdate(enriched);
  return enriched;
}

/**
 * Enrich a batch of leads concurrently with rate limiting.
 * Controls concurrency to avoid overwhelming sources.
 */
export async function enrichLeadBatch(
  leads: Lead[],
  onUpdate: EnrichmentCallback,
  concurrency: number = 3
): Promise<Lead[]> {
  const enrichedLeads: Lead[] = [];

  // Process in chunks for concurrency control
  for (let i = 0; i < leads.length; i += concurrency) {
    const chunk = leads.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((leadItem) => enrichLead(leadItem, onUpdate))
    );

    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        enrichedLeads.push(result.value);
      } else {
        // Mark as failed
        const failedLead = {
          ...chunk[index],
          enrichmentStatus: 'failed' as const,
          enrichmentError: result.reason?.message || 'Enrichment failed',
        };
        enrichedLeads.push(failedLead);
        onUpdate(failedLead);
      }
    });
  }

  return enrichedLeads;
}
