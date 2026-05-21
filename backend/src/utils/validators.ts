/**
 * Utility functions for validation and normalization.
 */

/**
 * Normalize business name for deduplication:
 * - lowercase
 * - remove punctuation
 * - collapse whitespace
 * - remove common legal suffixes (llc, inc, ltd, gmbh, etc.)
 */
export function normalizeBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(llc|inc|ltd|gmbh|corp|corporation|co|company|limited|plc|sa|sarl|gbr|kg|ag|nv|bv|pty|pvt|sdn|bhd)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract postal code from an address string.
 * Supports common formats: US ZIP, UK Postcode, DE PLZ, etc.
 */
export function extractPostalCode(address: string): string {
  if (!address) return '';

  // US ZIP+4 or ZIP
  const usZip = address.match(/\b(\d{5}(?:-\d{4})?)\b/);
  if (usZip) return usZip[1];

  // UK Postcode
  const ukPostcode = address.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  if (ukPostcode) return ukPostcode[1].toUpperCase().replace(/\s/g, '');

  // German PLZ
  const dePlz = address.match(/\b(\d{5})\b/);
  if (dePlz) return dePlz[1];

  // Generic 5+ digit postal code
  const generic = address.match(/\b(\d{5,})\b/);
  if (generic) return generic[1];

  return '';
}

/**
 * Extract email addresses from text using regex.
 */
export function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)];
}

/**
 * Extract phone numbers from text (international format).
 */
export function extractPhones(text: string): string[] {
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,9}/g;
  const matches = text.match(phoneRegex) || [];
  return [...new Set(matches.filter((p) => p.replace(/[^0-9]/g, '').length >= 7))];
}

/**
 * Extract social media URLs from text.
 */
export function extractSocials(text: string, baseUrl?: string): { linkedin?: string; facebook?: string; instagram?: string; twitter?: string } {
  const socials: { linkedin?: string; facebook?: string; instagram?: string; twitter?: string } = {};

  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9_-]+/);
  if (linkedin) socials.linkedin = linkedin[0];

  const facebook = text.match(/https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/);
  if (facebook) socials.facebook = facebook[0];

  const instagram = text.match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._-]+/);
  if (instagram) socials.instagram = instagram[0];

  const twitter = text.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[a-zA-Z0-9_]+/);
  if (twitter) socials.twitter = twitter[0];

  return socials;
}

/**
 * Detect country from address string.
 */
export function detectCountry(address: string): string {
  const lower = address.toLowerCase();

  const countryMap: Record<string, string[]> = {
    'United States': ['usa', 'united states', 'us', 'u.s.', 'u.s.a'],
    'United Kingdom': ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'gb', 'great britain'],
    'Germany': ['germany', 'deutschland', 'de'],
    'France': ['france', 'french', 'fr'],
    'Spain': ['spain', 'españa', 'es'],
    'Italy': ['italy', 'italia', 'it'],
    'Canada': ['canada', 'ca', 'can'],
    'Australia': ['australia', 'au', 'aussie'],
    'Netherlands': ['netherlands', 'holland', 'nl'],
    'Belgium': ['belgium', 'be', 'belgie'],
    'Switzerland': ['switzerland', 'swiss', 'ch'],
    'Sweden': ['sweden', 'sverige', 'se'],
    'Norway': ['norway', 'norge', 'no'],
    'Denmark': ['denmark', 'danmark', 'dk'],
    'Finland': ['finland', 'suomi', 'fi'],
    'Austria': ['austria', 'österreich', 'at'],
    'Ireland': ['ireland', 'ie', 'eire'],
  };

  for (const [country, indicators] of Object.entries(countryMap)) {
    if (indicators.some((i) => lower.includes(i))) {
      return country;
    }
  }

  return 'Unknown';
}
