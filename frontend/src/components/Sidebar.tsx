'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Search,
  Sparkles,
  List,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  Compass,
  BarChart3,
  Columns,
  CheckCircle2,
  Target,
  X,
  Menu,
  LogOut,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onMobileToggle?: () => void;
}

export default function Sidebar({ collapsed, onToggle, onMobileToggle }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const navItems: NavItem[] = [
    { id: 'scrape', label: 'Search & Scrape', icon: Search, path: '/' },
    { id: 'enrich', label: 'Enrich Leads', icon: Sparkles, path: '/enrich' },
    { id: 'enriched', label: 'Enriched Businesses', icon: CheckCircle2, path: '/enriched-businesses' },
    { id: 'lists', label: 'Saved Lists', icon: List, path: '/saved-lists' },
    { id: 'kanban', label: 'Lead Pipeline', icon: Columns, path: '/lead-kanban' },
    { id: 'score', label: 'Lead Score', icon: Target, path: '/lead-score' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  const handleNav = (item: NavItem) => {
    if (item.path !== '#') {
      router.push(item.path);
      setMobileOpen(false);
    }
  };

  const isActive = (item: NavItem): boolean => {
    if (item.path === '#') return false;
    if (item.path === '/') return pathname === '/';
    return pathname === item.path || pathname.startsWith(item.path + '/');
  };

  const handleMobileToggle = () => {
    const next = !mobileOpen;
    setMobileOpen(next);
    onMobileToggle?.();
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth-token');
    window.location.href = '/login';
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        className={'h-14 flex items-center border-b border-sidebar-border' + (collapsed ? ' justify-center px-0' : ' px-5')}
      >
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
            <Compass className="w-4 h-4 text-white" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
              <Compass className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white tracking-tight">LeadScraper</h1>
              <p className="text-[10px] text-gray-500 font-medium">Pro</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleNav(item)}
            className={
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ' +
              (isActive(item)
                ? 'bg-sidebar-active text-accent-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-sidebar-hover') +
              (collapsed ? ' justify-center px-0' : '')
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon
              className={'w-4 h-4 shrink-0' + (isActive(item) ? ' text-accent-400' : '')}
            />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <button
          onClick={handleSignOut}
          className={
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-sidebar-hover transition-colors' +
            (collapsed ? ' justify-center' : '')
          }
          title="Sign out"
        >
          {collapsed ? (
            <LogOut className="w-4 h-4" />
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </>
          )}
        </button>

        <button
          onClick={onToggle}
          className={
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-sidebar-hover transition-colors' +
            (collapsed ? ' justify-center' : '')
          }
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={
          (collapsed ? 'w-16' : 'w-60') +
          ' bg-sidebar border-r border-sidebar-border flex-col transition-all duration-200 ease-in-out shrink-0 hidden md:flex'
        }
      >
        {sidebarContent}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={handleMobileToggle}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-lg bg-sidebar border border-sidebar-border flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-sidebar-hover transition-colors shadow-lg"
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleMobileToggle}
          />
          <aside className="relative w-72 max-w-[85vw] bg-sidebar border-r border-sidebar-border flex flex-col overflow-y-auto">
            <div className="h-14 flex items-center justify-between px-5 border-b border-sidebar-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
                  <Compass className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-semibold text-white tracking-tight">LeadScraper</h1>
                  <p className="text-[10px] text-gray-500 font-medium">Pro</p>
                </div>
              </div>
              <button
                onClick={handleMobileToggle}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-sidebar-hover transition-colors"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 py-3 px-2 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNav(item)}
                  className={
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ' +
                    (isActive(item)
                      ? 'bg-sidebar-active text-accent-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-sidebar-hover')
                  }
                >
                  <item.icon
                    className={'w-4 h-4 shrink-0' + (isActive(item) ? ' text-accent-400' : '')}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-sidebar-border p-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:text-red-400 hover:bg-sidebar-hover transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
