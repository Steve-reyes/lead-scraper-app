/**
 * LinkedIn enrichment service — uses Chrome CDP to scrape LinkedIn company pages.
 *
 * Searches Google for LinkedIn company/in profile URLs for the business,
 * then visits them via the browser to extract available info.
 *
 * Note: Full LinkedIn Sales Navigator scraping requires a logged-in session.
 * This searches public LinkedIn pages + Google for LinkedIn references.
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { DirectoryResult } from '../types';
import { extractEmails, extractPhones } from '../utils/validators';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance;
  let endpoint = CHROME_CDP;
  if (!endpoint.includes('/devtools/')) {
    let base = endpoint;
    if (base.startsWith('ws://')) base = 'http://' + base.slice(5);
    if (base.startsWith('wss://')) base = 'https://' + base.slice(6);
    if (!base.startsWith('http')) base = 'http://' + base;
    base = base.replace(/\/+$/, '');
    try {
      const r = await fetch(`${base}/json/version`);
      const d = await r.json() as any;
      endpoint = d.webSocketDebuggerUrl;
    } catch {}
  }
  browserInstance = await puppeteer.connect({ browserWSEndpoint: endpoint });
  return browserInstance;
}

/**
 * Search Google for LinkedIn company profile of a business.
 * Then try to visit the LinkedIn URL via browser.
 */
export async function searchLinkedIn(businessName: string, city: string): Promise<DirectoryResult | null> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await getBrowser();
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Step 1: Search Google for LinkedIn URL
    const query = encodeURIComponent(`"${businessName}" "${city}" site:linkedin.com/company OR site:linkedin.com/in`);
    await page.goto(`https://www.google.com/search?q=${query}&hl=en`, {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Extract LinkedIn URL from Google results
    const linkedinUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="linkedin.com"]'));
      for (const link of links) {
        const a = link as HTMLAnchorElement;
        const href = a.href;
        if (href.includes('linkedin.com/company') || href.includes('linkedin.com/in')) {
          // Clean LinkedIn redirect URLs
          const match = href.match(/https?:\/\/(?:www\.)?linkedin\.com\/(company|in)\/[^/?&]+/);
          if (match) return match[0];
          return href;
        }
      }
      return null;
    });

    if (!linkedinUrl) {
      console.log(`[LinkedIn] No LinkedIn URL found for "${businessName}"`);
      return null;
    }

    console.log(`[LinkedIn] Found URL: ${linkedinUrl}`);

    // Step 2: Visit LinkedIn page
    try {
      await page.goto(linkedinUrl, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise((r) => setTimeout(r, 3000));
    } catch {
      // LinkedIn might redirect to login — that's OK, we got the URL
      return {
        businessName,
        phone: undefined,
        website: linkedinUrl,
        email: undefined,
        source: { type: 'directory', name: 'LinkedIn' },
      };
    }

    // Step 3: Extract available info from the LinkedIn page
    const info = await page.evaluate(() => {
      const text = document.body?.textContent || '';
      const result: { phone?: string; website?: string; email?: string } = {};

      // Look for website link on LinkedIn company page
      const links = Array.from(document.querySelectorAll('a[href]'));
      for (const link of links) {
        const a = link as HTMLAnchorElement;
        const href = a.href;
        if (href && href.startsWith('http') && !href.includes('linkedin.com') && !href.includes('google.com')) {
          if (!result.website) result.website = href;
        }
      }

      // Extract email from page text
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) result.email = emailMatch[0];

      // Extract phone
      const phoneMatch = text.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
      if (phoneMatch) result.phone = phoneMatch[0];

      return result;
    });

    return {
      businessName,
      phone: info.phone,
      website: linkedinUrl,
      email: info.email,
      source: { type: 'directory', name: 'LinkedIn' },
    };
  } catch (error: any) {
    console.warn(`[LinkedIn] Error: ${error?.message || error}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}
