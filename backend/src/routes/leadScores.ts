/**
 * Lead Scores API
 * Persists scored leads in SQLite for the Lead Score page.
 *
 * GET    /api/lead-scores       → list all scored leads
 * POST   /api/lead-scores       → save/update scored leads (body: { entries: LeadScoreEntry[] })
 * DELETE /api/lead-scores/:id   → remove one scored lead
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

interface ScoreEntry {
  id: string;
  businessName: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  reviewCount: number | null;
  rating: number | null;
  socialLinks: string;
  // scoring
  websiteQuality: number;
  reviewScore: number;
  mapsRank: number;
  socialScore: number;
  respScore: number;
  totalScore: number;
  tier: string;
  notes: string;
}

let db: any | null = null;

function getDb(): any {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'leads.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_scores (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      address TEXT DEFAULT '',
      review_count INTEGER,
      rating REAL,
      social_links TEXT DEFAULT '{}',
      website_quality INTEGER DEFAULT 2,
      review_score INTEGER DEFAULT 2,
      maps_rank INTEGER DEFAULT 2,
      social_score INTEGER DEFAULT 0,
      resp_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'cold',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function rowToEntry(row: any) {
  return {
    id: row.id,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    reviewCount: row.review_count,
    rating: row.rating,
    socialLinks: safeJson(row.social_links),
    scores: {
      websiteQuality: row.website_quality,
      reviewCount: row.review_score,
      googleMapsRank: row.maps_rank,
      socialMedia: row.social_score,
      responsiveness: row.resp_score,
    },
    totalScore: row.total_score,
    tier: row.tier,
    notes: row.notes,
    scoredAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeJson(val: any) {
  if (!val) return {};
  try { return JSON.parse(val); } catch { return {}; }
}

const router = Router();

// GET /api/lead-scores
router.get('/lead-scores', (_req: Request, res: Response) => {
  try {
    const rows = getDb().prepare('SELECT * FROM lead_scores ORDER BY updated_at DESC').all();
    res.json({ entries: rows.map(rowToEntry) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/lead-scores — save batch of scored leads
router.post('/lead-scores', (req: Request, res: Response) => {
  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array required' });
    }

    const upsert = getDb().prepare(`
      INSERT INTO lead_scores (id, business_name, phone, email, website, address,
        review_count, rating, social_links,
        website_quality, review_score, maps_rank, social_score, resp_score,
        total_score, tier, notes, updated_at)
      VALUES (@id, @bn, @ph, @em, @web, @addr,
        @rc, @rt, @sl,
        @wq, @rs, @mr, @ss, @res,
        @total, @tier, @notes, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        business_name = @bn, phone = @ph, email = @em, website = @web, address = @addr,
        review_count = @rc, rating = @rt, social_links = @sl,
        website_quality = @wq, review_score = @rs, maps_rank = @mr,
        social_score = @ss, resp_score = @res,
        total_score = @total, tier = @tier, notes = @notes,
        updated_at = datetime('now')
    `);

    const insertMany = getDb().transaction((items: any[]) => {
      for (const item of items) {
        const sc = item.scores || {};
        upsert.run({
          id: item.id,
          bn: item.businessName || '',
          ph: item.phone || '',
          em: item.email || '',
          web: item.website || '',
          addr: item.address || '',
          rc: item.reviewCount ?? null,
          rt: item.rating ?? null,
          sl: JSON.stringify(item.socialLinks || {}),
          wq: sc.websiteQuality ?? 2,
          rs: sc.reviewCount ?? 2,
          mr: sc.googleMapsRank ?? 2,
          ss: sc.socialMedia ?? 0,
          res: sc.responsiveness ?? 0,
          total: item.totalScore ?? 0,
          tier: item.tier || 'cold',
          notes: item.notes || '',
        });
      }
    });

    insertMany(entries);
    res.json({ saved: entries.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/lead-scores/:id
router.delete('/lead-scores/:id', (req: Request, res: Response) => {
  try {
    getDb().prepare('DELETE FROM lead_scores WHERE id = ?').run(req.params.id);
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
