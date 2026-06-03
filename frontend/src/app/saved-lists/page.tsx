'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { List, Search, Building2, ChevronDown, ChevronRight, ExternalLink, Calendar, Users, Sparkles, Download, DownloadCloud } from 'lucide-react';
import type { Lead } from '@/lib/types';

interface SavedList {
  name: string;
  leads: Lead[];
  createdAt: string;
  leadCount: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function SavedListsPage() {
  const router = useRouter();
  const [savedLists, setSavedLists] = useState<Record<string, SavedList>>({});
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [loadedLeads, setLoadedLeads] = useState<Lead[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load saved lists from API + localStorage on mount
  useEffect(() => {
    async function load() {
      try {
        // Fetch from API
        const res = await fetch('/api/saved-lists');
        if (res.ok) {
          const data = await res.json();
          if (data.lists && data.lists.length > 0) {
            const apiLists: Record<string, SavedList> = {};
            for (const list of data.lists) {
              apiLists[list.name] = {
                name: list.name,
                leads: list.leads,
                createdAt: list.createdAt,
                leadCount: list.leadCount,
              };
            }
            // Merge with localStorage — API takes precedence
            const merged = { ...apiLists };
            try {
              const stored = localStorage.getItem('saved-lists');
              if (stored) {
                const localParsed = JSON.parse(stored);
                // Only add local lists not in API
                for (const [k, v] of Object.entries(localParsed)) {
                  if (!merged[k]) merged[k] = v as SavedList;
                }
              }
            } catch {}
            setSavedLists(merged);
            return;
          }
        }
      } catch {
        console.warn('[SavedLists] API unavailable, falling back to localStorage');
      }

      // Fallback: load from localStorage only
      try {
        const stored = localStorage.getItem('saved-lists');
        if (stored) {
          const parsed = JSON.parse(stored);
          setSavedLists(parsed);
        }
      } catch {
        console.warn('[SavedLists] Could not load from localStorage');
      }
    }
    load();
  }, []);

  const lists = useMemo(() => Object.values(savedLists), [savedLists]);

  const handleToggleList = (listName: string) => {
    if (expandedList === listName) {
      setExpandedList(null);
      setLoadedLeads([]);
    } else {
      setExpandedList(listName);
      setLoadedLeads(savedLists[listName]?.leads || []);
    }
  };

  const handleLoadLeads = (listName: string) => {
    setExpandedList(listName);
    setLoadedLeads(savedLists[listName]?.leads || []);
  };

  const handleDeleteList = (listName: string) => {
    setSavedLists((prev) => {
      const next = { ...prev };
      delete next[listName];
      localStorage.setItem('saved-lists', JSON.stringify(next));
      return next;
    });
    if (expandedList === listName) {
      setExpandedList(null);
      setLoadedLeads([]);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-panel-border px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-accent-500 flex items-center justify-center shrink-0">
              <List className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 truncate">Saved Lists</h2>
              <p className="text-xs text-gray-500">
                {lists.length} {lists.length === 1 ? 'list' : 'lists'} saved
              </p>
            </div>
            {lists.length > 0 && (
              <a
                href="/api/saved-lists/export-all"
                download
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <DownloadCloud className="w-4 h-4" />
                Export All CSV
              </a>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
          {/* Empty State */}
          {lists.length === 0 && (
            <div className="flex items-center justify-center h-full text-center">
              <div className="max-w-md px-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-purple-100 to-accent-100 flex items-center justify-center">
                  <Search className="w-6 h-6 sm:w-8 sm:h-8 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No saved lists yet</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Search for leads and save them from the <strong>Search &amp; Scrape</strong> page.
                </p>
              </div>
            </div>
          )}

          {/* List Cards */}
          {lists.length > 0 && (
            <div className="space-y-3 w-full">
              {lists.map((list) => (
                <div key={list.name}>
                  {/* Card */}
                  <div
                    className="bg-white border border-panel-border rounded-xl shadow-table overflow-hidden"
                  >
                    {/* Card Header — clickable toggle */}
                    <button
                      onClick={() => handleToggleList(list.name)}
                      className="w-full flex items-center justify-between px-4 md:px-5 py-4 hover:bg-gray-50/60 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 border border-panel-border flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{list.name}</h3>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                              <Users className="w-3 h-3" />
                              {list.leadCount} {list.leadCount === 1 ? 'lead' : 'leads'}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                              <Calendar className="w-3 h-3" />
                              {formatDate(list.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {expandedList !== list.name && (
                          <>
                            <a
                              href={`/api/saved-lists/${encodeURIComponent(list.name)}/export/download`}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-md hover:bg-emerald-50 transition-colors"
                            >
                              <Download className="w-3 h-3" />
                              CSV
                            </a>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete "${list.name}" from saved lists?`)) {
                                  handleDeleteList(list.name);
                                }
                              }}
                              className="text-xs font-medium text-red-500 hover:text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </span>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLoadLeads(list.name);
                              }}
                              className="text-xs font-medium text-accent-600 hover:text-accent-700 px-3 py-1.5 rounded-md bg-accent-50 hover:bg-accent-100 transition-colors"
                            >
                              Load Leads
                            </span>
                          </>
                        )}
                        {expandedList === list.name ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Leads Table (expanded) */}
                    {expandedList === list.name && loadedLeads.length > 0 && (
                      <div className="border-t border-panel-border">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-panel-border">
                                <th className="px-3 md:px-4 py-2.5 md:py-3 text-left text-[10px] md:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Business Name
                                </th>
                                <th className="hidden sm:table-cell px-3 md:px-4 py-2.5 md:py-3 text-left text-[10px] md:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Address
                                </th>
                                <th className="px-3 md:px-4 py-2.5 md:py-3 text-left text-[10px] md:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Phone
                                </th>
                                <th className="hidden sm:table-cell px-3 md:px-4 py-2.5 md:py-3 text-left text-[10px] md:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Website
                                </th>
                                <th className="px-3 md:px-4 py-2.5 md:py-3 text-left text-[10px] md:text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                  Email
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-panel-border">
                              {loadedLeads.map((lead) => (
                                <tr
                                  key={lead.id}
                                  className="hover:bg-gray-50/60 transition-colors"
                                >
                                  <td className="px-3 md:px-4 py-2.5 md:py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 md:w-7 md:h-7 rounded-md bg-gray-100 border border-panel-border flex items-center justify-center shrink-0">
                                        <Building2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-gray-500" />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs md:text-sm font-medium text-gray-900 truncate max-w-[140px] md:max-w-[200px]">
                                          {lead.businessName}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="hidden sm:table-cell px-3 md:px-4 py-2.5 md:py-3">
                                    <span className="text-xs md:text-sm text-gray-600 truncate max-w-[140px] md:max-w-[220px] inline-block">
                                      {lead.address || <span className="text-gray-300">-</span>}
                                    </span>
                                  </td>
                                  <td className="px-3 md:px-4 py-2.5 md:py-3">
                                    <span className="text-xs md:text-sm text-gray-700 font-mono">
                                      {lead.phone || <span className="text-gray-300">-</span>}
                                    </span>
                                  </td>
                                  <td className="hidden sm:table-cell px-3 md:px-4 py-2.5 md:py-3">
                                    {lead.website ? (
                                      <a
                                        href={lead.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-xs md:text-sm text-accent-600 hover:text-accent-700 font-medium"
                                      >
                                        <span className="truncate max-w-[100px] md:max-w-[130px]">
                                          {(() => {
                                            try { return new URL(lead.website).hostname; } catch { return lead.website; }
                                          })()}
                                        </span>
                                        <ExternalLink className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
                                      </a>
                                    ) : (
                                      <span className="text-xs md:text-sm text-gray-300">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 md:px-4 py-2.5 md:py-3">
                                    <span className="text-xs md:text-sm text-purple-600 font-medium truncate max-w-[120px] md:max-w-[180px] inline-block">
                                      {lead.email || <span className="text-gray-300">-</span>}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Table footer */}
                        <div className="px-4 md:px-5 py-2.5 md:py-3 border-t border-panel-border bg-gray-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <p className="text-xs text-gray-500">
                            Showing {loadedLeads.length} {loadedLeads.length === 1 ? 'lead' : 'leads'}
                          </p>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                            <button
                              onClick={() => {
                                localStorage.setItem('enrich-import-leads', JSON.stringify(loadedLeads));
                                localStorage.setItem('enrich-list-name', list.name);
                                router.push('/enrich');
                              }}
                              className="flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 bg-gradient-to-r from-purple-500 to-accent-500 hover:from-purple-600 hover:to-accent-600 text-white text-xs font-semibold rounded-lg transition-colors w-full sm:w-auto"
                            >
                              <Sparkles className="w-3 h-3" />
                              Send to Enrich
                            </button>
                            <p className="hidden sm:block text-xs text-gray-400">
                              Saved {formatDate(list.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
