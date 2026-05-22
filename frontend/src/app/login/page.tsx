'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  const getCurrentPassword = () => localStorage.getItem('app-password') || 'leadscraper2024';

  useEffect(() => {
    if (localStorage.getItem('auth-token') === getCurrentPassword()) {
      router.push('/');
    }
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentPw = getCurrentPassword();
    if (password === currentPw) {
      localStorage.setItem('auth-token', currentPw);
      router.push('/');
    } else {
      setError('Invalid password');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center shadow-lg mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">LeadScraper Pro</h1>
            <p className="text-sm text-gray-400 mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            >
              Sign In
            </button>
          </form>
        </div>
        <p className="text-center text-[11px] text-gray-600 mt-4">Protected access</p>
      </div>
    </div>
  );
}
