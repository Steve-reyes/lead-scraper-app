/**
 * Google Search service — finds the most relevant business website
 * by searching Google for the business name + location.
 *
 * Used by the enrichment worker before website scraping.
 * Routes through FlareSolverr to bypass Google's anti-bot.
 */

import { load } from 'cheerio';

const FLARESOLVER_URL = process.env.FLARESOLVER_URL || 'http://127.0.0.1:8191/v1';
const REQUEST_TIMEOUT = 25000;

/**
 * Fetch a URL through FlareSolverr and return the raw HTML.
 */
async function fetchThroughFlare(url: string): Promise<string | null> {
  try {
    const resp = await fetch(FLARESOLVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.get',
        url,
        maxTimeout: REQUEST_TIMEOUT,
      }),
    });

    const data = await resp.json() as any;
    if (data.status !== 'ok') {
      console.warn(`[GoogleSearch] FlareSolverr error: ${data.message || data.status}`);
      return null;
    }

    return data.solution?.response || null;
  } catch (error: any) {
    console.warn(`[GoogleSearch] Request failed: ${error?.message || error}`);
    return null;
  }
}

/**
 * Extract business website from a Google Search result.
 * Returns the first non-Google, non-social, relevant link.
 */
function extractBusinessWebsite(html: string, businessName: string): string | null {
  const $ = load(html);

  // URLs to skip
  const skipDomains = [
    'google.com', 'youtube.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'linkedin.com', 'yelp.com', 'yellowpages.com',
    'manta.com', 'bbb.org', 'trustpilot.com', 'maps.google.com',
    'pinterest.com', 'tiktok.com',
  ];

  let bestLink: string | null = null;
  let bestScore = 0;

  // Look at organic search results
  $('a[href^="http"]').each((_: number, el: any) => {
    const href = $(el).attr('href') || '';

    // Decode google redirect URLs
    let url = href;
    if (url.includes('/url?q=')) {
      const m = url.match(/\/url\?q=([^&]+)/);
      if (m) url = decodeURIComponent(m[1]);
    }

    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();

      // Skip known non-business domains
      if (skipDomains.some((d) => domain.includes(d))) return;

      // Skip ads
      if (url.includes('googleadservices') || url.includes('/aclk?')) return;

      // Score: higher if business name appears in the link text or URL
      const linkText = $(el).text().toLowerCase();
      const bizLower = businessName.toLowerCase();
      let score = 1;

      if (linkText.includes(bizLower) || url.toLowerCase().includes(bizLower)) {
        score += 5; // Strong match
      }

      // Prefer .com/.ca/.co.uk etc over blogspot/wix subdomains
      if (!domain.includes('blogspot') && !domain.includes('wixsite') && !domain.includes('squarespace')) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLink = url;
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return bestLink;
}

/**
 * Search Google for a business name + location and return the best matching website.
 */
export async function findBusinessWebsite(
  businessName: string,
  city: string,
): Promise<string | null> {
  try {
    const query = encodeURIComponent(`"${businessName}" ${city}`);
    const url = `https://www.google.com/search?q=${query}&hl=en`;

    const html = await fetchThroughFlare(url);
    if (!html) {
      console.warn(`[GoogleSearch] No HTML returned for "${businessName}"`);
      return null;
    }

    const website = extractBusinessWebsite(html, businessName);
    if (website) {
      console.log(`[GoogleSearch] Found website for "${businessName}": ${website}`);
    } else {
      console.log(`[GoogleSearch] No website found for "${businessName}"`);
    }

    return website;
  } catch (error: any) {
    console.warn(`[GoogleSearch] Error: ${error?.message || error}`);
    return null;
  }
}
