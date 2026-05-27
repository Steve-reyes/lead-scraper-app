'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {
  Target,
  Star,
  TrendingUp,
  MessageSquare,
  Phone,
  Search,
  ChevronDown,
  ChevronUp,
  Trash2,
  Download,
  Clock,
  CheckCircle2,
  Zap,
  BarChart3,
  Globe,
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
  reviewCount?: number;
  rating?: number;
  socialLinks?: { linkedin?: string };
  scores: LeadScoreCriteria;
  totalScore: number;
  tier: 'hot' | 'warm' | 'cold';
  scoredAt: string;
  notes?: string;
}

const SCORE_CFG = {
  websiteQuality: {
    label: 'Website Quality',
    hint: 'Outdated site = needs SEO more = higher priority',
    max: 3,
    options: [
      { value: 1, label: 'Modern & mobile-friendly', desc: 'Low priority — site looks good' },
      { value: 2, label: 'Average / basic site', desc: 'Medium — could upgrade' },
      { value: 3, label: 'Outdated / no site', desc: 'High — needs SEO urgently' },
    ],
  },
  reviewCount: {
    label: 'Reviews Count',
    hint: 'Few reviews = struggling with reputation. Many reviews = established. Both are opportunities.',
    max: 3,
    options: [
      { value: 1, label: '50+ reviews', desc: 'Established reputation' },
      { value: 2, label: '10-49 reviews', desc: 'Growing presence' },
      { value: 3, label: 'Under 10 reviews', desc: 'Struggling for reputation' },
    ],
  },
  googleMapsRank: {
    label: 'Google Maps Rank',
    hint: 'Not ranking top 3 = need local SEO. Best prospect.',
    max: 2,
    options: [
      { value: 1, label: 'In top 3', desc: 'Already ranking well' },
      { value: 2, label: 'Not in top 3', desc: 'Needs local SEO help' },
    ],
  },
  socialMedia: {
    label: 'Social Media',
    hint: 'No social presence = no pipeline. Easy upsell.',
    max: 1,
    options: [
      { value: 0, label: 'Has social profiles', desc: 'Has some presence' },
      { value: 1, label: 'No social presence', desc: 'Upsell opportunity' },
    ],
  },
  responsiveness: {
    label: 'Responsiveness',
    hint: 'No answer = losing leads daily. Easy close.',
    max: 1,
    options: [
      { value: 0, label: 'Answered', desc: 'Responsive' },
      { value: 1, label: 'No answer', desc: 'Losing leads — urgent' },
    ],
  },
};

function defaultScores(): LeadScoreCriteria {
  return { websiteQuality: 2, reviewCount: 2, googleMapsRank: 2, socialMedia: 0, responsiveness: 0 };
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
  const [filterTier, setFilterTier] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  // Load pending queue + saved scores from localStorage
  useEffect(() => {
    try {
      const q = JSON.parse(localStorage.getItem('lead-score-queue') || '[]');
      if (q.length > 0) {
        const mapped = q.map((l: any) => ({
          id: l.id || crypto.randomUUID(),
          businessName: l.businessName || '',
          phone: l.phone,
          email: l.email,
          website: l.website,
          address: l.address,
          reviewCount: l.reviewCount,
          rating: l.rating,
          socialLinks: l.socialLinks,
          scores: defaultScores(),
          totalScore: 7,
          tier: 'warm' as const,
          scoredAt: new Date().toISOString(),
        }));
        setPendingLeads(mapped);
        localStorage.removeItem('lead-score-queue');
      }
    } catch {}

    try {
      const saved = JSON.parse(localStorage.getItem('lead-score-saved') || '[]');
      setSavedScores(saved);
    } catch {}
  }, []);

  const persistSaved = (entries: LeadScoreEntry[]) => {
    localStorage.setItem('lead-score-saved', JSON.stringify(entries));
    setSavedScores(entries);
  };

  const updateScore = (id: string, key: keyof LeadScoreCriteria, val: number) => {
    setPendingLeads((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, scores: { ...l.scores, [key]: val }, totalScore: calcTotal({ ...l.scores, [key]: val }), tier: getTier(calcTotal({ ...l.scores, [key]: val })) } : l
      )
    );
  };

  const saveLead = (entry: LeadScoreEntry) => {
    const final = { ...entry, totalScore: calcTotal(entry.scores), tier: getTier(calcTotal(entry.scores)), scoredAt: new Date().toISOString() };
    const next = [final, ...savedScores];
    persistSaved(next);
    setPendingLeads((prev) => prev.filter((l) => l.id !== entry.id));
    setExpandedId(null);
  };

  const removePending = (id: string) => {
    setPendingLeads((prev) => prev.filter((l) => l.id !== id));
    setExpandedId((prev) => prev === id ? null : prev);
  };

  const removeSaved = (id: string) => {
    persistSaved(savedScores.filter((e) => e.id !== id));
  };

  const exportCSV = (entries: LeadScoreEntry[]) => {
    const h = ['Business Name', 'Phone', 'Email', 'Website', 'Score', 'Tier', 'Website Quality', 'Reviews', 'Maps Rank', 'Social', 'Responsiveness', 'Scored At'];
    const r = entries.map((e) => [
      `"${e.businessName.replace(/"/g, '""')}"`,
      `"${e.phone || ''}"`,
      `"${e.email || ''}"`,
      `"${e.website || ''}"`,
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
              <button
                onClick={() => exportCSV(savedScores)}
                disabled={savedScores.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
              ><Download className="w-3.5 h-3.5" /> Export</button>
              {savedScores.length > 0 && (
                <button onClick={() => persistSaved([])} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
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
            {['all', 'hot', 'warm', 'cold'].map((t) => (
              <button key={t} onClick={() => setFilterTier(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border capitalize ${
                  filterTier === t
                    ? t === 'hot' ? 'bg-red-50 border-red-200 text-red-600'
                      : t === 'warm' ? 'bg-amber-50 border-amber-200 text-amber-600'
                      : t === 'cold' ? 'bg-blue-50 border-blue-200 text-blue-600'
                      : 'bg-gray-100 border-gray-200 text-gray-700'
                    : 'border-panel-border text-gray-500 hover:bg-gray-50'
                }`}>{t === 'all' ? 'All' : t}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          {pendingLeads.length === 0 && savedScores.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Target className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads to score</h3>
                <p className="text-sm text-gray-500">Go to <strong>Enriched Businesses</strong>, click <strong>Score</strong> to forward leads here.</p>
                <button onClick={() => router.push('/enriched-businesses')} className="mt-4 px-4 py-2 bg-accent-500 text-white text-sm font-semibold rounded-lg hover:bg-accent-600 transition-colors">Go to Enriched Businesses</button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
              {/* Tier Summary */}
              {savedScores.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { tier: 'hot', icon: Zap, color: 'text-red-500 bg-red-50 border-red-200' },
                    { tier: 'warm', icon: TrendingUp, color: 'text-amber-500 bg-amber-50 border-amber-200' },
                    { tier: 'cold', icon: Clock, color: 'text-blue-500 bg-blue-50 border-blue-200' },
                  ].map((t) => (
                    <div key={t.tier} className={`rounded-xl border p-4 ${t.color}`}>
                      <div className="flex items-center justify-between">
                        <t.icon className="w-5 h-5" />
                        <span className="text-2xl font-bold">{savedScores.filter((e) => e.tier === t.tier).length}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1 capitalize">{t.tier} Leads</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Pending Scoring */}
              {filteredPending.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Pending Scoring ({filteredPending.length})
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
                                      <label className="text-xs font-semibold text-gray-700">{cfg.label}</label>
                                      <span className="text-xs text-gray-400">{entry.scores[k]}/{cfg.max}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">{cfg.hint}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {cfg.options.map((opt) => (
                                        <button key={opt.value} onClick={() => updateScore(entry.id, k, opt.value)}
                                          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-left ${
                                            entry.scores[k] === opt.value
                                              ? 'bg-accent-50 border-accent-300 text-accent-700'
                                              : 'border-panel-border text-gray-500 hover:bg-gray-50'
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

              {/* Saved Scores */}
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
                      return (
                        <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 bg-white rounded-lg border border-panel-border hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${tm.color}`}><Ti className="w-3 h-3" /></div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{entry.businessName}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">{entry.phone && <span>{entry.phone}</span>}{entry.email && <span>{entry.email}</span>}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-gray-400">{formatDate(entry.scoredAt)}</span>
                            <div className="flex items-center gap-1">
                              <span className={`text-base font-bold ${entry.tier === 'hot' ? 'text-red-500' : entry.tier === 'warm' ? 'text-amber-500' : 'text-blue-500'}`}>{entry.totalScore}</span>
                              <span className="text-[10px] text-gray-400">/10</span>
                            </div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${entry.tier === 'hot' ? 'bg-red-50 text-red-600' : entry.tier === 'warm' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>{entry.tier}</span>
                            <button onClick={() => removeSaved(entry.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
