/**
 * Directory fallback service.
 * Queries Google Maps detail pages via Chrome CDP for business contact info.
 *
 * Uses Google Maps via Puppeteer since Yelp/YellowPages are blocked.
 * Google Maps has phone + website for most businesses.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { DirectoryResult } from '../types';
import { getRandomUserAgent } from '../utils/userAgents';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';
const PAGE_TIMEOUT = 25000;
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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
 * Search Google Maps for a business and extract phone + website from its detail panel.
 */
async function searchGoogleMapsDetail(
  businessName: string,
  city: string
): Promise<{ phone?: string; website?: string } | null> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());

    const query = encodeURIComponent(`${businessName} ${city}`);
    await page.goto(`https://www.google.com/maps/search/${query}/`, {
      waitUntil: 'networkidle2',
      timeout: PAGE_TIMEOUT,
    });

    // Let results render + handle cookie banner
    await page.evaluate(() => new Promise((r) => setTimeout(r, 3000)));

    // Accept cookies if shown
    try {
      await page.evaluate(() => {
        for (const btn of Array.from(document.querySelectorAll('button'))) {
          const t = btn.textContent?.toLowerCase() || '';
          if (t.includes('accept all')) { (btn as HTMLButtonElement).click(); break; }
        }
      });
    } catch {}

    // Click first result to open detail panel
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      for (const link of links) {
        const a = link as HTMLAnchorElement;
        if (a.href && a.offsetParent !== null) {
          a.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) return null;

    // Wait for detail panel
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500)));

    const detail = await page.evaluate(() => {
      const result: { phone?: string; website?: string } = {};

      // Phone from tel: link
      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
      if (telLinks.length > 0) {
        result.phone = (telLinks[0] as HTMLAnchorElement).href.replace('tel:', '').trim();
      }

      // Website — look for button with globe icon or data-tooltip
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      for (const link of allLinks) {
        const a = link as HTMLAnchorElement;
        const href = a.href.trim();
        if (!result.website && href && href.startsWith('http') && !href.includes('google.com') && !href.includes('maps')) {
          result.website = href;
        }
      }

      // Fallback phone from text
      if (!result.phone) {
        const text = document.body?.textContent || '';
        const m = text.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
        if (m) result.phone = m[0];
      }

      return result;
    });

    return detail.phone || detail.website ? detail : null;
  } catch (error: any) {
    console.warn(`[GMaps Fallback] Error: ${error?.message || error}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}

/**
 * Fallback: search Google Maps detail for phone + website.
 */
export async function findInDirectories(
  businessName: string,
  city: string,
  _country: string
): Promise<DirectoryResult | null> {
  const result = await searchGoogleMapsDetail(businessName, city);
  if (!result) return null;
  if (!result.phone && !result.website) return null;
  return {
    businessName,
    phone: result.phone,
    website: result.website,
    email: undefined,
    source: { type: 'google_maps', name: 'Google Maps Detail' },
  };
}

/**
 * Merge directory result into lead.
 */
export function mergeDirectoryResult(
  lead: { phone?: string; email?: string; website?: string },
  dirResult: DirectoryResult
): { phone?: string; email?: string; website?: string } {
  return {
    phone: lead.phone || dirResult.phone || undefined,
    email: lead.email || dirResult.email || undefined,
    website: lead.website || dirResult.website || undefined,
  };
}
