/**
 * Web scraping service for enrichment fallback.
 * Scrapes business websites and directory pages for contact info.
 */

import { load } from 'cheerio';
import { getRandomUserAgent } from '../utils/userAgents';
import { getLimiterForDomain } from '../utils/rateLimiter';
import { ScrapedContact } from '../types';
import { extractEmails, extractPhones, extractSocials } from '../utils/validators';

const REQUEST_TIMEOUT = 15000;

/**
 * Fetch a URL with timeout, retry, and rotating user-agents.
 */
async function fetchWithRetry(url: string, retries = 2): Promise<string | null> {
  const urlObj = new URL(url);
  const limiter = getLimiterForDomain(urlObj.hostname);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await limiter.consume(urlObj.hostname);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[Scraper] HTTP ${response.status} for ${url}`);
        if (response.status === 429) {
          // Rate limited - wait longer before retry
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        return null;
      }

      const text = await response.text();
      return text;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.warn(`[Scraper] Timeout for ${url}`);
      } else {
        console.warn(`[Scraper] Error fetching ${url}: ${error?.message || error}`);
      }

      if (attempt < retries) {
        const delay = (attempt + 1) * 2000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return null;
}

/**
 * Scrape a single page for contact info.
 */
function scrapePageContent(html: string, baseUrl: string): ScrapedContact {
  const $ = load(html);
  const text = $('body').text();
  const fullHtml = html;

  const emails = extractEmails(fullHtml);
  const phones = extractPhones(text);
  const socials = extractSocials(fullHtml, baseUrl);

  // Filter out common false positives
  const filteredEmails = emails.filter(
    (e) =>
      !e.includes('example.com') &&
      !e.includes('domain.com') &&
      !e.includes('@yoursite.com') &&
      !e.endsWith('.png') &&
      !e.endsWith('.jpg') &&
      !e.endsWith('.gif') &&
      !e.endsWith('.svg') &&
      e.split('@')[1]?.includes('.')
  );

  // Filter out fax numbers from phones (common in business listings)
  const filteredPhones = phones.filter((p) => !text.toLowerCase().slice(Math.max(0, text.indexOf(p) - 30), text.indexOf(p) + p.length + 10).includes('fax'));

  return {
    emails: [...new Set(filteredEmails)],
    socials,
    phones: [...new Set(filteredPhones)],
  };
}

/**
 * Full website scrape: homepage + /contact + /about.
 */
export async function scrapeWebsite(websiteUrl: string): Promise<ScrapedContact> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

  const pagesToScrape = [
    url,
    `${url.replace(/\/$/, '')}/contact`,
    `${url.replace(/\/$/, '')}/about`,
    `${url.replace(/\/$/, '')}/contact-us`,
    `${url.replace(/\/$/, '')}/about-us`,
  ];

  const combined: ScrapedContact = {
    emails: [],
    socials: {},
    phones: [],
  };

  const results = await Promise.allSettled(
    pagesToScrape.map(async (pageUrl) => {
      const html = await fetchWithRetry(pageUrl);
      if (!html) return null;
      return scrapePageContent(html, url);
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      combined.emails.push(...result.value.emails);
      combined.phones.push(...result.value.phones);
      combined.socials = { ...combined.socials, ...result.value.socials };
    }
  }

  combined.emails = [...new Set(combined.emails)];
  combined.phones = [...new Set(combined.phones)];

  return combined;
}

/**
 * Scrape a generic HTML page and extract structured text.
 */
export async function fetchAndParse(url: string): Promise<{ html: string; text: string } | null> {
  const html = await fetchWithRetry(url);
  if (!html) return null;

  const $ = load(html);
  const text = $('body').text().replace(/\s+/g, ' ').trim();

  return { html, text };
}
