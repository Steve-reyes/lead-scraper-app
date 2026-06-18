'use client';

import { useState, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  Phone,
  Mail,
  Globe,
  Building2,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  AlertCircle,
  Trash2,
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'new', label: 'New Leads', color: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-green-500' },
  { id: 'closed', label: 'Closed Won', color: 'bg-emerald-600' },
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
}

interface EnrichedGroup {
  listName: string;
  leads: Lead[];
  enrichedAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || '';

export default function LeadKanbanPage() {
  const [groups, setGroups] = useState<EnrichedGroup[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({});
  const [expandedLists, setExpandedLists] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Load enriched groups from API (shared across browsers)
  useEffect(() => {
    const load = async () => {
      try {
        // Determine user role
        let role = '';
        try {
          const u = JSON.parse(localStorage.getItem('leadscraper-user') || '{}');
          role = u.role || '';
        } catch {}

        const res = await fetch(`${API}/api/enriched-groups`);
        if (!res.ok) return;
        const data = await res.json();
        if (!Array.isArray(data.groups) || data.groups.length === 0) return;

        // Filter: admins don't see items sent to users, regular users see only items sent to them
        const filtered = data.groups.filter((g: any) => {
          if (role === 'admin') return !g.sentTo || g.sentTo !== 'users';
          if (role) return g.sentTo === 'users';
          return true;
        });

        // Merge kanbanStatus from localStorage (per-browser positions)
        let localStatus: Record<string, Record<string, string>> = {};
        try {
          const stored = localStorage.getItem('kanban-statuses');
          if (stored) localStatus = JSON.parse(stored);
        } catch {}

        for (const g of filtered) {
          const saved = localStatus[g.listName] || {};
          for (const l of g.leads) {
            // Apply saved kanban status or auto-sort
            if (saved[l.businessName]) {
              l.kanbanStatus = saved[l.businessName];
            } else {
              l.kanbanStatus = (!l.email) ? 'incomplete' : 'new';
            }
            l.listName = g.listName;
          }
        }
        setGroups(filtered);
        // Expand all by default
        const expanded: Record<string, boolean> = {};
        for (const g of filtered) expanded[g.listName] = true;
        setExpandedLists(expanded);
      } catch (e) {
        console.error('[LeadKanban] Failed to load from API', e);
      }
    };
    load();
  }, []);

  // Persist kanbanStatus changes to localStorage (per-browser positions)
  useEffect(() => {
    if (groups.length === 0) return;
    try {
      const statuses: Record<string, Record<string, string>> = {};
      for (const g of groups) {
        statuses[g.listName] = {};
        for (const l of g.leads) {
          statuses[g.listName][l.businessName] = l.kanbanStatus || 'new';
        }
      }
      localStorage.setItem('kanban-statuses', JSON.stringify(statuses));
    } catch {}
  }, [groups]);

  const moveLead = (listName: string, leadId: string, toStage: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.listName !== listName) return g;
        return {
          ...g,
          leads: g.leads.map((l) =>
            l.id === leadId ? { ...l, kanbanStatus: toStage } : l,
          ),
        };
      }),
    );
  };

  const handleDragStart = (id: string) => setDragId(id);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (listName: string, stageId: string) => {
    if (dragId) moveLead(listName, dragId, stageId);
    setDragId(null);
  };

  const copyText = (t: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(t);
  };

  const doDelete = async (listName: string) => {
    const updated = groups.filter((g) => g.listName !== listName);
    setGroups(updated);
    // Delete from API (shared across browsers)
    await fetch(`/api/enriched-groups/${encodeURIComponent(listName)}`, {
      method: 'DELETE',
    }).catch(() => {});
    setConfirmDelete(null);
  };

  const totalLeads = groups.reduce((sum, g) => sum + g.leads.length, 0);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of PIPELINE_STAGES) counts[s.id] = 0;
    for (const g of groups) {
      for (const l of g.leads) {
        const k = l.kanbanStatus || 'new';
        if (counts[k] !== undefined) counts[k]++;
        else counts['new']++;
      }
    }
    return counts;
  }, [groups]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lead Pipeline</h1>
            <p className="text-xs text-gray-500 mt-0.5">
  {totalLeads} leads · New: {stageCounts['new'] || 0} · Contacted: {stageCounts['contacted'] || 0} · Qualified: {stageCounts['qualified'] || 0} · Won: {stageCounts['closed'] || 0} · Lost: {stageCounts['lost'] || 0} · Incomplete: {stageCounts['incomplete'] || 0}
</p>
          </div>
        </header>

        {/* Kanban Board — grouped by list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {groups.length === 0 && (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">
              No enriched leads yet. Save leads from the Enrich page first.
            </div>
          )}
          {groups.map((group) => {
            const perStage: Record<string, Lead[]> = {};
            for (const s of PIPELINE_STAGES) perStage[s.id] = [];
            for (const l of group.leads) {
              const s = l.kanbanStatus || 'new';
              if (perStage[s]) perStage[s].push(l);
              else perStage['new'].push(l);
            }
            const isExpanded = expandedLists[group.listName] !== false;

            return (
              <div key={group.listName} className="bg-white rounded-xl border border-gray-200 shadow-sm">
                {/* List header */}
                <button
                  onClick={() =>
                    setExpandedLists((p) => ({
                      ...p,
                      [group.listName]: !isExpanded,
                    }))
                  }
                  className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <h2 className="text-sm font-bold text-gray-800">{group.listName}</h2>
                    <span className="text-xs text-gray-400">{group.leads.length} leads</span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    New: {(perStage['new'] || []).length} · Contacted: {(perStage['contacted'] || []).length} · Lost: {(perStage['lost'] || []).length} · Incomplete: {(perStage['incomplete'] || []).length}
                  </span>
                  <div
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(group.listName); }}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Delete group"
                  >
                    <Trash2 className="w-4 h-4" />
                  </div>
                </button>

                {/* Kanban columns for this list */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <div className="flex gap-3 p-3 min-w-[900px]">
                      {PIPELINE_STAGES.map((stage) => {
                        const stageLeads = perStage[stage.id] || [];
                        return (
                          <div
                            key={stage.id}
                            className="flex-1 min-w-[170px] max-w-[260px] flex flex-col bg-gray-50 rounded-lg border border-gray-100"
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(group.listName, stage.id)}
                          >
                            {/* Column header */}
                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                                <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                                <span className="text-[11px] text-gray-400 ml-0.5">{stageLeads.length}</span>
                              </div>
                              <button
                                onClick={() =>
                                  setCollapsedCols((p) => ({ ...p, [stage.id]: !p[stage.id] }))
                                }
                                className="text-gray-300 hover:text-gray-500"
                              >
                                {collapsedCols[stage.id] ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 max-h-[400px]">
                              {!collapsedCols[stage.id] &&
                                stageLeads.map((lead) => (
                                  <div
                                    key={lead.id}
                                    draggable
                                    onDragStart={() => handleDragStart(lead.id)}
                                    className={`bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm hover:shadow transition-all cursor-grab active:cursor-grabbing ${dragId === lead.id ? 'opacity-50 ring-2 ring-purple-400' : ''}`}
                                  >
                                    {/* Business name */}
                                    <div className="flex items-start gap-1.5 mb-1.5">
                                      <Building2 className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                                      <p className="text-xs font-medium text-gray-900 truncate leading-tight">{lead.businessName}</p>
                                    </div>

                                    {/* Contact info */}
                                    <div className="space-y-1">
                                      {lead.phone && (
                                        <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                          <Phone className="w-3 h-3 shrink-0 text-gray-400" />
                                          <span className="truncate">{lead.phone}</span>
                                          <button onClick={() => copyText(lead.phone!)} className="ml-auto text-gray-300 hover:text-gray-500 shrink-0">
                                            <Copy className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      )}
                                      {lead.email && (
                                        <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                          <Mail className="w-3 h-3 shrink-0 text-gray-400" />
                                          <span className="truncate">{lead.email}</span>
                                          <button onClick={() => copyText(lead.email!)} className="ml-auto text-gray-300 hover:text-gray-500 shrink-0">
                                            <Copy className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      )}
                                      {lead.website && (
                                        <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                          <Globe className="w-3 h-3 shrink-0 text-gray-400" />
                                          <a href={lead.website} target="_blank" rel="noopener noreferrer" className="truncate text-blue-500 hover:underline max-w-[120px]">
                                            {lead.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}
                                          </a>
                                          <ExternalLink className="w-2.5 h-2.5 shrink-0 text-gray-300" />
                                        </div>
                                      )}
                                    </div>

                                    {/* Missing data badges — only for Incomplete stage */}
                                    {stage.id === 'incomplete' && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {!lead.phone && <span className="text-[10px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">No Phone</span>}
                                        {!lead.email && <span className="text-[10px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">No Email</span>}
                                        {!lead.website && <span className="text-[10px] font-medium bg-red-100 text-red-600 px-1.5 py-0.5 rounded">No Website</span>}
                                        {lead.phone && lead.email && lead.website && (
                                          <span className="text-[10px] font-medium bg-green-100 text-green-600 px-1.5 py-0.5 rounded">Complete</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Stage selector */}
                                    <div className="mt-1.5 pt-1.5 border-t border-gray-50">
                                      <select
                                        value={lead.kanbanStatus}
                                        onChange={(e) => moveLead(group.listName, lead.id, e.target.value)}
                                        className="w-full text-[10px] text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
                                      >
                                        {PIPELINE_STAGES.map((s) => (
                                          <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                ))}

                              {!collapsedCols[stage.id] && stageLeads.length === 0 && (
                                <div className="flex items-center justify-center py-6 text-[11px] text-gray-400">
                                  Drop leads here
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Confirmation modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm mx-4 p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Remove from Pipeline?</h3>
              <p className="text-xs text-gray-500 mb-2">
                This hides <strong>{confirmDelete}</strong> from the pipeline.<br />
                The original data stays on Enriched Businesses.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={() => doDelete(confirmDelete)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
