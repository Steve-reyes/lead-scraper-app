/**
 * Session store API — server-side replacement for localStorage.
 * Stores ephemeral session data (enrich sessions, score queue) in SQLite.
 *
 * GET    /api/session/:key       → get session data
 * POST   /api/session/:key       → save session data (body: JSON value)
 * DELETE /api/session/:key       → clear session data
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

let db: any = null;

function getDb(): any {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'leads.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

const router = Router();

router.get('/session/:key', (req: Request, res: Response) => {
  try {
    const row = getDb().prepare('SELECT value FROM session_store WHERE key = ?').get(req.params.key) as any;
    if (!row) return res.json({ value: null });
    res.json({ value: JSON.parse(row.value) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/session/:key', (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const value = JSON.stringify(req.body);
    getDb().prepare(`
      INSERT INTO session_store (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).run(key, value, value);
    res.json({ saved: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/session/:key', (req: Request, res: Response) => {
  try {
    getDb().prepare('DELETE FROM session_store WHERE key = ?').run(req.params.key);
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
