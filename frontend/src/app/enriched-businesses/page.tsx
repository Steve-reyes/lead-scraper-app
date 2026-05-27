'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import {
  CheckCircle2,
  ExternalLink,
  Copy,
  Building2,
  Phone,
  Mail,
  Globe,
  ChevronDown,
  ChevronRight,
  Trash2,
  Download,
  Sparkles,
  Target,
} from 'lucide-react';
import type { Lead } from '@/lib/types';

interface EnrichedGroup {
  listName: string;
  leads: Lead[];
  enrichedAt: string;
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

function copyToClipboard(text: string) {
  if (navigator.clipboard) navigator.clipboard.writeText(text);
}

function exportCSV(leads: Lead[], filename: string) {
  const headers = ['Business Name', 'Address', 'Phone', 'Email', 'Website', 'LinkedIn', 'Sources'];
  const rows = leads.map((l) => [
    `"${(l.businessName || '').replace(/"/g, '""')}"`,
    `"${(l.address || '').replace(/"/g, '""')}"`,
    `"${(l.phone || '').replace(/"/g, '""')}"`,
    `"${(l.email || '').replace(/"/g, '""')}"`,
    `"${(l.website || '').replace(/"/g, '""')}"`,
    `"${(l.socialLinks?.linkedin || '').replace(/"/g, '""')}"`,
    `"${(l.sources || []).map((s) => s.name).join('; ').replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EnrichedBusinessesPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [groups, setGroups] = useState<EnrichedGroup[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  // Load enriched businesses from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('enriched-businesses');
      if (stored) {
        const parsed: EnrichedGroup[] = JSON.parse(stored);
        if (parsed.length > 0) {
          setGroups(parsed);
          return;
        }
      }

      // Fallback: backfill from enrich session (for previously enriched data)
      const sessionLeads = localStorage.getItem('enrich-session-leads');
      const sessionName = localStorage.getItem('enrich-session-name');
      if (sessionLeads) {
        const leads: Lead[] = JSON.parse(sessionLeads);
        const completed = leads.filter((l) => l.phone || l.email || l.website);
        if (completed.length > 0) {
          const entry: EnrichedGroup = {
            listName: sessionName || 'Imported Leads',
            leads: completed,
            enrichedAt: new Date().toISOString(),
          };
          setGroups([entry]);
          localStorage.setItem('enriched-businesses', JSON.stringify([entry]));
        }
      }
    } catch {
      console.warn('[EnrichedBusinesses] Could not load enriched businesses');
    }
  }, []);

  const totalEnriched = useMemo(
    () => groups.reduce((sum, g) => sum + g.leads.length, 0),
    [groups]
  );

  const toggleGroup = (name: string) => {
    setExpandedGroup(expandedGroup === name ? null : name);
  };

  const forwardToScore = (lead: Lead) => {
    try {
      const existing = JSON.parse(localStorage.getItem('lead-score-queue') || '[]');
      existing.push(lead);
      localStorage.setItem('lead-score-queue', JSON.stringify(existing));
      router.push('/lead-score');
    } catch {}
  };

  const clearAll = () => {
    localStorage.removeItem('enriched-businesses');
    setGroups([]);
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
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enriched Businesses</h2>
                <p className="text-xs text-gray-500">
                  {totalEnriched} businesses enriched · {groups.length} lists
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {groups.length > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No enriched businesses yet</h3>
                <p className="text-sm text-gray-500">
                  Go to <strong>Enrich Leads</strong>, select businesses, and run enrichment. 
                  Completed ones with phone, email, or website will appear here.
                </p>
                <button
                  onClick={() => router.push('/enrich')}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4" /> Go to Enrich
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-3 max-w-5xl mx-auto">
              {groups.map((group) => (
                <div key={group.listName} className="bg-white rounded-xl border border-panel-border overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.listName)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedGroup === group.listName ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <Building2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-semibold text-gray-900">{group.listName}</span>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                        {group.leads.length}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(group.enrichedAt)}</span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push('/lead-score'); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
                        title="Lead Score"
                      >
                        <Target className="w-3.5 h-3.5" /> Score
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); exportCSV(group.leads, group.listName); }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Export CSV"
                      >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                      </button>
                    </div>
                  </button>

                  {/* Leads */}
                  {expandedGroup === group.listName && (
                    <div className="border-t border-panel-border divide-y divide-panel-border">
                      {group.leads.map((lead) => (
                        <div key={lead.id} className="px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-semibold text-gray-900 truncate">
                                {lead.businessName}
                              </h4>
                              <p className="text-xs text-gray-400 truncate mt-0.5">
                                {lead.address || lead.city || ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
                            {lead.phone && (
                              <div className="group flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span className="text-xs text-gray-600 font-medium">{lead.phone}</span>
                                <button
                                  onClick={() => copyToClipboard(lead.phone!)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                </button>
                              </div>
                            )}
                            {lead.email && (
                              <div className="group flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="text-xs text-gray-600">{lead.email}</span>
                                <button
                                  onClick={() => copyToClipboard(lead.email!)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
                                </button>
                              </div>
                            )}
                            {lead.website && (
                              <div className="group flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                <a
                                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-purple-600 hover:text-purple-700 hover:underline truncate max-w-[200px]"
                                >
                                  {lead.website.replace(/^https?:\/\//, '')}
                                </a>
                                <ExternalLink className="w-3 h-3 text-purple-400 shrink-0" />
                              </div>
                            )}
                            {lead.socialLinks?.linkedin && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-blue-400 font-medium">in</span>
                                <a
                                  href={lead.socialLinks.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline truncate max-w-[150px]"
                                >
                                  LinkedIn
                                </a>
                                <ExternalLink className="w-3 h-3 text-blue-400 shrink-0" />
                              </div>
                            )}
                          </div>

                          {/* Sources badges */}
                          {lead.sources && lead.sources.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {lead.sources.map((s, i) => (
                                <span
                                  key={i}
                                  className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium"
                                >
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
