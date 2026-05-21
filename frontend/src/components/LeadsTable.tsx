'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  CheckSquare,
  Square,
  Copy,
  ExternalLink,
  Star,
  Globe,
  Building2,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  Linkedin,
  Facebook,
  Instagram,
  Loader2,
  Table2,
  LayoutList,
} from 'lucide-react';
import type { Lead, EnrichmentStatus, LeadSource } from '@/lib/types';

interface LeadsTableProps {
  leads: Lead[];
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (id: string, checked: boolean) => void;
}

function SourceBadge({ source }: { source: LeadSource }) {
  const config: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    google_maps: { label: 'Google', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Building2 },
    yelp: { label: 'Yelp', color: 'bg-red-50 text-red-700 border-red-200', icon: Search },
    yellowpages: { label: 'YellowPages', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Search },
    yell: { label: 'Yell', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Search },
    website_scrape: { label: 'Web', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Globe },
    directory: { label: 'Directory', color: 'bg-gray-50 text-gray-700 border-gray-200', icon: Building2 },
  };

  const cfg = config[source.type] || config.directory;

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.color}`}>
      <cfg.icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function EnrichmentBadge({ status }: { status: EnrichmentStatus }) {
  const config: Record<EnrichmentStatus, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pending', color: 'text-gray-400', icon: Clock },
    scanning_website: { label: 'Scraping', color: 'text-accent-500', icon: Loader2 },
    scanning_directories: { label: 'Directories', color: 'text-amber-500', icon: Loader2 },
    complete: { label: 'Done', color: 'text-emerald-600', icon: CheckCircle2 },
    failed: { label: 'Failed', color: 'text-red-500', icon: AlertCircle },
  };

  const cfg = config[status];
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cfg.color}`}>
      {status === 'scanning_website' || status === 'scanning_directories' ? (
        <Icon className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      {cfg.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
      title="Copy to clipboard"
    >
      <Copy className="w-3 h-3" />
    </button>
  );
}

function LeadCard({ lead, selected, onToggle }: { lead: Lead; selected: boolean; onToggle: () => void }) {
  return (
    <div
      className={`bg-white border rounded-lg p-3 space-y-2 transition-colors ${
        selected ? 'border-accent-300 bg-accent-50/30' : 'border-panel-border'
      }`}
    >
      {/* Top row: checkbox + sources */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-md bg-gray-100 border border-panel-border flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">{lead.businessName}</p>
            {lead.address && (
              <p className="text-[11px] text-gray-400 truncate">{lead.address}</p>
            )}
          </div>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-accent-500" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Fields */}
      <div className="space-y-1.5 text-xs">
        {/* Industry */}
        {lead.industry && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-12 shrink-0">Industry</span>
            <span className="text-gray-700 truncate">{lead.industry}</span>
          </div>
        )}

        {/* Phone */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-12 shrink-0">Phone</span>
          {lead.phone ? (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-gray-700 font-mono truncate">{lead.phone}</span>
              <CopyButton text={lead.phone} />
            </div>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </div>

        {/* Email */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-12 shrink-0">Email</span>
          {lead.email ? (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-accent-600 font-medium truncate">{lead.email}</span>
              <CopyButton text={lead.email} />
            </div>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </div>

        {/* Website */}
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-12 shrink-0">Site</span>
          {lead.website ? (
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-700 font-medium truncate"
            >
              <span className="truncate">{(() => { try { return new URL(lead.website).hostname; } catch { return lead.website; } })()}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="text-gray-300">-</span>
          )}
        </div>

        {/* Rating + Sources row */}
        <div className="flex items-center justify-between pt-1 border-t border-panel-border/50">
          {/* Sources */}
          <div className="flex items-center gap-1 flex-wrap">
            {lead.sources.map((source, idx) => (
              <SourceBadge key={idx} source={source} />
            ))}
          </div>

          {/* Rating + Enrichment Status */}
          <div className="flex items-center gap-2 shrink-0">
            {lead.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span className="text-xs font-medium text-gray-700">{lead.rating}</span>
                {lead.reviewCount && (
                  <span className="text-[10px] text-gray-400">({lead.reviewCount})</span>
                )}
              </div>
            )}
            <EnrichmentBadge status={lead.enrichmentStatus} />
          </div>
        </div>

        {/* Enrichment error */}
        {lead.enrichmentError && (
          <p className="text-[10px] text-red-400 truncate" title={lead.enrichmentError}>
            {lead.enrichmentError}
          </p>
        )}
      </div>
    </div>
  );
}

export default function LeadsTable({ leads, selectedIds, onSelectAll, onSelectOne }: LeadsTableProps) {
  const allSelected = leads.length > 0 && selectedIds.size === leads.length;
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // Auto-detect mobile on mount
  useEffect(() => {
    const checkWidth = () => {
      if (window.innerWidth < 640) {
        setViewMode('card');
      }
    };
    checkWidth();
    const handler = () => {
      // Only auto-switch on resize if crossing the threshold
      if (window.innerWidth < 640 && viewMode !== 'card') {
        setViewMode('card');
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (leads.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border border-panel-border rounded-xl shadow-table overflow-hidden">
      {/* Table Header with View Toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border bg-gray-50/80">
        <p className="text-xs text-gray-500">
          Showing {leads.length} lead{leads.length !== 1 ? 's' : ''}
          {selectedIds.size > 0 && (
            <span className="text-accent-600 font-medium"> · {selectedIds.size} selected</span>
          )}
        </p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm border border-panel-border'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Table view"
          >
            <Table2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              viewMode === 'card'
                ? 'bg-white text-gray-900 shadow-sm border border-panel-border'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            title="Card view"
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>

      {/* ======== TABLE VIEW ======== */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-panel-border">
                <th className="w-10 px-3 py-3 text-left">
                  <button
                    onClick={() => onSelectAll(!allSelected)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-accent-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Business Name
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Industry
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Website
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Sources
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Rating
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-border">
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`lead-row-enter hover:bg-gray-50/60 transition-colors ${
                    selectedIds.has(lead.id) ? 'bg-accent-50/40' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-3">
                    <button
                      onClick={() => onSelectOne(lead.id, !selectedIds.has(lead.id))}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {selectedIds.has(lead.id) ? (
                        <CheckSquare className="w-4 h-4 text-accent-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* Business Name */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-gray-100 border border-panel-border flex items-center justify-center shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {lead.businessName}
                        </p>
                        {lead.address && (
                          <p className="text-[11px] text-gray-400 truncate max-w-[200px]">
                            {lead.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Industry */}
                  <td className="px-3 py-3">
                    <span className="text-sm text-gray-700">{lead.industry || '-'}</span>
                  </td>

                  {/* Phone */}
                  <td className="px-3 py-3">
                    {lead.phone ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-700 font-mono text-[13px]">{lead.phone}</span>
                        <CopyButton text={lead.phone} />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">-</span>
                    )}
                  </td>

                  {/* Email */}
                  <td className="px-3 py-3">
                    {lead.email ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-accent-600 font-medium truncate max-w-[180px]">
                          {lead.email}
                        </span>
                        <CopyButton text={lead.email} />
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">-</span>
                    )}
                  </td>

                  {/* Website */}
                  <td className="px-3 py-3">
                    {lead.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-accent-600 hover:text-accent-700 font-medium"
                      >
                        <span className="truncate max-w-[140px]">{new URL(lead.website).hostname}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-sm text-gray-300">-</span>
                    )}
                  </td>

                  {/* Sources */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {lead.sources.map((source, idx) => (
                        <SourceBadge key={idx} source={source} />
                      ))}
                    </div>
                  </td>

                  {/* Rating */}
                  <td className="px-3 py-3">
                    {lead.rating ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span className="text-sm font-medium text-gray-700">{lead.rating}</span>
                        {lead.reviewCount && (
                          <span className="text-[11px] text-gray-400">({lead.reviewCount})</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-300">-</span>
                    )}
                  </td>

                  {/* Enrichment Status */}
                  <td className="px-3 py-3">
                    <EnrichmentBadge status={lead.enrichmentStatus} />
                    {lead.enrichmentError && (
                      <p className="text-[10px] text-red-400 mt-0.5 truncate max-w-[120px]" title={lead.enrichmentError}>
                        {lead.enrichmentError}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ======== CARD VIEW ======== */}
      {viewMode === 'card' && (
        <div className="divide-y divide-panel-border">
          {/* Select all bar */}
          <div className="px-3 py-2 flex items-center justify-between bg-gray-50/40 border-b border-panel-border">
            <button
              onClick={() => onSelectAll(!allSelected)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              {allSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-accent-500" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div className="p-3 space-y-3">
            {leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                selected={selectedIds.has(lead.id)}
                onToggle={() => onSelectOne(lead.id, !selectedIds.has(lead.id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
