/**
 * Puppeteer-based website scraper — handles JS-rendered content.
 * Falls back to this when the basic fetch scraper returns no data.
 */

import puppeteer, { Browser, Page } from 'puppeteer';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';
const PAGE_TIMEOUT = 15000;
const USER_AGENT =
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
 * Extract emails from a string.
 */
function extractEmails(text: string): string[] {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex) || [];
  return [...new Set(matches.filter((e) => {
    try {
      const d = e.split('@')[1];
      return d && d.includes('.') && !d.includes('example.com') && !d.includes('domain.com');
    } catch { return false; }
  }))];
}

/**
 * Extract phone numbers from text.
 */
function extractPhones(text: string): string[] {
  const regexes = [
    /(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, // +1 (123) 456-7890
    /\+\d{1,3}\s?\d{6,14}/g, // international
  ];
  const phones: string[] = [];
  for (const r of regexes) {
    const m = text.match(r);
    if (m) phones.push(...m);
  }
  return [...new Set(phones)];
}

/**
 * Scrape a website using headless Chrome CDP.
 * Handles JS-rendered content that the basic fetch scraper misses.
 */
export async function scrapeWebsiteWithBrowser(
  websiteUrl: string,
): Promise<{ emails: string[]; phones: string[] }> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

  const pagesToScrape = [
    url,
    `${url.replace(/\/$/, '')}/contact`,
    `${url.replace(/\/$/, '')}/about`,
    `${url.replace(/\/$/, '')}/contact-us`,
    `${url.replace(/\/$/, '')}/about-us`,
  ];

  let browser: Browser | null = null;

  try {
    browser = await getBrowser();

    const allEmails: string[] = [];
    const allPhones: string[] = [];

    for (const pageUrl of pagesToScrape) {
      let page: Page | null = null;
      try {
        page = await browser.newPage();
        await page.setUserAgent(USER_AGENT);
        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
        // Wait a bit for JS to render
        await page.evaluate(() => new Promise((r) => setTimeout(r, 1000)));

        const content = await page.evaluate(() => document.body.innerText);
        const html = await page.evaluate(() => document.documentElement.outerHTML || '');

        const emails = extractEmails(html);
        const phones = extractPhones(content || '');

        allEmails.push(...emails);
        allPhones.push(...phones);
      } catch {
        // page might not exist, skip
      } finally {
        if (page) { try { await page.close(); } catch {} }
      }
    }

    return {
      emails: [...new Set(allEmails)],
      phones: [...new Set(allPhones)],
    };
  } catch (error: any) {
    console.warn(`[BrowserScraper] Error: ${error?.message || error}`);
    return { emails: [], phones: [] };
  } finally {
    // Don't disconnect browser — it's shared
  }
}
