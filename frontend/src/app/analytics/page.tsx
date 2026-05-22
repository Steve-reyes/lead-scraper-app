'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  BarChart3,
  Users,
  Phone,
  Mail,
  Globe,
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  Activity,
  PieChart,
  AlertCircle,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'new', label: 'New', color: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-green-500' },
  { id: 'closed', label: 'Won', color: 'bg-emerald-600' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500' },
  { id: 'incomplete', label: 'Incomplete', color: 'bg-orange-400' },
];

interface Lead {
  id: string;
  businessName: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  kanbanStatus: string;
  listName?: string;
  enrichmentStatus?: string;
}

interface EnrichedGroup {
  listName: string;
  leads: Lead[];
  enrichedAt: string;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [groups, setGroups] = useState<EnrichedGroup[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('enriched-businesses');
    if (!stored) return;
    try {
      const parsed: EnrichedGroup[] = JSON.parse(stored);
      for (const g of parsed) {
        for (const l of g.leads) {
          l.kanbanStatus = l.kanbanStatus || 'new';
          l.listName = g.listName;
        }
      }
      setGroups(parsed);
    } catch {}
  }, []);

  const allLeads = useMemo(() => groups.flatMap((g) => g.leads), [groups]);

  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s.id] = 0;
    for (const l of allLeads) {
      const k = l.kanbanStatus || 'new';
      if (counts[k] !== undefined) counts[k]++;
      else counts['new']++;
    }
    return counts;
  }, [allLeads]);

  const dataCompleteness = useMemo(() => {
    const total = allLeads.length || 1;
    return {
      withPhone: allLeads.filter((l) => l.phone).length,
      withEmail: allLeads.filter((l) => l.email).length,
      withWebsite: allLeads.filter((l) => l.website).length,
      withAll: allLeads.filter((l) => l.phone && l.email && l.website).length,
      phonePct: Math.round((allLeads.filter((l) => l.phone).length / total) * 100),
      emailPct: Math.round((allLeads.filter((l) => l.email).length / total) * 100),
      websitePct: Math.round((allLeads.filter((l) => l.website).length / total) * 100),
      completePct: Math.round((allLeads.filter((l) => l.phone && l.email && l.website).length / total) * 100),
    };
  }, [allLeads]);

  const listStats = useMemo(() => {
    return groups.map((g) => ({
      name: g.listName,
      total: g.leads.length,
      withEmail: g.leads.filter((l) => l.email).length,
      enrichedAt: g.enrichedAt,
    }));
  }, [groups]);

  const completionRate = useMemo(() => {
    if (allLeads.length === 0) return 0;
    const completed = pipelineCounts['closed'] || 0;
    return Math.round((completed / allLeads.length) * 100);
  }, [allLeads, pipelineCounts]);

  if (groups.length === 0) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No data yet. Save leads from the Enrich page first.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-accent-500" />
            <h1 className="text-lg font-bold text-gray-900">Analytics</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Overview of {allLeads.length} leads across {groups.length} lists</p>
        </header>

        <div className="p-6 space-y-6">
          {/* Top stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total Leads" value={allLeads.length} sub={`${groups.length} lists`} color="bg-accent-500" />
            <StatCard icon={Phone} label="With Phone" value={dataCompleteness.withPhone} sub={`${dataCompleteness.phonePct}%`} color="bg-blue-500" />
            <StatCard icon={Mail} label="With Email" value={dataCompleteness.withEmail} sub={`${dataCompleteness.emailPct}%`} color="bg-purple-500" />
            <StatCard icon={Globe} label="With Website" value={dataCompleteness.withWebsite} sub={`${dataCompleteness.websitePct}%`} color="bg-green-500" />
          </div>

          {/* Pipeline breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent-500" />
              <h2 className="text-sm font-bold text-gray-800">Pipeline Distribution</h2>
            </div>
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage) => {
                const count = pipelineCounts[stage.id] || 0;
                const pct = allLeads.length > 0 ? Math.round((count / allLeads.length) * 100) : 0;
                return (
                  <div key={stage.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                        <span className="font-medium text-gray-700">{stage.label}</span>
                      </div>
                      <span className="text-gray-500">{count} ({pct}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${stage.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Data completeness */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-accent-500" />
              <h2 className="text-sm font-bold text-gray-800">Data Completeness</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Phone', pct: dataCompleteness.phonePct, color: 'bg-blue-500' },
                { label: 'Email', pct: dataCompleteness.emailPct, color: 'bg-purple-500' },
                { label: 'Website', pct: dataCompleteness.websitePct, color: 'bg-green-500' },
                { label: 'All Three', pct: dataCompleteness.completePct, color: 'bg-emerald-500' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{item.pct}%</p>
                  <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* List breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-accent-500" />
              <h2 className="text-sm font-bold text-gray-800">Leads by List</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">List</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Emails</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Coverage</th>
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Enriched</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listStats.map((ls) => (
                    <tr key={ls.name} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{ls.name}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{ls.total}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{ls.withEmail}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                          {ls.total > 0 ? Math.round((ls.withEmail / ls.total) * 100) : 0}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {ls.enrichedAt ? new Date(ls.enrichedAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard icon={CheckCircle} label="Closed Won" value={pipelineCounts['closed'] || 0} sub={`${completionRate}% close rate`} color="bg-emerald-500" />
            <StatCard icon={XCircle} label="Lost" value={pipelineCounts['lost'] || 0} color="bg-red-500" />
            <StatCard icon={AlertCircle} label="Incomplete Data" value={pipelineCounts['incomplete'] || 0} sub="Missing email" color="bg-orange-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
