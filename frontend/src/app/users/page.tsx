'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  Users, Shield, Edit3, Trash2, Plus, X, CheckCircle2,
  AlertCircle, Search,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

const ALL_PERMISSIONS = ['scrape', 'enrich', 'enriched', 'lists', 'kanban', 'score', 'analytics', 'settings', 'users'];
const PERM_LABELS: Record<string, string> = {
  scrape: 'Search & Scrape',
  enrich: 'Enrich Leads',
  enriched: 'Enriched Businesses',
  lists: 'Saved Lists',
  kanban: 'Lead Pipeline',
  score: 'Lead Score',
  analytics: 'Analytics',
  settings: 'Settings',
  users: 'Manage Users',
};

interface User {
  id: string;
  username: string;
  role: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export default function UsersPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState<'add' | 'edit' | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<string>('viewer');
  const [formPerms, setFormPerms] = useState<string[]>(['scrape', 'lists', 'kanban']);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const authHeaders = useMemo((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const stored = localStorage.getItem('leadscraper-user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u.token) h['Authorization'] = `Bearer ${u.token}`;
      }
    } catch {}
    return h;
  }, []);

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/users`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    }
    setLoading(false);
  }

  function togglePerm(perm: string) {
    setFormPerms(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  }

  function handleRoleChange(role: string) {
    setFormRole(role);
    if (role !== 'custom') {
      const presets: Record<string, string[]> = {
        admin: [...ALL_PERMISSIONS],
        manager: ALL_PERMISSIONS.filter(p => p !== 'users'),
        viewer: ['scrape', 'lists', 'kanban'],
      };
      setFormPerms(presets[role] || []);
    }
  }

  function openAdd() {
    setFormUsername('');
    setFormPassword('');
    setFormRole('viewer');
    setFormPerms(['scrape', 'lists', 'kanban']);
    setFormError('');
    setShowModal('add');
  }

  function openEdit(user: User) {
    setEditUser(user);
    setFormUsername(user.username);
    setFormPassword('');
    setFormRole(user.role);
    setFormPerms(user.permissions);
    setFormError('');
    setShowModal('edit');
  }

  async function handleSave() {
    setFormError('');
    if (!formUsername.trim()) { setFormError('Username required'); return; }
    if (showModal === 'add' && !formPassword.trim()) { setFormError('Password required'); return; }
    setFormLoading(true);

    try {
      const body: any = { username: formUsername.trim() };
      if (formPassword.trim()) body.password = formPassword.trim();
      body.role = formRole;
      body.permissions = formPerms;

      let res;
      if (showModal === 'add') {
        res = await fetch(`${API}/api/users`, {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API}/api/users/${editUser!.id}`, {
          method: 'PUT', headers: authHeaders,
          body: JSON.stringify(body),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setShowModal(null);
      setEditUser(null);
      await fetchUsers();
    } catch (err: any) {
      setFormError(err.message || 'Save failed');
    }
    setFormLoading(false);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await fetch(`${API}/api/users/${deleteId}`, {
        method: 'DELETE', headers: authHeaders,
      });
      setDeleteId(null);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    }
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-accent-500" />
              <h1 className="text-lg font-bold text-gray-900">Manage Users</h1>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''} configured</p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add User
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Search */}
          <div className="mb-4 relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400">
              {search ? 'No users match your search' : 'No users yet. Click "Add User" to create one.'}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Username</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Role</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Permissions</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Created</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(user => {
                    const roleColors: Record<string, string> = {
                      admin: 'bg-purple-50 text-purple-600 border-purple-200',
                      manager: 'bg-blue-50 text-blue-600 border-blue-200',
                      viewer: 'bg-gray-50 text-gray-600 border-gray-200',
                      custom: 'bg-orange-50 text-orange-600 border-orange-200',
                    };
                    return (
                      <tr key={user.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-accent-100 flex items-center justify-center">
                              <Shield className="w-3.5 h-3.5 text-accent-500" />
                            </div>
                            <span className="font-medium text-gray-900">{user.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${roleColors[user.role] || roleColors.viewer}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {user.permissions.slice(0, 4).map(p => (
                              <span key={p} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{PERM_LABELS[p] || p}</span>
                            ))}
                            {user.permissions.length > 4 && (
                              <span className="text-[10px] text-gray-400">+{user.permissions.length - 4} more</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(user)}
                              className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit user"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {user.id !== 'user_admin' && (
                              <button
                                onClick={() => setDeleteId(user.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete user"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {showModal === 'add' ? 'Add User' : 'Edit User'}
              </h2>
              <button onClick={() => { setShowModal(null); setEditUser(null); }} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Username */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Username *</label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={e => setFormUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                  placeholder="Enter username"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Password {showModal === 'edit' && <span className="text-gray-400 font-normal">(leave blank to keep current)</span>} *
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
                  placeholder={showModal === 'add' ? 'Enter password' : 'Leave blank to keep current'}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Role</label>
                <div className="grid grid-cols-4 gap-2">
                  {['admin', 'manager', 'viewer', 'custom'].map(role => {
                    const roleColors: Record<string, string> = {
                      admin: 'border-purple-200 bg-purple-50 text-purple-700',
                      manager: 'border-blue-200 bg-blue-50 text-blue-700',
                      viewer: 'border-gray-200 bg-gray-50 text-gray-700',
                      custom: 'border-orange-200 bg-orange-50 text-orange-700',
                    };
                    return (
                      <button
                        key={role}
                        onClick={() => handleRoleChange(role)}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${
                          formRole === role
                            ? roleColors[role] + ' ring-2 ring-accent-500/30'
                            : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Page Access</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map(perm => (
                    <label
                      key={perm}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        formPerms.includes(perm)
                          ? 'border-accent-200 bg-accent-50 text-accent-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formPerms.includes(perm)}
                        onChange={() => togglePerm(perm)}
                        className="rounded border-gray-300 text-accent-500 focus:ring-accent-500/30"
                      />
                      {PERM_LABELS[perm] || perm}
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {formError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => { setShowModal(null); setEditUser(null); }}
                className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={formLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-accent-500 hover:bg-accent-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {formLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Delete User</h3>
            <p className="text-xs text-gray-500 mb-6">Are you sure? This cannot be undone.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
