'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {
  Target, TrendingUp, MessageSquare, Phone, Search,
  ChevronDown, ChevronUp, Trash2, Download, Clock,
  CheckCircle2, Zap, BarChart3, Globe, Edit3, Wand2,
  Sparkles, Save, X,
} from 'lucide-react';

interface LeadScoreCriteria {
  websiteQuality: number;
  reviewCount: number;
  googleMapsRank: number;
  socialMedia: number;
  responsiveness: number;
}

interface LeadScoreEntry {
  id: string;
  businessName: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  reviewCount?: number | null;
  rating?: number | null;
  socialLinks?: Record<string, string>;
  scores: LeadScoreCriteria;
  totalScore: number;
  tier: 'hot' | 'warm' | 'cold';
  scoredAt: string;
  notes?: string;
}

const SCORE_CFG: Record<string, { label: string; hint: string; max: number; auto: boolean; options: { value: number; label: string; desc: string }[]; }> = {
  websiteQuality: {
    label: 'Website Quality', hint: 'Outdated site = needs SEO more = higher priority', max: 3, auto: false,
    options: [
      { value: 1, label: 'Modern & mobile-friendly', desc: 'Low priority' },
      { value: 2, label: 'Mediocre', desc: 'Medium — could upgrade' },
      { value: 3, label: 'Outdated / poor', desc: 'High — needs SEO urgently' },
    ],
  },
  reviewCount: {
    label: 'Reviews Count', hint: 'Under 10 = struggling. 50+ = established. Both are opportunities.', max: 4, auto: true,
    options: [
      { value: 1, label: '10-49 reviews', desc: 'Some presence' },
      { value: 2, label: 'Unknown / null', desc: 'Default medium' },
      { value: 3, label: 'Under 10 reviews', desc: 'Struggling for reputation' },
      { value: 4, label: '50+ reviews', desc: 'Established — bigger opportunity' },
    ],
  },
  googleMapsRank: {
    label: 'Google Maps Rank', hint: 'Not ranking top 3 = need local SEO.', max: 2, auto: false,
    options: [
      { value: 1, label: 'In top 3', desc: 'Already ranking well' },
      { value: 2, label: 'Not in top 3', desc: 'Needs local SEO help' },
    ],
  },
  socialMedia: {
    label: 'Social Media', hint: 'No social = no pipeline. Easy upsell.', max: 1, auto: true,
    options: [
      { value: 0, label: 'Has social profiles', desc: 'Has some presence' },
      { value: 1, label: 'No social presence', desc: 'Upsell opportunity' },
    ],
  },
  responsiveness: {
    label: 'Responsiveness', hint: 'No answer = losing leads daily.', max: 1, auto: false,
    options: [
      { value: 0, label: 'Answered', desc: 'Responsive' },
      { value: 1, label: 'No answer', desc: 'Losing leads — urgent' },
    ],
  },
};

const API = process.env.NEXT_PUBLIC_API_URL || '';

function autoScore(lead: Partial<LeadScoreEntry>): LeadScoreCriteria {
  const websiteQuality = 2;
  let reviewCount = 2;
  if (lead.reviewCount !== undefined && lead.reviewCount !== null) {
    if (lead.reviewCount < 10) reviewCount = 3;
    else if (lead.reviewCount >= 50) reviewCount = 4;
    else if (lead.reviewCount >= 10) reviewCount = 1;
  }
  const googleMapsRank = 2;
  const socialLinks = lead.socialLinks || {};
  const socialMedia = Object.keys(socialLinks).length > 0 ? 0 : 1;
  const responsiveness = 0;
  return { websiteQuality, reviewCount, googleMapsRank, socialMedia, responsiveness };
}

function calcTotal(s: LeadScoreCriteria): number {
  return s.websiteQuality + s.reviewCount + s.googleMapsRank + s.socialMedia + s.responsiveness;
}

function getTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 8) return 'hot';
  if (score >= 5) return 'warm';
  return 'cold';
}

function tierMeta(tier: string) {
  switch (tier) {
    case 'hot': return { icon: Zap, color: 'text-red-500 bg-red-50 border-red-200', badge: 'bg-red-500 text-white', label: 'Contact within 24h' };
    case 'warm': return { icon: TrendingUp, color: 'text-amber-500 bg-amber-50 border-amber-200', badge: 'bg-amber-500 text-white', label: 'Add to sequence this week' };
    default: return { icon: Clock, color: 'text-blue-500 bg-blue-50 border-blue-200', badge: 'bg-blue-500 text-white', label: 'Bulk email campaign' };
  }
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

export default function LeadScorePage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingLeads, setPendingLeads] = useState<LeadScoreEntry[]>([]);
  const [savedScores, setSavedScores] = useState<LeadScoreEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<LeadScoreCriteria | null>(null);
  const [filterTier, setFilterTier] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [showGuide, setShowGuide] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Load saved scores from API + pending from localStorage
  const loadSaved = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/lead-scores`);
      const data = await res.json();
      if (Array.isArray(data.entries)) setSavedScores(data.entries);
    } catch { /* offline fallback — try localStorage */
      try {
        const saved = JSON.parse(localStorage.getItem('lead-score-saved') || '[]');
        setSavedScores(saved);
      } catch {}
    }
  }, [API]);

  useEffect(() => {
    loadSaved();
    try {
      const q = JSON.parse(localStorage.getItem('lead-score-queue') || '[]');
      if (q.length > 0) {
        const mapped: LeadScoreEntry[] = q.map((l: any) => ({
          id: l.id || crypto.randomUUID(),
          businessName: l.businessName || '',
          phone: l.phone || '',
          email: l.email || '',
          website: l.website || '',
          address: l.address || '',
          reviewCount: l.reviewCount ?? l.reviews ?? null,
          rating: l.rating ?? null,
          socialLinks: l.socialLinks || {},
          scores: autoScore(l),
          totalScore: 0, tier: 'warm' as const, scoredAt: new Date().toISOString(),
        }));
        setPendingLeads(mapped);
        localStorage.removeItem('lead-score-queue');
      }
    } catch {}
  }, [loadSaved]);

  const persistSaved = async (entries: LeadScoreEntry[]) => {
    setSavedScores(entries);
    // Save to API
    try {
      await fetch(`${API}/api/lead-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
    } catch { /* fallback localStorage */
      localStorage.setItem('lead-score-saved', JSON.stringify(entries));
    }
  };

  const updateScore = (id: string, key: keyof LeadScoreCriteria, val: number) => {
    setPendingLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const scores = { ...l.scores, [key]: val };
        const total = calcTotal(scores);
        return { ...l, scores, totalScore: total, tier: getTier(total) };
      })
    );
  };

  const analyzeAll = async () => {
    setLoading(true);
    // Compute scores for all pending leads
    const updated = pendingLeads.map((l) => {
      const total = calcTotal(l.scores);
      return { ...l, totalScore: total, tier: getTier(total), scoredAt: new Date().toISOString() };
    });
    // Save all to API
    await persistSaved([...updated, ...savedScores]);
    setPendingLeads([]);
    setLoading(false);
    setExpandedId(null);
  };

  const saveLead = async (entry: LeadScoreEntry) => {
    const total = calcTotal(entry.scores);
    const final = { ...entry, totalScore: total, tier: getTier(total), scoredAt: new Date().toISOString() };
    await persistSaved([final, ...savedScores]);
    setPendingLeads((prev) => prev.filter((l) => l.id !== entry.id));
    setExpandedId(null);
  };

  const removePending = (id: string) => {
    setPendingLeads((prev) => prev.filter((l) => l.id !== id));
    setExpandedId((prev) => prev === id ? null : prev);
  };

  const removeSaved = async (id: string) => {
    try { await fetch(`${API}/api/lead-scores/${id}`, { method: 'DELETE' }); } catch {}
    persistSaved(savedScores.filter((e) => e.id !== id));
  };

  const startEdit = (entry: LeadScoreEntry) => {
    setEditingId(entry.id);
    setEditValues({ ...entry.scores });
    setExpandedId(entry.id);
  };

  const saveEdit = async () => {
    if (!editingId || !editValues) return;
    const entry = savedScores.find((e) => e.id === editingId);
    if (!entry) return;
    const total = calcTotal(editValues);
    const updated = { ...entry, scores: editValues, totalScore: total, tier: getTier(total) };
    await persistSaved(savedScores.map((e) => e.id === editingId ? updated : e));
    setEditingId(null);
    setEditValues(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const exportCSV = (entries: LeadScoreEntry[]) => {
    const h = ['Business Name', 'Phone', 'Email', 'Website', 'Score', 'Tier', 'Website Quality', 'Reviews', 'Maps Rank', 'Social', 'Responsiveness', 'Scored At'];
    const r = entries.map((e) => [
      `"${e.businessName.replace(/"/g, '""')}"`, `"${e.phone || ''}"`, `"${e.email || ''}"`, `"${e.website || ''}"`,
      e.totalScore, e.tier.toUpperCase(),
      e.scores.websiteQuality, e.scores.reviewCount, e.scores.googleMapsRank, e.scores.socialMedia, e.scores.responsiveness,
      `"${formatDate(e.scoredAt)}"`,
    ]);
    const csv = [h.join(','), ...r.map((x) => x.join(','))].join('\n');
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `lead-scores-${Date.now()}.csv`; a.click();
  };

  const filteredPending = useMemo(() => {
    let x = pendingLeads;
    if (filterTier !== 'all') x = x.filter((l) => l.tier === filterTier);
    if (searchQ) { const q = searchQ.toLowerCase(); x = x.filter((l) => l.businessName.toLowerCase().includes(q)); }
    return x;
  }, [pendingLeads, filterTier, searchQ]);

  const filteredSaved = useMemo(() => {
    let x = savedScores;
    if (filterTier !== 'all') x = x.filter((e) => e.tier === filterTier);
    if (searchQ) { const q = searchQ.toLowerCase(); x = x.filter((e) => e.businessName.toLowerCase().includes(q)); }
    return x;
  }, [savedScores, filterTier, searchQ]);

  // Kanban columns
  const hotLeads = useMemo(() => filteredSaved.filter((e) => e.tier === 'hot'), [filteredSaved]);
  const warmLeads = useMemo(() => filteredSaved.filter((e) => e.tier === 'warm'), [filteredSaved]);
  const coldLeads = useMemo(() => filteredSaved.filter((e) => e.tier === 'cold'), [filteredSaved]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-panel-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Lead Score</h2>
                <p className="text-xs text-gray-500">{pendingLeads.length} pending · {savedScores.length} scored</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {pendingLeads.length > 0 && (
                <button onClick={analyzeAll} disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs font-semibold rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                >
                  {loading ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  Analyze Scorer
                </button>
              )}
              <button onClick={() => exportCSV(savedScores)} disabled={savedScores.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
              ><Download className="w-3.5 h-3.5" /> Export</button>
            </div>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Search business..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-panel-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex gap-1">
              {['all', 'hot', 'warm', 'cold'].map((t) => (
                <button key={t} onClick={() => setFilterTier(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border capitalize ${
                    filterTier === t
                      ? t === 'hot' ? 'bg-red-50 border-red-200 text-red-600' : t === 'warm' ? 'bg-amber-50 border-amber-200 text-amber-600' : t === 'cold' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-100 border-gray-200 text-gray-700'
                      : 'border-panel-border text-gray-500 hover:bg-gray-50'
                  }`}>{t === 'all' ? 'All' : t}</button>
              ))}
              <button onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-panel-border text-gray-500 hover:bg-gray-50"
              >{viewMode === 'list' ? 'Kanban' : 'List'}</button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          {pendingLeads.length === 0 && savedScores.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center"><Target className="w-8 h-8 text-gray-300" /></div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads to score</h3>
                <p className="text-sm text-gray-500">Go to <strong>Enriched Businesses</strong>, click <strong>Score</strong> to forward leads here.</p>
                <button onClick={() => router.push('/enriched-businesses')} className="mt-4 px-4 py-2 bg-accent-500 text-white text-sm font-semibold rounded-lg hover:bg-accent-600 transition-colors">Go to Enriched Businesses</button>
              </div>
            </div>
          ) : viewMode === 'kanban' && savedScores.length > 0 ? (
            /* ── Kanban Board ── */
            <div className="h-full flex gap-4 p-6 overflow-x-auto">
              {[
                { tier: 'hot', label: 'Hot Leads', action: 'Contact within 24h', icon: Zap, color: 'bg-red-50 border-red-200', leads: hotLeads, scoreRange: '8-10' },
                { tier: 'warm', label: 'Warm Leads', action: 'Add to sequence this week', icon: TrendingUp, color: 'bg-amber-50 border-amber-200', leads: warmLeads, scoreRange: '5-7' },
                { tier: 'cold', label: 'Cold Leads', action: 'Bulk email campaign', icon: Clock, color: 'bg-blue-50 border-blue-200', leads: coldLeads, scoreRange: '1-4' },
              ].map((col) => (
                <div key={col.tier} className="flex-1 min-w-[260px] max-w-[360px] flex flex-col">
                  <div className={`rounded-t-xl border border-b-0 px-4 py-3 ${col.color}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><col.icon className="w-4 h-4" /><span className="text-sm font-bold capitalize">{col.label}</span></div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">{col.leads.length}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">Score {col.scoreRange} · {col.action}</p>
                  </div>
                  <div className={`flex-1 border rounded-b-xl p-3 space-y-2 overflow-y-auto ${col.color}`}>
                    {col.leads.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-xs text-gray-400 italic">Drop leads here</div>
                    ) : col.leads.map((entry) => (
                      <div key={entry.id} className="bg-white rounded-lg border border-panel-border shadow-sm hover:shadow-md transition-shadow p-3 group">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 flex-1">{entry.businessName}</p>
                          <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${tierMeta(entry.tier).badge}`}>{entry.totalScore}</span>
                        </div>
                        <div className="space-y-0.5 mb-2 text-[10px] text-gray-500">
                          {entry.phone && <p><Phone className="w-2.5 h-2.5 inline mr-1" />{entry.phone}</p>}
                          {entry.email && <p><MessageSquare className="w-2.5 h-2.5 inline mr-1" />{entry.email}</p>}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(entry)} className="p-1 text-gray-300 hover:text-accent-500 transition-colors"><Edit3 className="w-3 h-3" /></button>
                          <button onClick={() => removeSaved(entry.id)} className="p-1 text-gray-300 hover:text-red-500 ml-auto transition-colors"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── List View ── */
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
              {/* Pending */}
              {filteredPending.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Pending Scoring ({filteredPending.length})
                    <button onClick={analyzeAll} disabled={loading}
                      className="ml-auto flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs font-semibold rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50"
                    >
                      <Wand2 className="w-3 h-3" /> Analyze All
                    </button>
                  </h3>
                  <div className="space-y-2">
                    {filteredPending.map((entry) => {
                      const tm = tierMeta(entry.tier);
                      const Ti = tm.icon;
                      const expanded = expandedId === entry.id;
                      return (
                        <div key={entry.id} className="bg-white rounded-xl border border-panel-border overflow-hidden">
                          <button onClick={() => setExpandedId(expanded ? null : entry.id)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${tm.color}`}><Ti className="w-3.5 h-3.5" /></div>
                              <div className="text-left min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{entry.businessName}</p>
                                <p className="text-xs text-gray-400 truncate">{entry.phone || entry.email || ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <div className="flex items-center gap-1">
                                <span className={`text-lg font-bold ${entry.tier === 'hot' ? 'text-red-500' : entry.tier === 'warm' ? 'text-amber-500' : 'text-blue-500'}`}>{calcTotal(entry.scores)}</span>
                                <span className="text-xs text-gray-400">/10</span>
                              </div>
                              {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </div>
                          </button>
                          {expanded && (
                            <div className="border-t border-panel-border px-4 py-3 space-y-3">
                              {Object.entries(SCORE_CFG).map(([key, cfg]) => {
                                const k = key as keyof LeadScoreCriteria;
                                return (
                                  <div key={key}>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="text-xs font-semibold text-gray-700">
                                        {cfg.label}
                                        {'auto' in cfg && cfg.auto && <span className="ml-1.5 text-[10px] font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">auto</span>}
                                      </label>
                                      <span className="text-xs text-gray-400">{entry.scores[k]}/{cfg.max}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">{cfg.hint}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {cfg.options.map((opt, i) => (
                                        <button key={`${opt.value}-${i}`} onClick={() => updateScore(entry.id, k, opt.value)}
                                          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-left ${
                                            entry.scores[k] === opt.value ? 'bg-accent-50 border-accent-300 text-accent-700' : 'border-panel-border text-gray-500 hover:bg-gray-50'
                                          }`}>
                                          <span className="block">{opt.label}</span>
                                          <span className="block text-[10px] text-gray-400 font-normal mt-0.5">{opt.desc}</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="flex items-center justify-between pt-2 border-t border-panel-border">
                                <button onClick={() => removePending(entry.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-500 rounded-lg transition-colors">
                                  <Trash2 className="w-3 h-3" /> Skip
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400">Score: <strong className={entry.tier === 'hot' ? 'text-red-500' : entry.tier === 'warm' ? 'text-amber-500' : 'text-blue-500'}>{calcTotal(entry.scores)}/10</strong></span>
                                  <button onClick={() => saveLead(entry)} className="flex items-center gap-1.5 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold rounded-lg transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Save Score
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Saved Scored Leads */}
              {filteredSaved.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Scored Leads ({filteredSaved.length})
                  </h3>
                  <div className="space-y-1">
                    {filteredSaved.map((entry) => {
                      const tm = tierMeta(entry.tier);
                      const Ti = tm.icon;
                      const isEditing = editingId === entry.id;
                      return (
                        <div key={entry.id} className="bg-white rounded-lg border border-panel-border overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${tm.color}`}><Ti className="w-3 h-3" /></div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{entry.businessName}</p>
                                <div className="flex items-center gap-2 text-xs text-gray-400">
                                  {entry.phone && <span>{entry.phone}</span>}
                                  {entry.email && <span>{entry.email}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-gray-400">{formatDate(entry.scoredAt)}</span>
                              <div className="flex items-center gap-1">
                                <span className={`text-base font-bold ${entry.tier === 'hot' ? 'text-red-500' : entry.tier === 'warm' ? 'text-amber-500' : 'text-blue-500'}`}>{entry.totalScore}</span>
                                <span className="text-[10px] text-gray-400">/10</span>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${entry.tier === 'hot' ? 'bg-red-50 text-red-600' : entry.tier === 'warm' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{entry.tier}</span>
                              {isEditing ? (
                                <div className="flex gap-1">
                                  <button onClick={saveEdit} className="p-1 text-green-500 hover:text-green-600 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                                  <button onClick={cancelEdit} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(entry)} className="p-1 text-gray-300 hover:text-accent-500 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removeSaved(entry.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Edit panel */}
                          {isEditing && editValues && (
                            <div className="border-t border-panel-border px-4 py-3 bg-gray-50/50">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                {(Object.keys(SCORE_CFG) as (keyof LeadScoreCriteria)[]).map((key) => (
                                  <div key={key}>
                                    <label className="text-[10px] font-semibold text-gray-600 block mb-1">{SCORE_CFG[key].label.replace(/ .*/, '')}</label>
                                    <select value={editValues[key]} onChange={(e) => setEditValues({ ...editValues, [key]: Number(e.target.value) })}
                                      className="w-full px-2 py-1.5 text-[11px] border border-panel-border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-500 bg-white"
                                    >
                                      {SCORE_CFG[key].options.map((opt, i) => (
                                        <option key={`${opt.value}-${i}`} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Scoring Guide ── */}
        <div className="mt-8 p-5 bg-gradient-to-br from-purple-50/60 to-accent-50/40 border border-purple-100/60 rounded-xl">
          <button onClick={() => setShowGuide(!showGuide)} className="w-full text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-purple-500" /> About Lead Scoring
            {showGuide ? <ChevronUp className="w-4 h-4 ml-auto text-gray-400" /> : <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />}
          </button>
          {showGuide && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500 leading-relaxed">
            <div className="space-y-2">
              <p className="font-medium text-gray-600">Score Tiers</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span><span><strong className="text-gray-700">Hot</strong> (8–10) — Contact within 24h</span></div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0"></span><span><strong className="text-gray-700">Warm</strong> (5–7) — Add to sequence this week</span></div>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span><span><strong className="text-gray-700">Cold</strong> (1–4) — Bulk email, low priority</span></div>
              </div>
              <p className="pt-1">Each lead scores <strong className="text-gray-600">3–10</strong>. Calculated from 5 factors below.</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-gray-600">5 Factors (Additive Model)</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong className="text-gray-600">Website Quality</strong> — Older/poorer sites = higher score (more SEO need)</li>
                <li><strong className="text-gray-600">Review Count</strong> — Under 10 or 50+ = opportunity</li>
                <li><strong className="text-gray-600">Google Maps Rank</strong> — Low rank = higher SEO potential</li>
                <li><strong className="text-gray-600">Social Media</strong> — No social or incomplete = needs help</li>
                <li><strong className="text-gray-600">Responsiveness</strong> — No phone/email listed = easier to reach them first</li>
              </ul>
              <p className="pt-1">Scores auto-calculate from enrichment data. The <strong className="text-gray-600">Analyze Scorer</strong> button runs them in bulk. Click <strong className="text-gray-600">Edit</strong> to override any score manually.</p>
            </div>
          </div>
          )}
        </div>

      </div>
    </div>
  );
}
