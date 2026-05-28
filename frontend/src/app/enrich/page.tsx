'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import {
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Loader2,
  Building2,
  ExternalLink,
  Copy,
  AlertCircle,
  CheckCircle2,
  Clock,
  Save,
  Globe,
  Filter,
  StopCircle,
  Trash2,
} from 'lucide-react';
import type { Lead, WSMessage } from '@/lib/types';
import { connectWebSocket, disconnectWS, triggerBatchEnrich, triggerDeepBatchEnrich } from '@/lib/api';

/** Enrichment status for the current page */
type EnrichPageStatus = 'idle' | 'enriching' | 'complete' | 'error';
type LeadEnrichState = 'pending' | 'scanning_website' | 'scanning_directories' | 'complete' | 'failed';

function StatusBadge({ status }: { status: LeadEnrichState }) {
  const config: Record<LeadEnrichState, { label: string; color: string; icon: React.ElementType }> = {
    pending: { label: 'Pending', color: 'text-gray-400', icon: Clock },
    scanning_website: { label: 'Website', color: 'text-accent-500', icon: Loader2 },
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

export default function EnrichPage() {
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrichStatus, setEnrichStatus] = useState<EnrichPageStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeListName, setActiveListName] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);

  // Keep a mutable leads map for WS updates
  const leadsMapRef = useRef<Map<string, Lead>>(new Map());

  // Load imported leads from Saved Lists
  useEffect(() => {
    try {
      const storedLeads = localStorage.getItem('enrich-import-leads');
      const listName = localStorage.getItem('enrich-list-name');
      if (storedLeads) {
        const parsed: Lead[] = JSON.parse(storedLeads);
        setAllLeads(parsed);
        const map = new Map<string, Lead>();
        for (const lead of parsed) {
          map.set(lead.id, lead);
        }
        leadsMapRef.current = map;
        if (listName) {
          setActiveListName(listName);
          setStatusMessage('Imported from saved list');
        }
          localStorage.removeItem('enrich-import-leads');
        localStorage.removeItem('enrich-list-name');
        // Persist to session storage so they survive page navigation
        localStorage.setItem('enrich-session-leads', JSON.stringify(parsed));
        localStorage.setItem('enrich-session-name', listName || 'Imported Leads');
      } else {
        // No fresh import — restore last session so nav away + back preserves data
        const sessionLeads = localStorage.getItem('enrich-session-leads');
        const sessionName = localStorage.getItem('enrich-session-name');
        if (sessionLeads) {
          try {
            const parsed: Lead[] = JSON.parse(sessionLeads);
            if (parsed.length > 0) {
              setAllLeads(parsed);
              const map = new Map<string, Lead>();
              for (const lead of parsed) map.set(lead.id, lead);
              leadsMapRef.current = map;
              if (sessionName) setActiveListName(sessionName);
            }
          } catch {}
        }
      }
    } catch {
      console.warn('[Enrich Page] Could not import leads from localStorage');
    }
  }, []);

  // Connect WebSocket for enrichment streaming
  useEffect(() => {
    const ws = connectWebSocket(
      (data: WSMessage) => {
        switch (data.type) {
          case 'lead_enriched': {
            const { lead } = data.payload;
            if (lead) {
              // Update in leads map
              leadsMapRef.current.set(lead.id, lead);
              // Force re-render
              setAllLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
              // Persist so data survives page navigation
              const all = Array.from(leadsMapRef.current.values());
              localStorage.setItem('enrich-session-leads', JSON.stringify(all));
            }
            break;
          }

          case 'enrich_complete': {
            setEnrichStatus('complete');
            setStatusMessage(data.payload.message || 'Enrichment complete!');
            // Final persist
            const all = Array.from(leadsMapRef.current.values());
            localStorage.setItem('enrich-session-leads', JSON.stringify(all));
            break;
          }

          case 'progress': {
            setStatusMessage(data.payload.message || 'Processing...');
            break;
          }

          case 'enrich_cancelled': {
            setEnrichStatus('idle');
            setStatusMessage(data.payload?.message || 'Stopped');
            // Reset all scanning leads to failed so spinners disappear
            setAllLeads((prev) =>
              prev.map((l) =>
                l.enrichmentStatus === 'scanning_website' || l.enrichmentStatus === 'scanning_directories'
                  ? { ...l, enrichmentStatus: 'failed' as const, enrichmentError: 'cancelled' }
                  : l
              )
            );
            break;
          }

          case 'error': {
            setEnrichStatus('error');
            setStatusMessage(`Error: ${data.payload.error}`);
            break;
          }

          case 'connected':
          case 'registered': {
            const cid = data.payload?.clientId;
            if (cid) clientIdRef.current = cid;
            console.log('[Enrich WS]', data.type, data.payload);
            break;
          }
        }
      },
      (clientId) => {
        clientIdRef.current = clientId;
      },
    );
    wsRef.current = ws;

    return () => {
      disconnectWS();
      wsRef.current = null;
    };
  }, []);

  const sortLeads = (leads: Lead[]) => {
    if (!sortField) return leads;
    return [...leads].sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortField === 'status') {
        aVal = a.enrichmentStatus || '';
        bVal = b.enrichmentStatus || '';
      } else if (sortField === 'name') {
        aVal = (a.businessName || '').toLowerCase();
        bVal = (b.businessName || '').toLowerCase();
      } else if (sortField === 'phone') {
        aVal = (a.phone || '').toLowerCase();
        bVal = (b.phone || '').toLowerCase();
      } else if (sortField === 'website') {
        aVal = (a.website || '').toLowerCase();
        bVal = (b.website || '').toLowerCase();
      } else if (sortField === 'email') {
        aVal = (a.email || '').toLowerCase();
        bVal = (b.email || '').toLowerCase();
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filtered leads based on search query
  const filteredLeads = useMemo(() => {
    let result = allLeads;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = allLeads.filter(
        (l) =>
          l.businessName.toLowerCase().includes(q) ||
          (l.phone || '').includes(q) ||
          (l.website || '').toLowerCase().includes(q) ||
          (l.email || '').toLowerCase().includes(q) ||
          (l.address || '').toLowerCase().includes(q),
      );
    }
    return sortLeads(result);
  }, [allLeads, searchQuery, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Count enrichment stats
  const stats = useMemo(() => {
    const total = allLeads.length;
    const withEmail = allLeads.filter((l) => l.email).length;
    const withPhone = allLeads.filter((l) => l.phone).length;
    const withWebsite = allLeads.filter((l) => l.website).length;
    const enriched = allLeads.filter((l) => l.enrichmentStatus === 'complete').length;
    return { total, withEmail, withPhone, withWebsite, enriched };
  }, [allLeads]);

  // Selection handlers
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [filteredLeads],
  );

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Manually save enriched leads from this list to enriched-businesses
  const saveToEnriched = useCallback(() => {
    const completed = allLeads.filter((l) => l.phone || l.email || l.website);
    if (completed.length === 0) {
      alert('No leads with data to save.');
      return;
    }
    const listName = activeListName || localStorage.getItem('enrich-session-name') || 'Unnamed List';
    const entry = {
      listName,
      leads: completed,
      enrichedAt: new Date().toISOString(),
    };
    try {
      const existing = JSON.parse(localStorage.getItem('enriched-businesses') || '[]');
      const idx = existing.findIndex((g: any) => g.listName === listName);
      if (idx >= 0) existing[idx] = entry;
      else existing.push(entry);
      localStorage.setItem('enriched-businesses', JSON.stringify(existing));
      alert(`Saved ${completed.length} leads to enriched businesses!`);
    } catch {}
  }, [allLeads, activeListName]);

  // Deep enrich selected leads (uses FlareSolverr for directory sites)
  const handleDeepEnrichSelected = useCallback(async () => {
    const selectedLeads = allLeads.filter((l) => selectedIds.has(l.id));
    if (selectedLeads.length === 0) return;

    setEnrichStatus('enriching');
    setStatusMessage(`Deep enriching ${selectedLeads.length} leads via directory sites...`);

    const waitForWs = () =>
      new Promise<void>((resolve) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) { resolve(); return; }
        const check = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) { clearInterval(check); resolve(); }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

    await waitForWs();

    try {
      await triggerDeepBatchEnrich(selectedLeads, clientIdRef.current || undefined);
    } catch (error: any) {
      setEnrichStatus('error');
      setStatusMessage(`Error: ${error.message}`);
    }
  }, [allLeads, selectedIds]);

  // Enrich selected leads
  // Stop enrichment — also resets stuck scanning leads so spinners disappear
  const handleStopEnrich = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel_enrich', payload: {} }));
    }
    setEnrichStatus('idle');
    setStatusMessage('');
    // Reset any leads stuck in scanning to failed so spinners don't persist
    setAllLeads((prev) =>
      prev.map((l) =>
        l.enrichmentStatus === 'scanning_website' || l.enrichmentStatus === 'scanning_directories'
          ? { ...l, enrichmentStatus: 'failed' as const, enrichmentError: 'stopped' }
          : l
      )
    );
  }, []);

  // Clear all leads from enrichment page
  const handleClearLeads = useCallback(() => {
    setAllLeads([]);
    setSelectedIds(new Set());
    setEnrichStatus('idle');
    setStatusMessage('');
    localStorage.removeItem('enrich-session-leads');
    localStorage.removeItem('enrich-session-name');
  }, []);

  const handleEnrichSelected = useCallback(async () => {
    const selectedLeads = allLeads.filter((l) => selectedIds.has(l.id));
    if (selectedLeads.length === 0) return;

    setEnrichStatus('enriching');
    setStatusMessage(`Enriching ${selectedLeads.length} leads...`);

    // Wait for WS connection
    const waitForWs = () =>
      new Promise<void>((resolve) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        const check = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 5000);
      });

    await waitForWs();

    try {
      await triggerBatchEnrich(selectedLeads, clientIdRef.current || undefined);
    } catch (error: any) {
      setEnrichStatus('error');
      setStatusMessage(`Error: ${error.message}`);
    }
  }, [allLeads, selectedIds]);

  // Derived state
  const allSelected = filteredLeads.length > 0 && selectedIds.size === filteredLeads.length;
  const isEnriching = enrichStatus === 'enriching';

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-panel-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-accent-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Enrich Leads</h2>
                <p className="text-xs text-gray-500">
                  {stats.total} leads loaded · {stats.enriched} enriched · {stats.withEmail} with email
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter leads..."
                  className="w-56 pl-9 pr-3 py-2 bg-gray-50 border border-panel-border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all"
                />
              </div>

              {/* STOP button — visible only during enrichment */}
              {isEnriching && (
                <button
                  onClick={handleStopEnrich}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <StopCircle className="w-4 h-4" /> Stop
                </button>
              )}

              {/* CLEAR button — visible only when idle and leads exist */}
              {!isEnriching && allLeads.length > 0 && (
                <button
                  onClick={handleClearLeads}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
              )}

              <button
                onClick={handleDeepEnrichSelected}
                disabled={selectedIds.size === 0 || isEnriching}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-300 text-white text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {isEnriching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deep Enriching...</>
                ) : (
                  <><Globe className="w-4 h-4" /> Deep Enrich ({selectedIds.size})</>
                )}
              </button>

              <button
                onClick={handleEnrichSelected}
                disabled={selectedIds.size === 0 || isEnriching}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-500 to-accent-500 hover:from-purple-600 hover:to-accent-600 disabled:from-gray-300 disabled:to-gray-300 text-white text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {isEnriching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enriching...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Enrich Selected ({selectedIds.size})</>
                )}
              </button>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className="px-6 py-2 text-xs border-b border-panel-border bg-white flex items-center gap-2">
            {isEnriching && <span className="inline-block w-2 h-2 rounded-full bg-accent-500 animate-pulse" />}
            {enrichStatus === 'complete' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
            {enrichStatus === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
            <span className={
              enrichStatus === 'error' ? 'text-red-500' :
              enrichStatus === 'complete' ? 'text-emerald-600' :
              'text-gray-500'
            }>{statusMessage}</span>
          </div>
        )}

        {activeListName && (
          <div className="px-6 py-3 bg-gradient-to-r from-purple-50/80 to-accent-50/80 border-b border-panel-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-accent-500 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-900">List: {activeListName}</span>
              <span className="text-xs text-gray-400">({allLeads.length} leads)</span>
              <button
                onClick={() => setListCollapsed(!listCollapsed)}
                className="ml-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >{listCollapsed ? 'Expand' : 'Collapse'}</button>
              {!isEnriching && (
                <>
                  <button
                    onClick={() => saveToEnriched()}
                    className="ml-auto text-xs text-purple-600 hover:text-purple-700 font-medium transition-colors flex items-center gap-1"
                  ><Save className="w-3 h-3" /> Save to Enriched</button>
                  <button
                    onClick={() => { setActiveListName(null); setListCollapsed(false); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >Dismiss</button>
                </>
              )}
            </div>
          </div>
        )}

        {allLeads.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div className="max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-purple-100 to-accent-100 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No leads to enrich</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                First, go to the <strong>Search &amp; Scrape</strong> page and find some leads on Google Maps. 
                Once the search completes, the leads will appear here ready for enrichment.
              </p>
            </div>
          </div>
        )}

        {allLeads.length > 0 && !listCollapsed && (
          <div className="flex-1 overflow-auto px-6 py-4">
            <div className="bg-white border border-panel-border rounded-xl shadow-table overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-panel-border">
                      <th className="w-10 px-3 py-3 text-left">
                        <button onClick={() => handleSelectAll(!allSelected)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          {allSelected ? <CheckSquare className="w-4 h-4 text-accent-500" /> : <Square className="w-4 h-4" />}
                        </button>
                      </th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('name')}>
                        Business Name {sortField === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('phone')}>
                        Phone {sortField === 'phone' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('website')}>
                        Website {sortField === 'website' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('email')}>
                        Email {sortField === 'email' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                      <th className="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none" onClick={() => handleSort('status')}>
                        Status {sortField === 'status' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-panel-border">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className={`hover:bg-gray-50/60 transition-colors ${selectedIds.has(lead.id) ? 'bg-purple-50/40' : ''}`}>
                        <td className="px-3 py-3">
                          <button onClick={() => handleSelectOne(lead.id, !selectedIds.has(lead.id))} className="text-gray-400 hover:text-gray-600 transition-colors">
                            {selectedIds.has(lead.id) ? <CheckSquare className="w-4 h-4 text-purple-500" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-gray-100 border border-panel-border flex items-center justify-center shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-gray-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{lead.businessName}</p>
                              {lead.address && <p className="text-[11px] text-gray-400 truncate max-w-[200px]">{lead.address}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {lead.phone ? (
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-gray-700 font-mono text-[13px]">{lead.phone}</span>
                              <CopyButton text={lead.phone} />
                            </div>
                          ) : <span className="text-sm text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3">
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent-600 hover:text-accent-700 font-medium">
                              <span className="truncate max-w-[130px]">{new URL(lead.website).hostname}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : <span className="text-sm text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3">
                          {lead.email ? (
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-purple-600 font-medium truncate max-w-[200px]">{lead.email}</span>
                              <CopyButton text={lead.email} />
                            </div>
                          ) : <span className="text-sm text-gray-300">-</span>}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={lead.enrichmentStatus as LeadEnrichState} />
                          {lead.enrichmentError && (
                            <p className="text-[10px] text-red-400 mt-0.5 truncate max-w-[120px]" title={lead.enrichmentError}>{lead.enrichmentError}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-3 py-2 border-t border-panel-border bg-gray-50/50 flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Showing {filteredLeads.length} of {allLeads.length} leads
                  {selectedIds.size > 0 && <span className="text-purple-600 font-medium"> · {selectedIds.size} selected</span>}
                </p>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{stats.withWebsite} websites</span>
                  <span>{stats.withPhone} phones</span>
                  <span>{stats.withEmail} emails</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
