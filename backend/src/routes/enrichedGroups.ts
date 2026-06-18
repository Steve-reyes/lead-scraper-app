/**
 * Enriched Groups API
 * Persists enriched business groups (list name + leads) in SQLite.
 *
 * GET    /api/enriched-groups       → list all groups
 * POST   /api/enriched-groups       → save one group (overwrites by listName)
 * DELETE /api/enriched-groups/:name → remove one group
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

let db: any | null = null;

function getDb(): any {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'leads.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS enriched_groups (
      list_name TEXT PRIMARY KEY,
      leads TEXT NOT NULL,
      enriched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

const router = Router();

// GET /api/enriched-groups
router.get('/enriched-groups', (_req: Request, res: Response) => {
  try {
    const rows = getDb().prepare('SELECT * FROM enriched_groups ORDER BY updated_at DESC').all();
    const groups = rows.map((r: any) => ({
      listName: r.list_name,
      leads: JSON.parse(r.leads),
      enrichedAt: r.enriched_at,
    }));
    res.json({ groups });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/enriched-groups — save one group
router.post('/enriched-groups', (req: Request, res: Response) => {
  try {
    const { listName, leads, enrichedAt } = req.body;
    if (!listName || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'listName and leads[] required' });
    }
    getDb().prepare(`
      INSERT INTO enriched_groups (list_name, leads, enriched_at, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(list_name) DO UPDATE SET
        leads = ?,
        enriched_at = ?,
        updated_at = datetime('now')
    `).run(listName, JSON.stringify(leads), enrichedAt || new Date().toISOString(), JSON.stringify(leads), enrichedAt || new Date().toISOString());
    res.json({ saved: listName });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/enriched-groups/restore — bulk restore groups + leads from localStorage
router.post('/enriched-groups/restore', (req: Request, res: Response) => {
  try {
    const groups = req.body;
    if (!Array.isArray(groups)) {
      return res.status(400).json({ error: 'Array of groups required' });
    }

    const insertGroup = getDb().prepare(`
      INSERT INTO enriched_groups (list_name, leads, enriched_at, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(list_name) DO UPDATE SET
        leads = excluded.leads,
        enriched_at = excluded.enriched_at,
        updated_at = datetime('now')
    `);

    // Also save each lead to the leads table so lead-score/kanban work
    const insertLead = getDb().prepare(`
      INSERT INTO leads (business_name, address, phone, email, website, rating, reviews, category, source,
        enriched_phone, enriched_email, city, country, social_links, sources,
        enrichment_status, raw_data, updated_at)
      VALUES (@name, @addr, @phone, @email, @website, @rating, @reviews, @category, @source,
        @ep, @ee, @city, @country, @sl, @src, @es, @rd, datetime('now'))
      ON CONFLICT(business_name, address) DO UPDATE SET
        phone = CASE WHEN @phone != '' THEN @phone ELSE phone END,
        email = CASE WHEN @email != '' THEN @email ELSE email END,
        website = CASE WHEN @website != '' THEN @website ELSE website END,
        enriched_phone = CASE WHEN @ep != '' THEN @ep ELSE enriched_phone END,
        enriched_email = CASE WHEN @ee != '' THEN @ee ELSE enriched_email END,
        enrichment_status = CASE WHEN @es != '' THEN @es ELSE enrichment_status END,
        updated_at = datetime('now')
    `);

    const tx = getDb().transaction((grps: any[]) => {
      let leadCount = 0;
      for (const g of grps) {
        insertGroup.run(g.listName, JSON.stringify(g.leads), g.enrichedAt);
        for (const lead of (g.leads || [])) {
          const name = lead.businessName || '';
          const addr = lead.address || '';
          if (!name) continue;
          insertLead.run({
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
            city: lead.city || '',
            country: lead.country || '',
            sl: JSON.stringify(lead.socialLinks || []),
            src: JSON.stringify(lead.sources || []),
            es: lead.enrichmentStatus || '',
            rd: JSON.stringify(lead.rawData || {}),
          });
          leadCount++;
        }
      }
      return leadCount;
    });

    const count = tx(groups);
    res.json({ success: true, groupsRestored: groups.length, leadsRestored: count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/enriched-groups/:name
router.delete('/enriched-groups/:name', (req: Request, res: Response) => {
  try {
    getDb().prepare('DELETE FROM enriched_groups WHERE list_name = ?').run(req.params.name);
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
