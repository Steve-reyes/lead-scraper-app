/**
 * Users CRUD + auth routes
 *
 * POST /api/auth/login  → login with username+password → returns user + token
 * GET  /api/users       → list all users
 * POST /api/users       → create user
 * PUT  /api/users/:id   → update user
 * DELETE /api/users/:id → delete user
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

// ── File-based store (simple JSON) ──
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');

interface User {
  id: string;
  username: string;
  password: string;
  role: 'admin' | 'manager' | 'viewer' | 'custom';
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

const ALL_PERMISSIONS = ['scrape', 'enrich', 'enriched', 'lists', 'kanban', 'score', 'analytics', 'settings', 'users'];

const ROLE_PRESETS: Record<string, string[]> = {
  admin: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter(p => p !== 'users'),
  viewer: ['scrape', 'lists', 'kanban'],
  custom: [],
};

function loadUsers(): User[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USERS_FILE)) {
      // Seed default admin
      const defaults: User[] = [{
        id: 'user_admin',
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        permissions: ALL_PERMISSIONS,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }];
      fs.writeFileSync(USERS_FILE, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveUsers(users: User[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function genId(): string {
  return 'user_' + Math.random().toString(36).slice(2, 10);
}

function sanitize(u: User): Omit<User, 'password'> {
  const { password, ...rest } = u;
  return rest;
}

const router = Router();

// ── Login ──
router.post('/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = user.id + ':' + user.username + ':' + Date.now();
  res.json({ success: true, user: sanitize(user), token });
});

// ── Auth middleware ──
function requireUser(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.slice(7);
  const [userId] = token.split(':');
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  (req as any)._user = sanitize(user);
  next();
}

function requireAdmin(req: Request, res: Response, next: Function) {
  requireUser(req, res, () => {
    const u = (req as any)._user;
    if (u.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

// ── List users (admin only) ──
router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  const users = loadUsers().map(sanitize);
  res.json({ success: true, users });
});

// ── Get current user ──
router.get('/auth/me', requireUser, (req: Request, res: Response) => {
  res.json({ success: true, user: (req as any)._user });
});

// ── Create user (admin only) ──
router.post('/users', requireAdmin, (req: Request, res: Response) => {
  const { username, password, role, permissions } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const finalRole = role || 'viewer';
  const effectivePerms = permissions && permissions.length > 0
    ? permissions
    : (ROLE_PRESETS[finalRole] || ROLE_PRESETS.viewer);

  const newUser: User = {
    id: genId(),
    username,
    password,
    role: finalRole,
    permissions: effectivePerms,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);
  res.status(201).json({ success: true, user: sanitize(newUser) });
});

// ── Update user (admin only) ──
router.put('/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, password, role, permissions } = req.body;
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === id);

  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  if (username) users[idx].username = username;
  if (password) users[idx].password = password;
  if (role) {
    users[idx].role = role;
    if (!permissions || permissions.length === 0) {
      users[idx].permissions = ROLE_PRESETS[role] || users[idx].permissions;
    }
  }
  if (permissions && permissions.length > 0) {
    users[idx].permissions = permissions;
  }
  users[idx].updatedAt = new Date().toISOString();

  saveUsers(users);
  res.json({ success: true, user: sanitize(users[idx]) });
});

// ── Delete user (admin only) ──
router.delete('/users/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  if (id === 'user_admin') {
    return res.status(400).json({ error: 'Cannot delete the default admin user' });
  }
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  users.splice(idx, 1);
  saveUsers(users);
  res.json({ success: true });
});

export default router;
