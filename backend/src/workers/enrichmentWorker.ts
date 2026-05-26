/**
 * Aggressive Enrichment Worker.
 *
 * For every lead submitted for enrichment:
 *   1. Scrape the website (if lead has one) — homepage, /contact, /about
 *   2. Query all directory sites via Google Maps / FlareSolverr for that business
 *
 * No conditional skips. Every lead gets the full treatment.
 * Results merge into the lead (doesn't overwrite existing good data, but enriches missing fields).
 *
 * Human-like delays between each step to avoid rate limiting and bot detection.
 *
 * Two-pass logic for cloudflare-leads:
 *   Pass 1: Normal enrichment (fetch → browser scraper).
 *   Pass 2: Blocked leads (cloudflare) are retried through FlareSolverr bypass.
 */

import { Lead } from '../types';
import { scrapeWebsite } from '../services/scraper';
import { findInDirectories } from '../services/directoryFallback';
import { findBusinessWebsite } from '../services/googleSearch';
import { scrapeWebsiteWithBrowser } from '../services/browserScraper';
import { scrapeWebsiteThroughFlare } from '../services/directoryFlare';
import { detectCountry } from '../utils/validators';

export type EnrichmentCallback = (lead: Lead) => void;

/**
 * Random delay between min and max milliseconds.
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

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

  if (bizDomain) {
    const sameDomain = emails.filter((e) => {
      const domain = e.split('@')[1]?.toLowerCase();
      return domain && (domain === bizDomain || domain.endsWith('.' + bizDomain));
    });
    if (sameDomain.length > 0) return sameDomain[0];
  }

  const generic = emails.filter((e) => {
    const domain = e.split('@')[1]?.toLowerCase();
    return domain && GENERIC_PROVIDERS.includes(domain);
  });
  if (generic.length > 0) return generic[0];

  return emails[0];
}

/**
 * Pass 1: Normal enrichment on a single lead — Google search + website scrape + directory lookup.
 */
export async function enrichLead(
  lead: Lead,
  onUpdate: EnrichmentCallback
): Promise<Lead> {
  const enriched = { ...lead };
  enriched.sources = [...(lead.sources || [])];

  const city = lead.city || lead.address?.split(',')[0]?.trim() || '';
  const country = lead.country || detectCountry(lead.address || '');

  // ── Step 1: Find business website via Google Search ──
  enriched.enrichmentStatus = 'scanning_website';
  onUpdate(enriched);

  let websiteToScrape = lead.website;
  try {
    const searchResult = await findBusinessWebsite(lead.businessName, city);
    if (searchResult.websiteUrl) {
      websiteToScrape = searchResult.websiteUrl;
      enriched.website = searchResult.websiteUrl;
    }
    if (searchResult.email && !enriched.email) {
      enriched.email = searchResult.email;
    }
  } catch (error: any) {
    enriched.enrichmentError = enriched.enrichmentError
      ? `${enriched.enrichmentError} | Google search failed: ${error?.message || 'Unknown'}`
      : `Google search failed: ${error?.message || 'Unknown'}`;
  }

  // Human-like 2-4s pause before moving to website scrape
  await randomDelay(2000, 4000);

  if (websiteToScrape) {
    try {
      // Step 1a: Try fast fetch-based scraper first
      const scraped = await scrapeWebsite(websiteToScrape);
      let hasData = scraped.emails.length > 0 || scraped.phones.length > 0;

      // Step 1b: If fetch scraper found nothing, use Chrome CDP for JS-rendered sites
      if (!hasData) {
        console.log(`[Enrich] Fetch scraper found nothing, trying Chrome CDP for ${websiteToScrape}`);
        await randomDelay(1000, 3000);
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
        const validPhones = scraped.phones.filter((p) => p.replace(/[\s.-]/g, '').length >= 10);
        enriched.phone = validPhones.length > 0 ? validPhones[0] : scraped.phones[0];
      }

      if (scraped.socials.linkedin || scraped.socials.facebook || scraped.socials.instagram || scraped.socials.twitter) {
        enriched.socialLinks = {
          ...(enriched.socialLinks || {}),
          ...scraped.socials,
        };
      }

      const alreadyHasSource = enriched.sources.some((s) => s.type === 'website_scrape');
      if (!alreadyHasSource) {
        enriched.sources.push({ type: 'website_scrape', name: 'Web Scrape', url: websiteToScrape });
      }
    } catch (error: any) {
      const msg = error?.message || 'Unknown';
      if (msg === 'cloudflare lock') {
        enriched.enrichmentError = 'cloudflare lock';
      } else {
        enriched.enrichmentError = enriched.enrichmentError
          ? `${enriched.enrichmentError} | Website scrape failed: ${msg}`
          : `Website scrape failed: ${msg}`;
      }
    }
  }

  // Human-like 3-5s pause before directory lookup
  await randomDelay(3000, 5000);

  // ── Step 2: Always query directories ──
  enriched.enrichmentStatus = 'scanning_directories';
  onUpdate(enriched);

  try {
    const dirResult = await findInDirectories(lead.businessName, city, country);

    if (dirResult) {
      if (dirResult.phone && !enriched.phone) enriched.phone = dirResult.phone;
      if (dirResult.email && !enriched.email) enriched.email = dirResult.email;
      if (dirResult.website && !enriched.website) enriched.website = dirResult.website;

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

  // Don't set final status yet — batch handler decides (pass 2 may update)
  return enriched;
}

/**
 * Pass 2: Retry cloudflare-blocked leads through FlareSolverr.
 */
async function enrichWithFlare(
  lead: Lead,
  onUpdate: EnrichmentCallback
): Promise<Lead> {
  const enriched = { ...lead };
  const websiteToScrape = enriched.website || enriched.businessName;

  console.log(`[Enrich] Pass 2 — retrying through FlareSolverr for ${websiteToScrape}`);

  enriched.enrichmentStatus = 'scanning_website';
  onUpdate(enriched);

  try {
    const scraped = await scrapeWebsiteThroughFlare(websiteToScrape);
    let updated = false;

    if (scraped.emails.length > 0 && !enriched.email) {
      const bestEmail = pickMainEmail(scraped.emails, websiteToScrape);
      if (bestEmail) { enriched.email = bestEmail; updated = true; }
    }

    if (scraped.phones.length > 0 && !enriched.phone) {
      const validPhones = scraped.phones.filter((p) => p.replace(/[\s.-]/g, '').length >= 10);
      enriched.phone = validPhones.length > 0 ? validPhones[0] : scraped.phones[0];
      updated = true;
    }

    if (scraped.socials.linkedin || scraped.socials.facebook || scraped.socials.instagram || scraped.socials.twitter) {
      enriched.socialLinks = {
        ...(enriched.socialLinks || {}),
        ...scraped.socials,
      };
      updated = true;
    }

    if (updated) {
      const alreadyHasSource = enriched.sources.some((s) => s.type === 'flare_bypass');
      if (!alreadyHasSource) {
        enriched.sources.push({ type: 'flare_bypass', name: 'FlareSolverr Bypass', url: websiteToScrape });
      }
      // Clear the cloudflare error since we got data through Flare
      if (enriched.enrichmentError === 'cloudflare lock') {
        enriched.enrichmentError = undefined;
      }
      console.log(`[Enrich] FlareSolverr found data for ${websiteToScrape}: email=${scraped.emails.length}, phone=${scraped.phones.length}, social=${Object.keys(scraped.socials).length}`);
    } else {
      console.log(`[Enrich] FlareSolverr got nothing for ${websiteToScrape}`);
    }
  } catch (error: any) {
    console.warn(`[Enrich] FlareSolverr scrape failed for ${websiteToScrape}: ${error?.message}`);
  }

  return enriched;
}

/**
 * Enrich a batch of leads with 2-pass logic.
 *
 * Pass 1: Normal enrichment (fetch → browser scraper → directories).
 * Pass 2: Leads that got "cloudflare lock" are retried through FlareSolverr bypass.
 */
export async function enrichLeadBatch(
  leads: Lead[],
  onUpdate: EnrichmentCallback,
  concurrency: number = 3
): Promise<Lead[]> {
  // ── Pass 1: Normal enrichment ──
  console.log(`[Enrich] Pass 1 — normal enrichment for ${leads.length} leads`);
  const pass1Results: Lead[] = [];

  for (let i = 0; i < leads.length; i += concurrency) {
    const chunk = leads.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((leadItem) => enrichLead(leadItem, onUpdate))
    );

    chunkResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        pass1Results.push(result.value);
      } else {
        const failedLead = {
          ...chunk[index],
          enrichmentStatus: 'failed' as const,
          enrichmentError: result.reason?.message || 'Enrichment failed',
        };
        pass1Results.push(failedLead);
        onUpdate(failedLead);
      }
    });

    if (i + concurrency < leads.length) {
      await randomDelay(3000, 6000);
    }
  }

  // ── Pass 2: Retry cloudflare-blocked leads through FlareSolverr ──
  const cloudflareLeads = pass1Results.filter(
    (l) => l.enrichmentError === 'cloudflare lock' && l.website
  );

  if (cloudflareLeads.length > 0) {
    console.log(`[Enrich] Pass 2 — retrying ${cloudflareLeads.length} cloudflare-blocked leads through FlareSolverr`);

    // 5-10s delay before starting pass 2 (real person pauses between attempts)
    await randomDelay(5000, 10000);

    for (let i = 0; i < cloudflareLeads.length; i += concurrency) {
      const chunk = cloudflareLeads.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(
        chunk.map((leadItem) => enrichWithFlare(leadItem, onUpdate))
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          // Update the original lead in pass1Results
          const idx = pass1Results.findIndex((l) => l.id === result.value.id);
          if (idx !== -1) {
            pass1Results[idx] = result.value;
          }
        }
      });

      if (i + concurrency < cloudflareLeads.length) {
        await randomDelay(3000, 6000);
      }
    }
  }

  // ── Final status for all leads ──
  for (const lead of pass1Results) {
    lead.enrichmentStatus = lead.enrichmentError ? 'failed' : 'complete';
    lead.updatedAt = new Date().toISOString();
    onUpdate(lead);
  }

  return pass1Results;
}
