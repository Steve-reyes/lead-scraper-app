/**
 * Lead persistence store — SQLite via better-sqlite3
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || '/app/data';

let db: any;

function getDb(): any {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const dbPath = path.join(DATA_DIR, 'leads.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      rating REAL,
      reviews INTEGER,
      category TEXT DEFAULT '',
      source TEXT DEFAULT '',
      enriched_phone TEXT DEFAULT '',
      enriched_email TEXT DEFAULT '',
      city TEXT DEFAULT '',
      country TEXT DEFAULT '',
      zip_code TEXT DEFAULT '',
      social_links TEXT DEFAULT '[]',
      sources TEXT DEFAULT '[]',
      enrichment_status TEXT DEFAULT '',
      enrichment_error TEXT DEFAULT '',
      raw_data TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unique ON leads(business_name, address);
  `);

  return db;
}

export function loadLeads(): any[] {
  try {
    return getDb().prepare('SELECT * FROM leads ORDER BY updated_at DESC').all().map(normalize);
  } catch (e: any) {
    console.error('[DB] Error loading leads:', e.message);
    return [];
  }
}

function normalize(row: any): any {
  if (!row) return null;
  return {
    id: row.id,
    businessName: row.business_name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    rating: row.rating,
    reviews: row.reviews,
    category: row.category,
    source: row.source,
    enrichedPhone: row.enriched_phone,
    enrichedEmail: row.enriched_email,
    city: row.city,
    country: row.country,
    zipCode: row.zip_code,
    socialLinks: safeJson(row.social_links),
    sources: safeJson(row.sources),
    enrichmentStatus: row.enrichment_status,
    enrichmentError: row.enrichment_error,
    rawData: safeJson(row.raw_data),
    savedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(val: any): any {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return val; }
}

export function saveLead(lead: any): boolean {
  try {
    const name = lead.businessName || lead.name || '';
    const addr = lead.address || '';
    if (!name) return false;

    const city = lead.city || (addr || '').split(',')[0]?.trim() || '';

    getDb().prepare(`
      INSERT INTO leads (business_name, address, phone, email, website, rating, reviews, category, source,
        enriched_phone, enriched_email, city, country, social_links, sources,
        enrichment_status, enrichment_error, raw_data, updated_at)
      VALUES (@name, @addr, @phone, @email, @website, @rating, @reviews, @category, @source,
        @ep, @ee, @city, @country, @sl, @src, @es, @ee2, @rd, datetime('now'))
      ON CONFLICT(business_name, address) DO UPDATE SET
        phone = CASE WHEN @phone != '' THEN @phone ELSE phone END,
        email = CASE WHEN @email != '' THEN @email ELSE email END,
        website = CASE WHEN @website != '' THEN @website ELSE website END,
        enriched_phone = CASE WHEN @ep != '' THEN @ep ELSE enriched_phone END,
        enriched_email = CASE WHEN @ee != '' THEN @ee ELSE enriched_email END,
        enrichment_status = CASE WHEN @es != '' THEN @es ELSE enrichment_status END,
        enrichment_error = CASE WHEN @ee2 != '' THEN @ee2 ELSE enrichment_error END,
        rating = CASE WHEN @rating IS NOT NULL THEN @rating ELSE rating END,
        reviews = CASE WHEN @reviews IS NOT NULL THEN @reviews ELSE reviews END,
        updated_at = datetime('now')
    `).run({
      name, addr,
      phone: lead.phone || lead.enrichedPhone || '',
      email: lead.email || lead.enrichedEmail || '',
      website: lead.website || '',
      rating: lead.rating ?? null,
      reviews: lead.reviews ?? null,
      category: lead.category || '',
      source: lead.source || '',
      ep: lead.enrichedPhone || '',
      ee: lead.enrichedEmail || '',
      city, country: lead.country || '',
      sl: JSON.stringify(lead.socialLinks || lead.social_links || []),
      src: JSON.stringify(lead.sources || []),
      es: lead.enrichmentStatus || '',
      ee2: lead.enrichmentError || '',
      rd: JSON.stringify(lead.rawData || lead.raw_data || {}),
    });
    return true;
  } catch (e: any) {
    console.error('[DB] Error saving lead:', e.message);
    return false;
  }
}

export function clearLeads(): void {
  try {
    getDb().prepare('DELETE FROM leads').run();
  } catch (e: any) {
    console.error('[DB] Error clearing leads:', e.message);
  }
}
