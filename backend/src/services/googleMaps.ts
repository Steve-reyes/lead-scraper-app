/**
 * Google Maps scraper — real browser-based extraction via Puppeteer + Chrome CDP.
 *
 * 1. Search Google Maps, scroll feed, collect listing cards with place URLs
 * 2. Open new tabs (parallel) to extract website from each place page
 * 3. Returns leads with name, address, rating, website
 */

import puppeteer, { Page, Browser } from 'puppeteer';
import { v4 as uuidv4 } from 'uuid';
import { Lead, SearchRequest } from '../types';
import { normalizeBusinessName } from '../utils/validators';
import { getRandomUserAgent } from '../utils/userAgents';

const CHROME_CDP = process.env.CHROME_CDP_URL || 'ws://127.0.0.1:3012';

function delay(min = 2000, max = 5000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

async function scrollResultsPanel(page: Page): Promise<void> {
  for (const sel of ['div[role="feed"]', 'div.m6QErb[aria-label*="Results"]']) {
    const el = await page.$(sel).catch(() => null);
    if (el) {
      await page.evaluate((s: string) => {
        const c = document.querySelector(s);
        if (c) c.scrollTop = c.scrollHeight;
      }, sel);
      return;
    }
  }
}

interface ListingRef {
  name: string;
  address: string;
  rating: number | undefined;
  reviewCount: number | undefined;
  placeId: string;
  placeUrl: string;
  website: string | null;
}

async function extractListingRefs(page: Page): Promise<ListingRef[]> {
  await delay(1000, 2000);
  return page.evaluate(() => {
    const items: ListingRef[] = [];
    let cards: Element[] = Array.from(document.querySelectorAll('div[role="article"].Nv2PK'));
    if (!cards.length) {
      const feed = document.querySelector('[role="feed"]');
      if (feed) cards = Array.from(feed.children).filter(c => c.tagName === 'DIV' && c.querySelector('a[href*="/maps/place/"]'));
    }
    if (!cards.length) {
      const found = document.querySelectorAll('a[href*="place/"][role="link"]');
      if (found.length) cards = Array.from(found).map(a => a.closest('div') || a);
    }
    cards.forEach(card => {
      const anchor = card.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement | null;
      let href = anchor?.href || '';
      let placeId = '';
      if (href) { const m = href.match(/!1s([^!]+)/); if (m) placeId = m[1]; }
      const nameEl = card.querySelector('.qBF1Pd, .fontHeadlineSmall');
      const name = nameEl?.textContent?.trim() || '';
      if (!name) return;
      const ratingEl = card.querySelector('.MW4etd');
      let rating: number | undefined;
      if (ratingEl) { const r = ratingEl.textContent?.trim().replace(',', '.');
        if (r) rating = parseFloat(r); }
      let reviewCount: number | undefined;
      const ct = card.textContent || '';
      const rm = ct.match(/\((\d+[\d,]*)\)/);
      if (rm) reviewCount = parseInt(rm[1].replace(/,/g, ''));
      const addrEl = card.querySelector('.W4Efsd');
      const address = addrEl?.textContent?.trim() || '';
      if (href && !href.startsWith('http')) href = 'https://www.google.com' + href;
      items.push({ name, address, rating, reviewCount, placeId, placeUrl: href, website: null });
    });
    return items;
  });
}

/**
 * Open a new browser tab, navigate to a GMaps place page, extract the website link.
 */
async function extractWebsiteFromPlace(browser: Browser, placeUrl: string): Promise<string | null> {
  if (!placeUrl) return null;
  let tab: Page | null = null;
  try {
    tab = await browser.newPage();
    await tab.setUserAgent(getRandomUserAgent());
    await tab.goto(placeUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2000));

    const website = await tab.evaluate(() => {
      // Look for a link labeled as website
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      let fallback: string | null = null;
      for (const link of allLinks) {
        const a = link as HTMLAnchorElement;
        const href = a.href.trim();
        if (href && href.startsWith('http') && !href.match(/google\./) && !href.includes('gstatic') && !href.includes('googleapis')) {
          const text = a.textContent?.toLowerCase() || '';
          const tooltip = a.getAttribute('data-tooltip')?.toLowerCase() || '';
          if (text.includes('website') || tooltip.includes('website')) return href;
          if (!fallback && !href.includes('maps')) fallback = href;
        }
      }
      return fallback;
    });

    return website;
  } catch {
    return null;
  } finally {
    if (tab) { try { await tab.close(); } catch {} }
  }
}

/**
 * Search Google Maps — collect listings, extract websites in parallel via new tabs.
 */
export async function searchGoogleMaps(request: SearchRequest): Promise<Lead[]> {
  const { keyword, location, maxResults = 30, radiusKm, country } = request;
  console.log(`[GMaps] Searching for "${keyword}" in "${location}"...`);

  const seenNames = new Set<string>();
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Discover CDP endpoint
    let browserWSEndpoint = CHROME_CDP;
    if (!/\/devtools\//.test(browserWSEndpoint)) {
      let baseUrl = browserWSEndpoint;
      if (baseUrl.startsWith('ws://')) baseUrl = 'http://' + baseUrl.slice(5);
      if (baseUrl.startsWith('wss://')) baseUrl = 'https://' + baseUrl.slice(6);
      if (!baseUrl.startsWith('http')) baseUrl = `http://${baseUrl}`;
      baseUrl = baseUrl.replace(/\/+$/, '');
      try {
        const resp = await fetch(`${baseUrl}/json/version`);
        const data = await resp.json() as { webSocketDebuggerUrl: string };
        browserWSEndpoint = data.webSocketDebuggerUrl;
      } catch {}
    }

    browser = await puppeteer.connect({ browserWSEndpoint, defaultViewport: { width: 1280, height: 800 } });
    page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent());

    const searchTerm = radiusKm && radiusKm > 0 ? `${keyword} within ${radiusKm}km of ${location}` : `${keyword} ${location}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}/`;

    console.log(`[GMaps] Loading search page...`);
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await delay(3000, 5000);

    // Cookie consent
    try {
      const handled = await page.evaluate(() => {
        for (const btn of Array.from(document.querySelectorAll('button'))) {
          const t = btn.textContent?.toLowerCase() || '';
          if (t.includes('accept all') || t.includes('reject all')) { (btn as HTMLButtonElement).click(); return true; }
        }
        return false;
      });
      if (handled) { console.log('[GMaps] Consent handled'); await delay(2000, 3000); }
    } catch {}

    // Wait for results
    try { await page.waitForSelector('[role="feed"]', { timeout: 20000 }); } catch {
      try { await page.waitForSelector('div[role="article"]', { timeout: 10000 }); } catch {}
    }
    await delay(2000, 4000);

    // Phase 1: Scroll + collect
    const collectedRefs: ListingRef[] = [];
    let emptyScrolls = 0;

    while (collectedRefs.length < maxResults && emptyScrolls < 3) {
      const newRefs = await extractListingRefs(page);
      let added = 0;
      for (const ref of newRefs) {
        if (collectedRefs.length >= maxResults) break;
        const norm = normalizeBusinessName(ref.name);
        if (seenNames.has(norm) || !ref.placeUrl) continue;
        seenNames.add(norm);
        collectedRefs.push(ref);
        added++;
      }
      if (added === 0) { emptyScrolls++; } else { emptyScrolls = 0; }
      console.log(`[GMaps] Collected ${collectedRefs.length}/${maxResults}`);
      await scrollResultsPanel(page);
      await delay(2500, 4500);
    }

    console.log(`[GMaps] Collected ${collectedRefs.length} listings. Extracting websites...`);

    // Phase 2: Extract websites in parallel (3 tabs at a time)
    const CONCURRENT = 3;
    for (let i = 0; i < collectedRefs.length; i += CONCURRENT) {
      const batch = collectedRefs.slice(i, i + CONCURRENT);
      const results = await Promise.allSettled(
        batch.map((ref) => extractWebsiteFromPlace(browser!, ref.placeUrl))
      );
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value) {
          collectedRefs[i + idx].website = result.value;
        }
      });
    }

    // Log results
    for (const ref of collectedRefs) {
      if (ref.website) console.log(`  -> ${ref.name}: ${ref.website}`);
    }

    // Build leads
    const leads: Lead[] = collectedRefs.map((ref) => ({
      id: uuidv4(),
      businessName: ref.name,
      normalizedName: normalizeBusinessName(ref.name),
      address: ref.address,
      city: location.split(',')[0].trim(),
      country: request.country || 'United States',
      website: ref.website || undefined,
      rating: ref.rating,
      reviewCount: ref.reviewCount,
      googlePlaceId: ref.placeId ? `ChIJ${ref.placeId}` : uuidv4(),
      socialLinks: {},
      sources: [{ type: 'google_maps', name: 'Google Maps' }],
      enrichmentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await page.close().catch(() => {});
    console.log(`[GMaps] Done. ${leads.length} results (${leads.filter(l => l.website).length} with websites).`);
    return leads;

  } catch (error: any) {
    console.error(`[GMaps] Error: ${error?.message || error}`);
    return [];
  } finally {
    if (page) { try { await page.close(); } catch {} }
  }
}
