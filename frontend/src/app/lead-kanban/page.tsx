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
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'new', label: 'New Leads', color: 'bg-blue-500' },
  { id: 'contacted', label: 'Contacted', color: 'bg-yellow-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-green-500' },
  { id: 'closed', label: 'Closed Won', color: 'bg-emerald-600' },
  { id: 'lost', label: 'Lost', color: 'bg-red-500' },
];

interface Lead {
  id: string;
  businessName: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  kanbanStatus: string;
}

export default function LeadKanbanPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load leads from enriched-businesses on mount
  useEffect(() => {
    const stored = localStorage.getItem('enriched-businesses');
    if (!stored) return;
    try {
      const groups = JSON.parse(stored);
      const all: Lead[] = [];
      for (const g of groups) {
        for (const l of (g.leads || [])) {
          if (!all.find((x) => x.id === l.id)) {
            all.push({ ...l, kanbanStatus: l.kanbanStatus || 'new' });
          }
        }
      }
      setLeads(all);
    } catch {}
  }, []);

  // Persist kanbanStatus to localStorage on change
  useEffect(() => {
    if (leads.length === 0) return;
    try {
      const stored = localStorage.getItem('enriched-businesses');
      if (!stored) return;
      const groups = JSON.parse(stored);
      for (const g of groups) {
        for (const l of (g.leads || [])) {
          const update = leads.find((x) => x.id === l.id);
          if (update) l.kanbanStatus = update.kanbanStatus;
        }
      }
      localStorage.setItem('enriched-businesses', JSON.stringify(groups));
    } catch {}
  }, [leads]);

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const s of PIPELINE_STAGES) map[s.id] = [];
    for (const l of leads) {
      const s = l.kanbanStatus || 'new';
      if (map[s]) map[s].push(l);
      else map['new'].push(l);
    }
    return map;
  }, [leads]);

  const moveLead = (leadId: string, toStage: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, kanbanStatus: toStage } : l)),
    );
  };

  const handleDragStart = (id: string) => setDragId(id);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (stageId: string) => {
    if (dragId) moveLead(dragId, stageId);
    setDragId(null);
  };

  const copyText = (t: string) => {
    if (navigator.clipboard) navigator.clipboard.writeText(t);
  };

  const totalLeads = leads.length;

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Lead Pipeline</h1>
            <p className="text-xs text-gray-500 mt-0.5">{totalLeads} leads across {PIPELINE_STAGES.length} stages</p>
          </div>
        </header>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full min-w-[1000px]">
            {PIPELINE_STAGES.map((stage) => {
              const stageLeads = grouped[stage.id] || [];
              return (
                <div
                  key={stage.id}
                  className="flex-1 min-w-[200px] max-w-[320px] flex flex-col bg-gray-100/70 rounded-xl border border-gray-200"
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(stage.id)}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                      <h3 className="text-sm font-semibold text-gray-800">{stage.label}</h3>
                      <span className="text-xs text-gray-400 font-medium ml-1">{stageLeads.length}</span>
                    </div>
                    <button
                      onClick={() =>
                        setCollapsed((p) => ({ ...p, [stage.id]: !p[stage.id] }))
                      }
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {collapsed[stage.id] ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {!collapsed[stage.id] &&
                      stageLeads.map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={() => handleDragStart(lead.id)}
                          className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${dragId === lead.id ? 'opacity-50 ring-2 ring-purple-400' : ''}`}
                        >
                          {/* Business name */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <p className="text-sm font-medium text-gray-900 truncate">{lead.businessName}</p>
                            </div>
                          </div>

                          {/* Contact info */}
                          <div className="space-y-1">
                            {lead.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Phone className="w-3 h-3 shrink-0 text-gray-400" />
                                <span className="truncate">{lead.phone}</span>
                                <button onClick={() => copyText(lead.phone!)} className="ml-auto text-gray-300 hover:text-gray-500 shrink-0">
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            {lead.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Mail className="w-3 h-3 shrink-0 text-gray-400" />
                                <span className="truncate">{lead.email}</span>
                                <button onClick={() => copyText(lead.email!)} className="ml-auto text-gray-300 hover:text-gray-500 shrink-0">
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            {lead.website && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                                <Globe className="w-3 h-3 shrink-0 text-gray-400" />
                                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="truncate text-blue-600 hover:underline">
                                  {lead.website.replace(/^https?:\/\//, '')}
                                </a>
                                <ExternalLink className="w-3 h-3 shrink-0 text-gray-300" />
                              </div>
                            )}
                            {lead.address && (
                              <p className="text-[11px] text-gray-400 truncate mt-1">{lead.address}</p>
                            )}
                          </div>

                          {/* Stage selector */}
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <select
                              value={lead.kanbanStatus}
                              onChange={(e) => moveLead(lead.id, e.target.value)}
                              className="w-full text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400"
                            >
                              {PIPELINE_STAGES.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}

                    {!collapsed[stage.id] && stageLeads.length === 0 && (
                      <div className="flex items-center justify-center py-8 text-xs text-gray-400">
                        Drop leads here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
