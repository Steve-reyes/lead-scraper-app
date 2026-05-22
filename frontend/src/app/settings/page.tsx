'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Settings as SettingsIcon, Key, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [storedPw, setStoredPw] = useState('');

  useEffect(() => {
    const pw = localStorage.getItem('app-password') || 'leadscraper2024';
    setStoredPw(pw);
  }, []);

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (currentPassword !== storedPw) {
      setMessage({ type: 'error', text: 'Current password is incorrect.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    localStorage.setItem('app-password', newPassword);
    // Update the stored auth-token to the new password so user stays logged in
    localStorage.setItem('auth-token', newPassword);
    setStoredPw(newPassword);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage({ type: 'success', text: 'Password changed successfully!' });
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-accent-500" />
            <h1 className="text-lg font-bold text-gray-900">Settings</h1>
          </div>
        </header>

        <div className="p-6 max-w-lg space-y-6">
          {/* Change Password */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Key className="w-4.5 h-4.5 text-accent-500" />
              <h2 className="text-sm font-bold text-gray-800">Change Password</h2>
            </div>

            {message && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-medium mb-4 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                {message.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPw}
                    onChange={(e) => setShowPw(e.target.checked)}
                    className="rounded border-gray-300 text-accent-500 focus:ring-accent-500"
                  />
                  <span className="text-xs text-gray-500">Show passwords</span>
                </label>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              >
                Change Password
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
