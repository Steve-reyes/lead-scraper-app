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
