/**
 * Puppeteer-based website scraper — handles JS-rendered content.
 * Falls back to this when the basic fetch scraper returns no data.
 * Mimics human browsing: random delays, viewport sizes, scrolls.
 * Skips Cloudflare-protected sites (too memory-intensive to bypass).
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { getRandomUserAgent } from '../utils/userAgents';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';
const PAGE_TIMEOUT = 15000;
const NEW_PAGE_TIMEOUT = 8000; // max wait for browser.newPage()

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
    /(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /\+\d{1,3}\s?\d{6,14}/g,
  ];
  const phones: string[] = [];
  for (const r of regexes) {
    const m = text.match(r);
    if (m) phones.push(...m);
  }
  return [...new Set(phones)];
}

// ── Cloudflare detection ──

function isCloudflareChallenge(title: string, bodyText: string, html: string): boolean {
  const lower = (title + ' ' + bodyText).toLowerCase();
  if (lower.includes('just a moment') || lower.includes('security verification') ||
      lower.includes('checking your browser')) return true;
  if (html.includes('cf-mitigated') || html.includes('challenge-platform') ||
      html.includes('challenges.cloudflare.com')) return true;
  return false;
}

// ── Human-like browsing helpers ──

/**
 * Random delay between min and max milliseconds.
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Random viewport size to avoid consistent fingerprinting.
 */
function randomViewport(): { width: number; height: number } {
  const widths = [1280, 1366, 1440, 1536, 1600, 1920];
  const heights = [720, 768, 800, 900, 1024];
  return {
    width: widths[Math.floor(Math.random() * widths.length)],
    height: heights[Math.floor(Math.random() * heights.length)],
  };
}

/**
 * Scroll down a random amount to mimic human reading.
 */
async function humanScroll(page: Page): Promise<void> {
  try {
    const amount = Math.floor(Math.random() * 300) + 100;
    await page.evaluate((y: number) => window.scrollBy(0, y), amount);
    await randomDelay(300, 800);
  } catch {}
}

/**
 * Scrape a website using headless Chrome CDP with human-like behavior.
 * Adds random delays between pages, varied viewports, and scrolls.
 * Skips Cloudflare-protected sites.
 */
export async function scrapeWebsiteWithBrowser(
  websiteUrl: string,
): Promise<{ emails: string[]; phones: string[] }> {
  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

  // Only try homepage + first contact page to avoid CDP overload
  const pagesToScrape = [
    url,
    `${url.replace(/\/$/, '')}/contact`,
  ];

  let browser: Browser | null = null;

  try {
    browser = await getBrowser();

    const allEmails: string[] = [];
    const allPhones: string[] = [];

    for (const pageUrl of pagesToScrape) {
      let page!: Page;
      try {
        const p = await Promise.race([
          browser.newPage(),
          new Promise<any>((_, rej) => setTimeout(() => rej(new Error('newPage timeout')), NEW_PAGE_TIMEOUT)),
        ]);
        if (!p) throw new Error('newPage returned null');
        page = p;
        const vp = randomViewport();
        await page.setViewport(vp);
        await page.setUserAgent(getRandomUserAgent());

        // Human-like 2-4s delay before navigating to next page
        await randomDelay(2000, 4000);

        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });

        // 1-2.5s delay after load + scroll
        await randomDelay(1000, 2500);
        await humanScroll(page);

        const title = await page.title();
        const content = await page.evaluate(() => document.body.innerText);
        const html = await page.evaluate(() => document.documentElement.outerHTML || '');

        // Skip Cloudflare-protected sites
        if (isCloudflareChallenge(title, content || '', html)) {
          console.log(`[BrowserScraper] Cloudflare detected on ${pageUrl}, skipping`);
          throw new Error('cloudflare lock');
        }

        const emails = extractEmails(html);
        const phones = extractPhones(content || '');

        allEmails.push(...emails);
        allPhones.push(...phones);
      } catch (innerErr: any) {
        if (innerErr?.message === 'cloudflare lock') throw innerErr;
        // Other errors: page might not exist, skip silently
      } finally {
        if (page) { try { await page.close(); } catch {} }
      }
    }

    return {
      emails: [...new Set(allEmails)],
      phones: [...new Set(allPhones)],
    };
  } catch (error: any) {
    if (error?.message === 'cloudflare lock') {
      throw error;
    }
    console.warn(`[BrowserScraper] Error: ${error?.message || error}`);
    return { emails: [], phones: [] };
  } finally {
    // Don't disconnect browser — it's shared
  }
}
