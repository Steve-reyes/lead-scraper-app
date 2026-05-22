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
import { findBusinessWebsite } from '../services/googleSearch';
import { scrapeWebsiteWithBrowser } from '../services/browserScraper';
import { detectCountry } from '../utils/validators';

export type EnrichmentCallback = (lead: Lead) => void;

/**
 * Pick the best email from a list — prefers same-domain as the business website.
 * Falls back to generic providers (gmail, yahoo), then first available.
 */
function pickMainEmail(emails: string[], websiteUrl?: string): string | undefined {
  if (!emails || emails.length === 0) return undefined;
  if (emails.length === 1) return emails[0];

  let bizDomain: string | undefined;
  if (websiteUrl) {
    try {
      bizDomain = new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase();
    } catch {}
  }

  const GENERIC_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
    'outlook.com', 'live.com', 'msn.com', 'icloud.com',
    'protonmail.com', 'proton.me', 'aol.com', 'mail.com',
    'zoho.com', 'yandex.com', 'gmx.com',
  ];

  // Prefer emails matching the business domain
  if (bizDomain) {
    const sameDomain = emails.filter((e) => {
      const domain = e.split('@')[1]?.toLowerCase();
      return domain && (domain === bizDomain || domain.endsWith('.' + bizDomain));
    });
    if (sameDomain.length > 0) return sameDomain[0];
  }

  // Fall back to generic providers
  const generic = emails.filter((e) => {
    const domain = e.split('@')[1]?.toLowerCase();
    return domain && GENERIC_PROVIDERS.includes(domain);
  });
  if (generic.length > 0) return generic[0];

  // Last resort
  return emails[0];
}

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

  // ── Step 1: Find business website via Google Search, then scrape it ──
  enriched.enrichmentStatus = 'scanning_website';
  onUpdate(enriched);

  let websiteToScrape = lead.website;
  try {
    const foundWebsite = await findBusinessWebsite(lead.businessName, city);
    if (foundWebsite) {
      websiteToScrape = foundWebsite;
      enriched.website = foundWebsite;
    }
  } catch (error: any) {
    enriched.enrichmentError = enriched.enrichmentError
      ? `${enriched.enrichmentError} | Google search failed: ${error?.message || 'Unknown'}`
      : `Google search failed: ${error?.message || 'Unknown'}`;
  }

  if (websiteToScrape) {
    try {
      // Step 1a: Try fast fetch-based scraper first
      const scraped = await scrapeWebsite(websiteToScrape);
      let hasData = scraped.emails.length > 0 || scraped.phones.length > 0;

      // Step 1b: If fetch scraper found nothing, use Chrome CDP for JS-rendered sites
      if (!hasData) {
        console.log(`[Enrich] Fetch scraper found nothing, trying Chrome CDP for ${websiteToScrape}`);
        const browserScraped = await scrapeWebsiteWithBrowser(websiteToScrape);
        scraped.emails.push(...browserScraped.emails);
        scraped.phones.push(...browserScraped.phones);
        scraped.emails = [...new Set(scraped.emails)];
        scraped.phones = [...new Set(scraped.phones)];
        hasData = scraped.emails.length > 0 || scraped.phones.length > 0;
      }

      if (!enriched.email) {
        const bestEmail = pickMainEmail(scraped.emails, websiteToScrape);
        if (bestEmail) enriched.email = bestEmail;
      }

      if (scraped.phones.length > 0 && !enriched.phone) {
        // Pick the first valid phone (not fax, not too short)
        const validPhones = scraped.phones.filter((p) => p.replace(/[\s.-]/g, '').length >= 10);
        enriched.phone = validPhones.length > 0 ? validPhones[0] : scraped.phones[0];
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
        enriched.sources.push({ type: 'website_scrape', name: 'Web Scrape', url: websiteToScrape });
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
