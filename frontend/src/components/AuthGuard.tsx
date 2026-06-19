'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/login'];

const ALL_PERMISSIONS = ['scrape', 'enrich', 'enriched', 'lists', 'kanban', 'score', 'analytics', 'settings', 'users'];
const ROLE_PRESETS: Record<string, string[]> = {
  admin: ALL_PERMISSIONS,
  manager: ALL_PERMISSIONS.filter(p => p !== 'users'),
  viewer: ['lists', 'kanban'],
  custom: [],
};

const PATH_TO_PERM: Record<string, string> = {
  '/': 'scrape',
  '/scrape': 'scrape',
  '/enrich': 'enrich',
  '/enriched-businesses': 'enriched',
  '/saved-lists': 'lists',
  '/lead-kanban': 'kanban',
  '/lead-score': 'score',
  '/analytics': 'analytics',
  '/settings': 'settings',
  '/users': 'users',
};

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'auth'>('loading');

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) {
      setStatus('auth');
      return;
    }

    try {
      const stored = localStorage.getItem('leadscraper-user');
      if (!stored) {
        router.replace('/login');
        return;
      }

      const user = JSON.parse(stored);
      if (!user.token || !user.id) {
        router.replace('/login');
        return;
      }

      // Check permission for current page
      const requiredPerm = PATH_TO_PERM[pathname] || '';
      if (requiredPerm) {
        const perms = user.permissions || ROLE_PRESETS[user.role] || [];
        if (!perms.includes(requiredPerm)) {
          // Non-admin users → pipeline, admins → home
          router.replace(user.role === 'admin' ? '/' : '/lead-kanban');
          return;
        }
      }

      setStatus('auth');
    } catch {
      router.replace('/login');
    }
  }, [pathname, router]);

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-900">
        <Loader2 className="w-6 h-6 text-accent-500 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
