/**
 * Google Search via headless Chrome CDP (Puppeteer).
 * Finds the best matching business website by searching Google
 * for the business name + city.
 *
 * If the best match is a listing/directory site (yelp, yellowpages, etc.),
 * it opens that listing page and extracts the business's own website link.
 * Then returns that real business website for scraping.
 */

import puppeteer, { Browser, Page } from 'puppeteer';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';
const PAGE_TIMEOUT = 20000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Listing/directory sites — if the best result is one of these,
// we open the listing page and look for the business's own website link
const LISTING_DOMAINS = [
  'yelp.com', 'yelp.ca', 'yellowpages.com', 'yellowpages.ca',
  'foursquare.com', 'tripadvisor.com', 'hotfrog.com', 'cylex.com',
  'cylex.es', 'cylex.us', 'kudzu.com', 'merchantcircle.com',
  'superpages.com', 'citysearch.com', 'local.com',
  'chamberofcommerce.com', 'buzzfile.com', 'bbb.org', 'trustpilot.com',
  'manta.com', 'whitepages.com',
];

let browserInstance: Browser | null = null;

async function getBrowserWSEndpoint(): Promise<string> {
  let endpoint = CHROME_CDP;
  if (!endpoint.includes('/devtools/')) {
    let baseUrl = endpoint;
    if (baseUrl.startsWith('ws://')) baseUrl = 'http://' + baseUrl.slice(5);
    if (baseUrl.startsWith('wss://')) baseUrl = 'https://' + baseUrl.slice(6);
    if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
    baseUrl = baseUrl.replace(/\/+$/, '');
    try {
      const resp = await fetch(`${baseUrl}/json/version`);
      const data = await resp.json() as { webSocketDebuggerUrl: string };
      endpoint = data.webSocketDebuggerUrl;
    } catch {
      // use as-is
    }
  }
  return endpoint;
}

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  const wsEndpoint = await getBrowserWSEndpoint();
  browserInstance = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: { width: 1280, height: 800 },
  });
  return browserInstance;
}

/**
 * Check if a domain is a listing/directory site.
 */
function isListingDomain(domain: string): boolean {
  const d = domain.replace(/^www\./, '').toLowerCase();
  return LISTING_DOMAINS.some((ld) => d === ld || d.endsWith('.' + ld));
}

/**
 * Open a listing page in Chrome and extract the business's own website link.
 */
async function extractWebsiteFromListingPage(
  listingUrl: string,
  businessName: string,
): Promise<string | null> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    await page.goto(listingUrl, {
      waitUntil: 'networkidle2',
      timeout: PAGE_TIMEOUT,
    });

    await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));

    // Find all links on the listing page, pick the one that looks like the business's own website
    const websiteUrl = await page.evaluate((bizName: string) => {
      const biz = bizName.toLowerCase();
      let bestUrl = '';
      let bestScore = 0;

      const anchors = document.querySelectorAll('a[href^="http"]');
      anchors.forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.href.toLowerCase();
        const text = (a.textContent || '').trim().toLowerCase();

        try {
          const parsed = new URL(a.href);
          const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();

          // Skip the listing site itself, socials, maps
          if (href.includes('yelp.com') || href.includes('yellowpages') ||
              href.includes('foursquare') || href.includes('tripadvisor') ||
              href.includes('facebook.com') || href.includes('instagram.com') ||
              href.includes('twitter.com') || href.includes('linkedin.com') ||
              href.includes('mapquest') || href.includes('google.com/maps')) {
            return;
          }

          // Score: higher if business name matches
          let score = 0;
          if (href.includes(biz)) score += 10;
          if (text.includes('website') || text.includes('visit') || text.includes('www') ||
              text.includes('official') || text.includes('site')) {
            score += 5;
          }
          if (text.includes(biz)) score += 8;

          // Prefer clean domain over subdomain free hosts
          if (!domain.includes('blogspot') && !domain.includes('wixsite') &&
              !domain.includes('squarespace') && !domain.includes('weebly')) {
            score += 2;
          }

          if (score > bestScore) {
            bestScore = score;
            bestUrl = a.href;
          }
        } catch {}
      });

      return bestUrl || null;
    }, businessName);

    if (websiteUrl) {
      console.log(`[GoogleSearch] Extracted business website from listing: ${websiteUrl}`);
    }
    return websiteUrl;
  } catch (error: any) {
    console.warn(`[GoogleSearch] Failed to extract from listing: ${error?.message || error}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * Search Google via headless Chrome, find the best matching business website.
 * If the best match is a listing site, opens that listing to find the real business site.
 */
export async function findBusinessWebsite(
  businessName: string,
  city: string,
): Promise<string | null> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    const query = encodeURIComponent(`"${businessName}" ${city}`);
    await page.goto(`https://www.google.com/search?q=${query}&hl=en`, {
      waitUntil: 'networkidle2',
      timeout: PAGE_TIMEOUT,
    });

    await page.evaluate(() => new Promise((r) => setTimeout(r, 2000)));

    // Find the best result URL from Google
    const bestResultUrl = await page.evaluate((bizName: string) => {
      const skipDomains = [
        'mapquest.com', 'mapquest.ca', 'maps.google.com', 'mappy.com',
        'openstreetmap.org', 'waze.com', 'here.com', 'tomtom.com',
      ];

      function getScore(url: string, linkText: string): number {
        try {
          const parsed = new URL(url);
          const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
          for (const d of skipDomains) {
            if (domain === d || domain.endsWith('.' + d)) return -1;
          }
          if (url.includes('googleadservices') || url.includes('/aclk?')) return -1;
          const biz = bizName.toLowerCase();
          let score = 1;
          if (url.toLowerCase().includes(biz)) score += 10;
          if (linkText.toLowerCase().includes(biz)) score += 8;
          if (!domain.includes('blogspot') && !domain.includes('wixsite') &&
              !domain.includes('squarespace') && !domain.includes('weebly')) {
            score += 2;
          }
          const parts = domain.split('.');
          if (parts.length > 3) score -= 2;
          return score;
        } catch { return -1; }
      }

      const anchors = document.querySelectorAll('a[href^="http"]');
      let best = { url: '', score: 0 };
      anchors.forEach((el) => {
        const a = el as HTMLAnchorElement;
        let href = a.href;
        if (href.startsWith('https://www.google.com/url?q=')) {
          const m = href.match(/[?&]q=([^&]+)/);
          if (m) href = decodeURIComponent(m[1]);
        }
        const text = (a.textContent || '').trim();
        if (!href || !text) return;
        const score = getScore(href, text);
        if (score > best.score) {
          best = { url: href, score };
        }
      });
      return best.score > 0 ? best.url : null;
    }, businessName);

    if (!bestResultUrl) {
      console.log(`[GoogleSearch] No suitable result for "${businessName}"`);
      return null;
    }

    // Check if the best result is a listing site
    try {
      const domain = new URL(bestResultUrl).hostname.replace(/^www\./, '').toLowerCase();
      if (isListingDomain(domain)) {
        console.log(`[GoogleSearch] Best result is a listing site: ${bestResultUrl}`);
        console.log(`[GoogleSearch] Opening listing to find real business website...`);
        // Close the Google search page
        if (page) { try { await page.close(); } catch {} page = null; }

        // Open the listing page and extract the business website
        const businessWebsite = await extractWebsiteFromListingPage(bestResultUrl, businessName);
        if (businessWebsite) {
          return businessWebsite;
        }

        // If we couldn't extract from the listing, fall back to the listing URL itself
        console.log(`[GoogleSearch] Could not extract from listing, returning listing URL`);
        return bestResultUrl;
      }
    } catch {
      // Invalid URL, just return it
    }

    console.log(`[GoogleSearch] Best match for "${businessName}": ${bestResultUrl}`);
    return bestResultUrl;
  } catch (error: any) {
    console.warn(`[GoogleSearch] Error: ${error?.message || error}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}
