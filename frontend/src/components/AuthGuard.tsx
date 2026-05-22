'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'auth' | 'noauth'>('loading');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (PUBLIC_PATHS.includes(pathname)) {
      setStatus('auth');
      return;
    }

    const pw = localStorage.getItem('app-password') || 'leadscraper2024';
    const token = localStorage.getItem('auth-token');
    if (token === pw) {
      setStatus('auth');
    } else {
      setStatus('noauth');
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

  if (status === 'noauth') return null;

  return <>{children}</>;
}
