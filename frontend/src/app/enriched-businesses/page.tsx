'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Lead } from '@/lib/types';
import {
  Building2, MapPin, Phone, Mail, Globe,
  ExternalLink, ChevronDown, ChevronRight,
  Trash2, Share2, Target, CheckCircle2,
  AlertCircle, Search, X, Download,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface EnrichedGroup {
  listName: string;
  leads: Lead[];
  enrichedAt: string;
}

export default function EnrichedBusinessesPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [groups, setGroups] = useState<EnrichedGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsRestore, setNeedsRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [sentLists, setSentLists] = useState<Set<string>>(new Set());

  // Load forwarded lists from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sent-to-users');
      if (stored) setSentLists(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  // Load from API, fall back to localStorage
  useEffect(() => {
    const load = async () => {
      let groupsLoaded: EnrichedGroup[] = [];
      try {
        const res = await fetch(`${API}/api/enriched-groups`);
        const data = await res.json();
        if (Array.isArray(data.groups) && data.groups.length > 0) {
          groupsLoaded = data.groups;
          // Check if individual leads table is also populated
          const leadsRes = await fetch(`${API}/api/leads`);
          const leadsData = await leadsRes.json();
          const totalGroupLeads = groupsLoaded.reduce((s: number, g: EnrichedGroup) => s + g.leads.length, 0);
          if (!leadsData.leads || leadsData.leads.length < totalGroupLeads * 0.5) {
            setNeedsRestore(true);
          }
        }
      } catch {}
      if (groupsLoaded.length === 0) {
        // Fallback: load from localStorage
        try {
          const stored = localStorage.getItem('enriched-businesses');
          if (stored) {
            const parsed: EnrichedGroup[] = JSON.parse(stored);
            if (parsed.length > 0) {
              groupsLoaded = parsed;
              setNeedsRestore(true);
            }
          }
        } catch {}
      }
      if (groupsLoaded.length > 0) {
        setGroups(groupsLoaded);
        setLoading(false);
        return;
      }
      // Fallback: backfill from enrich session
      try {
        const sessionLeads = localStorage.getItem('enrich-session-leads');
        const sessionName = localStorage.getItem('enrich-session-name');
        if (sessionLeads && sessionName) {
          const leads: Lead[] = JSON.parse(sessionLeads);
          const completed = leads.filter((l: Lead) => l.phone || l.email || l.website);
          if (completed.length > 0) {
            const entry: EnrichedGroup = {
              listName: sessionName,
              leads: completed,
              enrichedAt: new Date().toISOString(),
            };
            setGroups([entry]);
            setNeedsRestore(true);
          }
        }
      } catch (e) {
        console.warn('[EnrichedBusinesses] Could not load enriched businesses');
      }
      setLoading(false);
    };
    load();
  }, [API]);

  // Save all groups to API whenever groups change
  useEffect(() => {
    if (groups.length === 0) return;
    const save = async () => {
      try {
        await Promise.all(groups.map((g) =>
          fetch(`${API}/api/enriched-groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listName: g.listName,
              leads: g.leads,
              enrichedAt: g.enrichedAt,
            }),
          })
        ));
      } catch {}
    };
    save();
  }, [groups, API]);

  const totalEnriched = useMemo(
    () => groups.reduce((sum, g) => sum + g.leads.length, 0),
    [groups]
  );

  const toggleGroup = (name: string) => {
    setExpandedGroup((prev) => (prev === name ? null : name));
  };

  const restoreToServer = async () => {
    setRestoring(true);
    try {
      const stored = localStorage.getItem('enriched-businesses');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const res = await fetch(`${API}/api/enriched-groups/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (res.ok) {
        setRestored(true);
        console.log(`Restored ${data.groupsRestored} groups, ${data.leadsRestored} leads`);
      }
    } catch (err: any) {
      console.error('Restore failed:', err);
    }
    setRestoring(false);
  };

  const forwardToKanban = (leads: Lead[], listName: string) => {
    const entry = { listName, leads, enrichedAt: new Date().toISOString(), sentTo: 'users' };
    try {
      const existing = JSON.parse(localStorage.getItem('enriched-businesses') || '[]');
      const merged = [...existing.filter((g: any) => g.listName !== listName), entry];
      localStorage.setItem('enriched-businesses', JSON.stringify(merged));
    } catch {
      localStorage.setItem('enriched-businesses', JSON.stringify([entry]));
    }
    // Mark as sent
    const next = new Set(sentLists);
    next.add(listName);
    setSentLists(next);
    localStorage.setItem('sent-to-users', JSON.stringify(Array.from(next)));
    // Un-hide from pipeline if previously deleted
    try {
      const hidden = JSON.parse(localStorage.getItem('pipeline-hidden') || '[]');
      const cleaned = hidden.filter((h: string) => h !== listName);
      if (cleaned.length < hidden.length) localStorage.setItem('pipeline-hidden', JSON.stringify(cleaned));
    } catch {}
    router.push('/lead-kanban');
  };

  const forwardToScore = (leads: Lead | Lead[]) => {
    const items = Array.isArray(leads) ? leads : [leads];
    try {
      const existing = JSON.parse(localStorage.getItem('lead-score-queue') || '[]');
      localStorage.setItem('lead-score-queue', JSON.stringify([...existing, ...items]));
    } catch {
      localStorage.setItem('lead-score-queue', JSON.stringify(items));
    }
    router.push('/lead-score');
  };

  const deleteGroup = async (name: string) => {
    try {
      await fetch(`${API}/api/enriched-groups/${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch {}
    setGroups((prev) => prev.filter((g) => g.listName !== name));
    if (expandedGroup === name) setExpandedGroup(null);
  };

  const filteredGroups = useMemo(() => {
    if (!searchQ) return groups;
    const q = searchQ.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        leads: g.leads.filter(
          (l) =>
            l.businessName?.toLowerCase().includes(q) ||
            l.phone?.toLowerCase().includes(q) ||
            l.email?.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.leads.length > 0);
  }, [groups, searchQ]);

  const exportGroupCSV = (group: EnrichedGroup) => {
    const headers = ['Business Name', 'Address', 'Phone', 'Email', 'Website', 'LinkedIn', 'Sources'];
    const rows = group.leads.map((l) => [
      `"${(l.businessName || '').replace(/"/g, '""')}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${l.phone || ''}"`,
      `"${l.email || ''}"`,
      `"${l.website || ''}"`,
      `"${l.socialLinks?.linkedin || ''}"`,
      `"${(l.sources || []).map((s) => s.name || s.type || String(s)).join('; ')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.listName.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-panel-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enriched Businesses</h2>
                <p className="text-xs text-gray-500">{groups.length} lists · {totalEnriched} leads</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {needsRestore && !restored && (
                <button
                  onClick={restoreToServer}
                  disabled={restoring}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
                >
                  {restoring ? 'Restoring...' : '🔄 Restore to Server'}
                </button>
              )}
              {restored && (
                <span className="text-xs font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-2 rounded-lg">✅ Restored</span>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="w-48 pl-8 pr-3 py-2 text-xs border border-panel-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No enriched businesses</h3>
                <p className="text-sm text-gray-500">
                  Search for leads first, then enrich them. Results appear here.
                </p>
                <button
                  onClick={() => router.push('/?tab=search')}
                  className="mt-4 px-4 py-2 bg-accent-500 text-white text-sm font-semibold rounded-lg hover:bg-accent-600 transition-colors"
                >
                  Go to Search
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
              {filteredGroups.map((group) => {
                const isExpanded = expandedGroup === group.listName;
                const hasEnriched = group.leads.some((l) => l.phone || l.email);
                return (
                  <div key={group.listName} className="bg-white rounded-xl border border-panel-border overflow-hidden shadow-sm">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.listName)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
                        )}
                        <div className="text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{group.listName}</p>
                            {hasEnriched && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Enriched</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-gray-400">{group.leads.length} leads</span>
                            <span className="text-xs text-gray-400">{new Date(group.enrichedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {sentLists.has(group.listName) ? (
                          <span className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle2 className="w-3 h-3" /> Sent
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              forwardToKanban(group.leads, group.listName);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                          >
                            <Share2 className="w-3 h-3" /> Send to Users
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            forwardToScore(group.leads);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                        >
                          <Target className="w-3 h-3" /> Score
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); exportGroupCSV(group); }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                          title="Export CSV"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteGroup(group.listName); }}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete group"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </button>

                    {/* Group Leads */}
                    {isExpanded && (
                      <div className="border-t border-panel-border">
                        {group.leads.length === 0 ? (
                          <div className="px-5 py-8 text-center text-sm text-gray-400">No leads in this group</div>
                        ) : (
                          <div className="divide-y divide-panel-border">
                            {group.leads.map((lead, idx) => (
                              <div key={`${lead.businessName}-${idx}`} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900">{lead.businessName}</p>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                                      {lead.address && (
                                        <span className="flex items-center gap-1 text-xs text-gray-500">
                                          <MapPin className="w-3 h-3 shrink-0" /> {lead.address}
                                        </span>
                                      )}
                                      {lead.phone && (
                                        <span className="flex items-center gap-1 text-xs text-blue-600">
                                          <Phone className="w-3 h-3 shrink-0" /> {lead.phone}
                                        </span>
                                      )}
                                      {lead.email && (
                                        <span className="flex items-center gap-1 text-xs text-blue-600">
                                          <Mail className="w-3 h-3 shrink-0" /> {lead.email}
                                        </span>
                                      )}
                                      {lead.website && (
                                        <a
                                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Globe className="w-3 h-3 shrink-0" />
                                          {lead.website.replace(/^https?:\/\//, '').slice(0, 30)}
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                    </div>
                                    {lead.rating && (
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[11px] text-amber-600 font-medium">★ {lead.rating}</span>
                                        {lead.reviewCount !== undefined && lead.reviewCount !== null && (
                                          <span className="text-[11px] text-gray-400">({lead.reviewCount} reviews)</span>
                                        )}
                                      </div>
                                    )}
                                    {lead.sources && lead.sources.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {lead.sources.map((src, i) => (
                                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {src.name || src.type || String(src)}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {lead.enrichmentStatus === 'cloudflare_locked' && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <AlertCircle className="w-3 h-3 text-amber-500" />
                                        <span className="text-[11px] text-amber-600 font-medium">Cloudflare Locked</span>
                                      </div>
                                    )}
                                    {lead.enrichmentStatus === 'enriched' && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                                        <span className="text-[11px] text-green-600 font-medium">Enriched</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Right: enrichment data badges */}
                                  <div className="flex items-center gap-1 shrink-0">
                                    {lead.phone && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Phone</span>
                                    )}
                                    {lead.email && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Email</span>
                                    )}
                                    {lead.website && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Site</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
