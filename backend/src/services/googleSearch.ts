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
  'manta.com', 'whitepages.com', 'infobel.com', 'wheree.com',
  'canada411.ca', 'canpages.ca', '411.ca', 'findglocal.com',
  'n49.com', 'bizbangboom.com', 'nextdoor.com', 'bizcommunity.com',
  'zaubee.com', 'thebest.co', 'opendi.com', 'worldplaces.com',
  'bizpages.org', 'bizpages.com',
  'homestars.com', 'prunderground.com',
  'threebestrated.com', 'ccaward.com',
  'industryoversight.ca', 'trustedpros.ca',
  'about.me', 'homeguide.com',
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
 * Result from extracting data from a listing page.
 */
interface ListingExtractionResult {
  websiteUrl: string | null;
  email: string | null;
}

/**
 * Open a listing page in Chrome and extract the business's own website link + email.
 * Handles "Click to view email" buttons (bizpages.org, etc.) by clicking them.
 */
async function extractFromListingPage(
  listingUrl: string,
  businessName: string,
): Promise<ListingExtractionResult> {
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

    // Click "Click to view email" buttons to reveal hidden emails
    const clicked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, span, div, td'));
      for (const el of els) {
        const t = (el.textContent || '').toLowerCase().trim();
        if (t.includes('click to view email') || t === 'view email' || t.includes('show email')) {
          (el as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clicked) {
      // Wait for email to reveal
      await page.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
    }

    // Extract both website URL and email from the listing page
    const result = await page.evaluate((bizName: string) => {
      const biz = bizName.toLowerCase();
      let bestUrl = '';
      let bestScore = 0;

      // ── Extract emails from the page ──
      const allText = document.body?.innerText || '';
      const html = document.documentElement?.outerHTML || '';
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailsFound = [...new Set((html.match(emailRegex) || []).filter((e: string) => {
        try {
          const d = e.split('@')[1];
          return d && d.includes('.');
        } catch { return false; }
      }))];

      // ── Extract business website URL ──
      // Method 1: Look at all anchor tags
      const anchors = document.querySelectorAll('a[href^="http"]');
      anchors.forEach((el) => {
        const a = el as HTMLAnchorElement;
        const href = a.href.toLowerCase();
        const text = (a.textContent || '').trim().toLowerCase();

        try {
          const parsed = new URL(a.href);
          const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();

          if (href.includes('yelp') || href.includes('yellowpages') ||
              href.includes('foursquare') || href.includes('tripadvisor') ||
              href.includes('facebook') || href.includes('instagram') ||
              href.includes('twitter') || href.includes('linkedin') ||
              href.includes('mapquest') || href.includes('google.com/maps') ||
              href.includes('bbb') || href.includes('infobel') ||
              href.includes('wheree') || href.includes('bizpages') ||
              href.includes('homestars') || href.includes('prunderground') ||
              href.includes('threebestrated') || href.includes('ccaward') ||
              href.includes('industryoversight') || href.includes('trustedpros') ||
              href.includes('about.me')) {
            return;
          }

          let score = 0;
          if (href.includes(biz)) score += 10;
          if (text.includes('website') || text.includes('visit') || text.includes('www') ||
              text.includes('official') || text.includes('site') || text.includes('go to')) {
            score += 5;
          }
          if (text.includes(biz)) score += 8;
          if (!domain.includes('blogspot') && !domain.includes('wixsite') &&
              !domain.includes('squarespace') && !domain.includes('weebly')) {
            score += 2;
          }
          if (score > bestScore) { bestScore = score; bestUrl = a.href; }
        } catch {}
      });

      // Method 2: Look for "Website" label text
      if (!bestUrl) {
        const lines = allText.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase().trim();
          if (line === 'website' || line.startsWith('website:') || line.startsWith('www')) {
            const urlLine = lines[i + 1]?.trim() || line.replace(/^website:?\s*/i, '').trim();
            if (urlLine.startsWith('http')) { bestUrl = urlLine; break; }
            if (urlLine.startsWith('www')) { bestUrl = 'https://' + urlLine; break; }
          }
        }
      }

      // Method 3: Scan all visible text for http links
      if (!bestUrl) {
        const httpMatches = allText.match(/https?:\/\/[^\s)+]+/g);
        if (httpMatches) {
          for (const match of httpMatches) {
            try {
              const d = new URL(match).hostname.replace(/^www\./, '').toLowerCase();
              if (!d.includes('bbb') && !d.includes('facebook') && !d.includes('yelp') && d.includes('.')) {
                bestUrl = match; break;
              }
            } catch {}
          }
        }
      }

      return {
        websiteUrl: bestUrl || null,
        email: emailsFound.length > 0 ? emailsFound[0] : null,
      };
    }, businessName);

    if (result.websiteUrl) {
      console.log(`[GoogleSearch] Extracted business website from listing: ${result.websiteUrl}`);
    }
    if (result.email) {
      console.log(`[GoogleSearch] Extracted email from listing: ${result.email}`);
    }
    return result;
  } catch (error: any) {
    console.warn(`[GoogleSearch] Failed to extract from listing: ${error?.message || error}`);
    return { websiteUrl: null, email: null };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * Result from finding a business website via Google Search.
 */
export interface BusinessWebsiteResult {
  websiteUrl: string | null;
  email: string | null;
}

/**
 * Search Google via headless Chrome, find the best matching business website.
 * If the best match is a listing site, opens that listing to find the real business site + email.
 */
export async function findBusinessWebsite(
  businessName: string,
  city: string,
): Promise<BusinessWebsiteResult> {
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
    const bestResultUrl = await page.evaluate((bizName: string, listingDomains: string[]) => {
      const skipDomains = [
        'mapquest.com', 'mapquest.ca', 'maps.google.com', 'mappy.com',
        'openstreetmap.org', 'waze.com', 'here.com', 'tomtom.com',
        'linkedin.com', 'linkedin.ca',
        'instagram.com', 'facebook.com', 'facebook.ca', 'fb.com',
        'twitter.com', 'x.com', 'tiktok.com', 'pinterest.com',
        'youtube.com', 'youtu.be',
        // Google (catches all subdomains via endsWith check)
        'google.com', 'google.ca', 'google.co.uk',
        // Wikipedia, general reference
        'wikipedia.org', 'wikidata.org',
      ];

      function isListing(domain: string): boolean {
        const d = domain.replace(/^www\./, '').toLowerCase();
        return listingDomains.some((ld) => d === ld || d.endsWith('.' + ld));
      }

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
          // PENALTY: listing/directory sites score lower than the real business site
          if (isListing(domain)) score -= 15;
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
    }, businessName, LISTING_DOMAINS);

    if (!bestResultUrl) {
      console.log(`[GoogleSearch] No suitable result for "${businessName}"`);
      return { websiteUrl: null, email: null };
    }

    // Check if the best result is a listing site
    try {
      const domain = new URL(bestResultUrl).hostname.replace(/^www\./, '').toLowerCase();
      if (isListingDomain(domain)) {
        console.log(`[GoogleSearch] Best result is a listing site: ${bestResultUrl}`);
        console.log(`[GoogleSearch] Opening listing to find real business website...`);
        // Close the Google search page
        if (page) { try { await page.close(); } catch {} page = null; }

        // Open the listing page and extract the business website + email
        const listingResult = await extractFromListingPage(bestResultUrl, businessName);
        if (listingResult.websiteUrl) {
          return listingResult;
        }
        if (listingResult.email) {
          return { websiteUrl: null, email: listingResult.email };
        }

        console.log(`[GoogleSearch] Could not extract from listing, skipping`);
        return { websiteUrl: null, email: null };
      }
    } catch {
      // Invalid URL, just return it
    }

    console.log(`[GoogleSearch] Best match for "${businessName}": ${bestResultUrl}`);
    return { websiteUrl: bestResultUrl, email: null };
  } catch (error: any) {
    console.warn(`[GoogleSearch] Error: ${error?.message || error}`);
    return { websiteUrl: null, email: null };
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}
