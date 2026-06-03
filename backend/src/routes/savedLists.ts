/**
 * Saved Lists API
 * Persists saved lead lists in SQLite.
 *
 * GET    /api/saved-lists       → list all saved lists
 * POST   /api/saved-lists       → save one list (overwrites by name)
 * DELETE /api/saved-lists/:name → remove one list
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
const archiver = require('archiver');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

let db: any = null;

function getDb() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'leads.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_lists (
      list_name TEXT PRIMARY KEY,
      leads TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

const router = Router();

// GET /api/saved-lists
router.get('/saved-lists', (_req: Request, res: Response) => {
  try {
    const rows = getDb().prepare('SELECT * FROM saved_lists ORDER BY updated_at DESC').all() as any[];
    const lists = rows.map((r) => ({
      name: r.list_name,
      leads: JSON.parse(r.leads),
      createdAt: r.created_at,
      leadCount: JSON.parse(r.leads).length,
    }));
    res.json({ lists });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/saved-lists — save one list
router.post('/saved-lists', (req: Request, res: Response) => {
  try {
    const { name, leads } = req.body;
    if (!name || !Array.isArray(leads)) {
      return res.status(400).json({ error: 'name and leads[] required' });
    }
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO saved_lists (list_name, leads, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(list_name) DO UPDATE SET
        leads = ?,
        created_at = ?,
        updated_at = datetime('now')
    `).run(name, JSON.stringify(leads), now, JSON.stringify(leads), now);
    res.json({ saved: name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/saved-lists/:name
router.delete('/saved-lists/:name', (req: Request, res: Response) => {
  try {
    getDb().prepare('DELETE FROM saved_lists WHERE list_name = ?').run(req.params.name);
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── CSV helpers ──
function escapeCsv(val: any): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function leadsToCsv(leads: any[]): string {
  const headers = ['businessName', 'phone', 'email', 'website', 'address', 'city', 'country', 'rating', 'sources'];
  const rows = [headers.join(',')];
  for (const lead of leads) {
    const sources = (lead.sources || []).map((s: any) => s.name || s.type || '').join('; ');
    rows.push([
      escapeCsv(lead.businessName),
      escapeCsv(lead.phone),
      escapeCsv(lead.email),
      escapeCsv(lead.website),
      escapeCsv(lead.address),
      escapeCsv(lead.city),
      escapeCsv(lead.country),
      escapeCsv(lead.rating),
      escapeCsv(sources),
    ].join(','));
  }
  return rows.join('\n');
}

// GET /api/saved-lists/:name/export/download — CSV for one list
router.get('/saved-lists/:name/export/download', (req: Request, res: Response) => {
  try {
    const row = getDb().prepare('SELECT * FROM saved_lists WHERE list_name = ?').get(req.params.name) as any;
    if (!row) return res.status(404).json({ error: 'List not found' });
    const leads = JSON.parse(row.leads);
    const csv = leadsToCsv(leads);
    const safe = row.list_name.replace(/[^a-zA-Z0-9 _-]/g, '');
    const filename = encodeURIComponent(safe) + '.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saved-lists/export-all — ZIP of all lists as CSVs
router.get('/saved-lists/export-all', (_req: Request, res: Response) => {
  try {
    const rows = getDb().prepare('SELECT * FROM saved_lists ORDER BY list_name ASC').all() as any[];
    if (!rows.length) return res.status(404).json({ error: 'No saved lists to export' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="all-saved-lists.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    for (const row of rows) {
      const leads = JSON.parse(row.leads);
      const csv = leadsToCsv(leads);
      const filename = row.list_name.replace(/[^a-zA-Z0-9 _-]/g, '') + '.csv';
      archive.append(csv, { name: filename });
    }

    archive.finalize();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
