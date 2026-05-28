/**
 * Deep directory scraper — routes all requests through FlareSolverr
 * to bypass Cloudflare/anti-bot protections.
 *
 * Directories queried:
 *   - Yell (UK)
 *   - Cylex (EU)
 *   - PaginasAmarillas (ES)
 *   - Hotfrog
 *   - Chamber of Commerce (US)
 *   - Buzzfile (US)
 *   - Bing Maps
 *   - Google Search
 *
 * Blocked (need proxy): Yelp, YellowPages.com, Manta
 */

import { load } from 'cheerio';
import { DirectoryResult, ScrapedContact } from '../types';
import { extractEmails, extractPhones, extractSocials } from '../utils/validators';

const FLARESOLVER_URL = process.env.FLARESOLVER_URL || 'http://127.0.0.1:8191/v1';
const REQUEST_TIMEOUT = 30000;

/**
 * Fetch a URL through FlareSolverr.
 */
async function fetchThroughFlare(url: string, sourceName: string): Promise<string | null> {
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
      console.warn(`[${sourceName}] FlareSolverr error: ${data.message || data.status}`);
      return null;
    }

    return data.solution?.response || null;
  } catch (error: any) {
    console.warn(`[${sourceName}] Request failed: ${error?.message || error}`);
    return null;
  }
}

// ── Yell.com (UK) ──

async function searchYell(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.yell.com/ucs/UcsSearchAction.do?keywords=${query}&location=${encodeURIComponent(city)}`;

    const html = await fetchThroughFlare(url, 'Yell');
    if (!html) return null;

    const $ = load(html);
    const results = $('.businessCapsule, .row.result, .listing, [itemtype="http://schema.org/LocalBusiness"]');

    if (!results.length) return null;

    const first = results.first();
    const bizName = first.find('.businessName, h2, .name, [itemprop="name"]').text().trim() || businessName;
    const ph = first.find('.phone, .telephone, a[href^="tel:"], [itemprop="telephone"]').text().trim() || undefined;
    const wsLink = first.find('a.website, a[rel="nofollow"], a[href^="http"]').not('[href*="yell.com"]').first();
    const website = wsLink.attr('href')?.trim() || undefined;

    const pageText = html;
    const emails = extractEmails(pageText);
    const email = emails.length > 0 ? emails[0] : undefined;
    const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);

    if (!phone && !email && !website) return null;

    return { businessName: bizName, phone, website, email, source: { type: 'yell', name: 'Yell' } };
  } catch {
    return null;
  }
}

// ── Cylex (EU business directory) ──

async function searchCylex(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.cylex.es/buscar?q=${query}`;

    const html = await fetchThroughFlare(url, 'Cylex');
    if (!html) return null;

    const $ = load(html);
    const results = $('.resultado, .search-item, article, [itemprop="name"]').parent();

    if (!results.length) return null;

    const first = results.first();
    const bizName = first.find('[itemprop="name"], h2, h3, .nombre').text().trim() || businessName;
    const phone = first.find('[itemprop="telephone"], a[href^="tel:"], .telefono').text().trim() || undefined;

    let website: string | undefined;
    const wsLink = first.find('a[itemprop="url"], a[href^="http"]').not('[href*="cylex"]').first();
    if (wsLink.length) website = wsLink.attr('href')?.trim() || undefined;

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    if (!phone && !email && !website) return null;
    return { businessName: bizName, phone, website, email, source: { type: 'directory', name: 'Cylex' } };
  } catch {
    return null;
  }
}

// ── PaginasAmarillas.es (Spanish Yellow Pages) ──

async function searchPaginasAmarillas(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(businessName);
    const loc = encodeURIComponent(city);
    const url = `https://www.paginasamarillas.es/buscar/${loc}/${query}`;

    const html = await fetchThroughFlare(url, 'PAmarillas');
    if (!html) return null;

    const $ = load(html);
    const results = $('.result-item, .listing-item, article, [data-result-id]');

    if (!results.length) return null;

    const first = results.first();
    const bizName = first.find('.name, h2, h3, .business-name').text().trim() || businessName;
    const phone = first.find('.phone, [itemprop="telephone"], a[href^="tel:"]').text().trim() || undefined;

    let website: string | undefined;
    const wsLink = first.find('a[href^="http"]').not('[href*="paginasamarillas"]').first();
    if (wsLink.length) website = wsLink.attr('href')?.trim() || undefined;

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    if (!phone && !email && !website) return null;
    return { businessName: bizName, phone, website, email, source: { type: 'directory', name: 'Páginas Amarillas' } };
  } catch {
    return null;
  }
}

// ── Hotfrog ──

async function searchHotfrog(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.hotfrog.com/search?q=${query}`;

    const html = await fetchThroughFlare(url, 'Hotfrog');
    if (!html) return null;

    const $ = load(html);
    const results = $('.result, .business-card, article, [data-business-id]');

    if (!results.length) return null;

    const first = results.first();
    const bizName = first.find('.name, h2, h3, .business-name').text().trim() || businessName;
    const phone = first.find('.phone, a[href^="tel:"]').text().trim() || undefined;
    const wsLink = first.find('a[href^="http"]').not('[href*="hotfrog"]').first();
    const website = wsLink.length ? wsLink.attr('href')?.trim() || undefined : undefined;

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    if (!phone && !email && !website) return null;
    return { businessName: bizName, phone, website, email, source: { type: 'directory', name: 'Hotfrog' } };
  } catch {
    return null;
  }
}

// ── ChamberOfCommerce.com (US) ──

async function searchChamberOfCommerce(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.chamberofcommerce.com/search?what=${query}&where=${encodeURIComponent(city)}`;

    const html = await fetchThroughFlare(url, 'ChamberOfCommerce');
    if (!html || html.length < 1000) return null;

    const $ = load(html);
    const pageText = $('body').text();

    // Check if business name appears in results
    const bizLower = businessName.toLowerCase();
    const nameInResults = pageText.toLowerCase().includes(bizLower);
    if (!nameInResults) return null;

    let phone: string | undefined;
    const phoneMatch = pageText.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    let website: string | undefined;
    const wsLink = $('a[href^="http"]').not('[href*="chamberofcommerce"]').first();
    if (wsLink.length) website = wsLink.attr('href')?.trim() || undefined;

    if (!phone && !email && !website) return null;
    return { businessName, phone, website, email, source: { type: 'directory', name: 'Chamber of Commerce' } };
  } catch {
    return null;
  }
}

// ── Buzzfile (US business directory) ──

async function searchBuzzfile(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.buzzfile.com/search?q=${query}`;

    const html = await fetchThroughFlare(url, 'Buzzfile');
    if (!html || html.length < 1000) return null;

    const $ = load(html);
    const pageText = $('body').text();

    const bizLower = businessName.toLowerCase();
    const nameInResults = pageText.toLowerCase().includes(bizLower);
    if (!nameInResults) return null;

    let phone: string | undefined;
    const phoneMatch = pageText.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    let website: string | undefined;
    const wsLink = $('a[href^="http"]').not('[href*="buzzfile"]').first();
    if (wsLink.length) website = wsLink.attr('href')?.trim() || undefined;

    if (!phone && !email && !website) return null;
    return { businessName, phone, website, email, source: { type: 'directory', name: 'Buzzfile' } };
  } catch {
    return null;
  }
}

// ── Google Search (finds phone/email from search snippets) ──

async function searchGoogle(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`"${businessName}" "${city}" contact email phone`);
    const url = `https://www.google.com/search?q=${query}&hl=en`;

    const html = await fetchThroughFlare(url, 'Google');
    if (!html || html.length < 2000) return null;

    const $ = load(html);
    const pageText = $('body').text();

    const bizLower = businessName.toLowerCase();
    const nameInResults = pageText.toLowerCase().includes(bizLower);
    if (!nameInResults) return null;

    let phone: string | undefined;
    // Match various phone formats in search snippets
    const phoneMatch = pageText.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    let website: string | undefined;
    $('a[href^="http"]').each((_: number, el: any) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http') && !href.match(/google\.(com|es|co\.uk)/) && !href.includes('gstatic')) {
        if (!website) website = href;
      }
    });

    if (!phone && !email && !website) return null;
    return { businessName, phone, website, email, source: { type: 'directory', name: 'Google Search' } };
  } catch {
    return null;
  }
}

// ── LinkedIn via Google (find LinkedIn profiles from search) ──

async function searchLinkedInViaGoogle(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`"${businessName}" "${city}" linkedin`);
    const url = `https://www.google.com/search?q=${query}&hl=en`;

    const html = await fetchThroughFlare(url, 'LinkedIn');
    if (!html || html.length < 2000) return null;

    const $ = load(html);
    // Extract LinkedIn URLs from search results
    let linkedinUrl: string | undefined;
    $('a[href*="linkedin.com"]').each((_: number, el: any) => {
      const href = $(el).attr('href') || '';
      if (href.includes('linkedin.com/company') || href.includes('linkedin.com/in')) {
        if (!linkedinUrl) linkedinUrl = href;
      }
    });

    if (!linkedinUrl) return null;

    return {
      businessName,
      phone: undefined,
      website: linkedinUrl,
      email: undefined,
      source: { type: 'directory', name: 'LinkedIn' },
    };
  } catch {
    return null;
  }
}

// ── Bing Maps (business listings with contact info) ──

// ── YellowPages.com.au (Australian business directory) ──

async function searchYellowPagesAU(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.yellowpages.com.au/search/listings?clue=${query}`;
    const html = await fetchThroughFlare(url, 'YellowPagesAU');
    if (!html) return null;

    const $ = load(html);
    const results = $('.listing, .result, [data-testid="listing"], .MuiPaper-root');
    if (!results.length) return null;

    const first = results.first();
    const ph = first.find('a[href^="tel:"], .contact-phone, [itemprop="telephone"]').text().trim() || undefined;
    const wsLink = first.find('a.contact-url, a[rel="noopener noreferrer"]').first();
    const website = wsLink.attr('href')?.trim() || undefined;
    const pageText = html;
    const emails = extractEmails(pageText);
    const email = emails.length > 0 ? emails[0] : undefined;
    const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);

    if (!phone && !email && !website) return null;
    return { businessName, phone, email, website, source: { type: 'yellowpages_au', name: 'YellowPages.com.au' } };
  } catch { return null; }
}

// ── TrueLocal (Australian business directory) ──

async function searchTrueLocal(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.truelocal.com.au/find?q=${query}`;
    const html = await fetchThroughFlare(url, 'TrueLocal');
    if (!html) return null;

    const $ = load(html);
    const results = $('.business-card, .listing, .result, [itemtype$="/LocalBusiness"]');
    if (!results.length) return null;

    const first = results.first();
    const ph = first.find('a[href^="tel:"], .phone, [itemprop="telephone"]').text().trim() || undefined;
    const wsLink = first.find('a[href^="http"]').not('[href*="truelocal"]').first();
    const website = wsLink.attr('href')?.trim() || undefined;
    const pageText = html;
    const emails = extractEmails(pageText);
    const email = emails.length > 0 ? emails[0] : undefined;
    const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);

    if (!phone && !email && !website) return null;
    return { businessName, phone, email, website, source: { type: 'truelocal', name: 'TrueLocal' } };
  } catch { return null; }
}

// ── Canada411 (Canadian phone directory) ──

async function searchCanada411(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.canada411.ca/search/?stp=${query}`;
    const html = await fetchThroughFlare(url, 'Canada411');
    if (!html) return null;

    const $ = load(html);
    const results = $('.listing, .result, .business, [itemtype$="/LocalBusiness"]');
    if (!results.length) return null;

    const first = results.first();
    const ph = first.find('a[href^="tel:"], .phone, .telephone, [itemprop="telephone"]').text().trim() || undefined;
    const pageText = html;
    const emails = extractEmails(pageText);
    const email = emails.length > 0 ? emails[0] : undefined;
    const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);

    if (!phone && !email) return null;
    return { businessName, phone, email, website: undefined, source: { type: 'canada411', name: 'Canada411' } };
  } catch { return null; }
}

// ── YellowPages.ca (Canadian business directory) ──

async function searchYellowPagesCA(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.yellowpages.ca/search/si/1/${query}/${encodeURIComponent(city)}`;
    const html = await fetchThroughFlare(url, 'YellowPagesCA');
    if (!html) return null;

    const $ = load(html);
    const results = $('.listing, .result, .business, [data-qa^="listing"]');
    if (!results.length) {
      // Try fallback selector
      const altResults = $('div[class*="listing"], article, .v-card');
      if (!altResults.length) return null;
      const first = altResults.first();
      const ph = first.find('a[href^="tel:"], .phone, .mlr__item--phone').text().trim() || undefined;
      const wsLink = first.find('a[href^="http"]').not('[href*="yellowpages"]').not('[href*="yp.ca"]').first();
      const website = wsLink.attr('href')?.trim() || undefined;
      const pageText = html;
      const emails = extractEmails(pageText);
      const email = emails.length > 0 ? emails[0] : undefined;
      const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);
      if (!phone && !email && !website) return null;
      return { businessName, phone, email, website, source: { type: 'yellowpages_ca', name: 'YellowPages.ca' } };
    }

    const first = results.first();
    const ph = first.find('a[href^="tel:"], .phone, .mlr__item--phone').text().trim() || undefined;
    const wsLink = first.find('a[href^="http"]').not('[href*="yellowpages"]').not('[href*="yp.ca"]').first();
    const website = wsLink.attr('href')?.trim() || undefined;
    const pageText = html;
    const emails = extractEmails(pageText);
    const email = emails.length > 0 ? emails[0] : undefined;
    const phone = ph || (extractPhones(pageText).length > 0 ? extractPhones(pageText)[0] : undefined);

    if (!phone && !email && !website) return null;
    return { businessName, phone, email, website, source: { type: 'yellowpages_ca', name: 'YellowPages.ca' } };
  } catch { return null; }
}

async function searchBingMaps(businessName: string, city: string): Promise<DirectoryResult | null> {
  try {
    const query = encodeURIComponent(`${businessName} ${city}`);
    const url = `https://www.bing.com/maps?q=${query}`;

    const html = await fetchThroughFlare(url, 'BingMaps');
    if (!html || html.length < 2000) return null;

    const $ = load(html);
    const pageText = $('body').text();

    const bizLower = businessName.toLowerCase();
    const nameInResults = pageText.toLowerCase().includes(bizLower);
    if (!nameInResults) return null;

    let phone: string | undefined;
    const phoneMatch = pageText.match(/(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];

    const emails = extractEmails(html);
    const email = emails.length > 0 ? emails[0] : undefined;

    let website: string | undefined;
    $('a[href^="http"]').each((_: number, el: any) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('http') && !href.includes('bing.com') && !href.includes('microsoft.com')) {
        if (!website) website = href;
      }
    });

    if (!phone && !email && !website) return null;
    return { businessName, phone, website, email, source: { type: 'directory', name: 'Bing Maps' } };
  } catch {
    return null;
  }
}

// ── Main export: search all directories ──

// ── Website Scrape Through FlareSolverr (for cloudflare bypass) ──

/**
 * Scrape a business website through FlareSolverr to bypass Cloudflare/captcha.
 * Extracts emails, phones, and social links from the rendered HTML.
 */
export async function scrapeWebsiteThroughFlare(websiteUrl: string): Promise<ScrapedContact> {
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

  for (const pageUrl of pagesToScrape) {
    try {
      const html = await fetchThroughFlare(pageUrl, 'FlareScrape');
      if (!html) continue;

      const $ = load(html);
      const text = $('body').text();

      const emails = extractEmails(html);
      const phones = extractPhones(text);
      const socials = extractSocials(html, url);

      combined.emails.push(...emails);
      combined.phones.push(...phones);
      combined.socials = { ...combined.socials, ...socials };
    } catch {
      // skip failed pages
    }
  }

  combined.emails = [...new Set(combined.emails)];
  combined.phones = [...new Set(combined.phones)];

  return combined;
}

/**
 * Search all available directory sites for a business.
 * Runs searches in parallel, returns the best result.
 */
export async function findInDirectoriesDeep(
  businessName: string,
  city: string,
  country: string
): Promise<DirectoryResult | null> {
  const countryLower = country.toLowerCase();
  const searches: (() => Promise<DirectoryResult | null>)[] = [];

  // Global directories (always query)
  searches.push(() => searchCylex(businessName, city));
  searches.push(() => searchHotfrog(businessName, city));
  searches.push(() => searchChamberOfCommerce(businessName, city));
  searches.push(() => searchBuzzfile(businessName, city));
  searches.push(() => searchGoogle(businessName, city));
  searches.push(() => searchLinkedInViaGoogle(businessName, city));
  searches.push(() => searchBingMaps(businessName, city));

  // Canada-specific
  if (countryLower.includes('canada') || countryLower.includes('canadá') || countryLower === 'ca') {
    searches.push(() => searchCanada411(businessName, city));
    searches.push(() => searchYellowPagesCA(businessName, city));
  }

  // Australia-specific
  if (countryLower.includes('australia') || countryLower === 'au') {
    searches.push(() => searchYellowPagesAU(businessName, city));
    searches.push(() => searchTrueLocal(businessName, city));
  }

  // UK-specific
  if (countryLower.includes('uk') || countryLower.includes('united kingdom') || countryLower.includes('england')) {
    searches.push(() => searchYell(businessName, city));
  }

  // Spain-specific
  if (countryLower.includes('spain') || countryLower.includes('españa') || countryLower === 'es') {
    searches.push(() => searchPaginasAmarillas(businessName, city));
  }

  console.log(`[DeepDir] Running ${searches.length} searches for "${businessName}" in ${city} (${country})`);
  const results = await Promise.allSettled(searches.map((s) => s()));

  const valid: DirectoryResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) valid.push(result.value);
  }

  if (valid.length === 0) {
    console.log(`[DeepDir] No results for "${businessName}"`);
    return null;
  }

  // Score: email=10 > phone=5 > website=1
  const scored = valid.map((r) => ({ result: r, score: (r.email ? 10 : 0) + (r.phone ? 5 : 0) + (r.website ? 1 : 0) }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0].result;
  console.log(`[DeepDir] Best for "${businessName}": phone=${best.phone || '-'}, email=${best.email || '-'}, website=${best.website || '-'} (${best.source.name})`);
  return best;
}
