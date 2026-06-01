'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import MetricsRibbon from '@/components/MetricsRibbon';
import LeadsTable from '@/components/LeadsTable';
import ExportFooter from '@/components/ExportFooter';
import type { Lead, Metrics, WSMessage } from '@/lib/types';
import { connectWebSocket, triggerSearch } from '@/lib/api';

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [metrics, setMetrics] = useState<Metrics>({
    totalFound: 0,
    enrichedWithEmail: 0,
    phonesFound: 0,
    fallbackSitesScraped: 0,
  });
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const leadsMapRef = useRef<Map<string, Lead>>(new Map());
  const onMessageRef = useRef<((data: WSMessage) => void) | null>(null);

  // Handle incoming WebSocket messages — Google Maps only, no enrichment
  const handleWSMessage = useCallback((data: WSMessage) => {
    switch (data.type) {
      case 'lead_found': {
        const { lead, totalFound } = data.payload;
        leadsMapRef.current.set(lead.id, lead);
        setLeads((prev) => [...prev, lead]);
        setMetrics((prev) => ({ ...prev, totalFound }));
        break;
      }

      case 'progress': {
        setSearchStatus(data.payload.message);
        if (data.payload.totalFound) {
          setMetrics((prev) => ({ ...prev, totalFound: data.payload.totalFound! }));
        }
        break;
      }

      case 'complete': {
        setIsSearching(false);
        setSearchStatus(data.payload.message || 'Complete');
        setMetrics({
          totalFound: data.payload.totalFound,
          enrichedWithEmail: 0,
          phonesFound: 0,
          fallbackSitesScraped: 0,
        });
        break;
      }

      case 'error': {
        setIsSearching(false);
        setSearchStatus(`Error: ${data.payload.error}`);
        break;
      }

      case 'connected':
      case 'registered': {
        console.log('[WS] Registered:', data.payload);
        break;
      }
    }
  }, []);

  // Store latest handler in ref so WS callback always uses latest
  onMessageRef.current = handleWSMessage;

  // Auto-connect WebSocket on mount
  useEffect(() => {
    const ws = connectWebSocket(
      (data) => {
        if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      },
      (clientId) => {
        clientIdRef.current = clientId;
        console.log('[WS] Assigned clientId:', clientId);
      },
    );
    wsRef.current = ws;

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  // Send search via POST /api/search → WebSocket streaming
  const handleSearch = useCallback(
    async (keyword: string, location: string, country: string, radiusKm: number = 0) => {
      // Reset state for new search
      setLeads([]);
      setSelectedIds(new Set());
      setMetrics({ totalFound: 0, enrichedWithEmail: 0, phonesFound: 0, fallbackSitesScraped: 0 });
      setIsSearching(true);
      setSearchStatus('Starting search...');
      leadsMapRef.current.clear();
      setDisplayLimit(50);

      // Wait briefly for WebSocket to be connected
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
        const result = await triggerSearch(
          { keyword, location, country, radius: radiusKm, maxResults: 200 },
          clientIdRef.current || undefined,
        );
        setSearchStatus(result.message || `Searching Google Maps for "${keyword}" in "${location}"...`);
      } catch (error: any) {
        setIsSearching(false);
        setSearchStatus(`Error: ${error.message}`);
      }
    },
    [],
  );

  // Selection handlers
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(leads.map((l) => l.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [leads],
  );

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Export
  const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

  const handleExportCSV = useCallback(() => {
    const headers = ['Business Name', 'Industry', 'Phone', 'Email', 'Website', 'Address', 'Rating'];
    const rows = selectedLeads.map((l) => [
      `"${l.businessName.replace(/"/g, '""')}"`,
      `"${l.industry || ''}"`,
      `"${l.phone || ''}"`,
      `"${l.email || ''}"`,
      `"${l.website || ''}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      l.rating || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedLeads]);

  const handleSaveList = useCallback(() => {
    const listName = prompt('Enter a name for this list:');
    if (!listName) return;

    const existing = JSON.parse(localStorage.getItem('saved-lists') || '{}');
    existing[listName] = {
      name: listName,
      leads: selectedLeads,
      createdAt: new Date().toISOString(),
      leadCount: selectedLeads.length,
    };
    localStorage.setItem('saved-lists', JSON.stringify(existing));
    alert(`Saved ${selectedLeads.length} leads to "${listName}"`);
  }, [selectedLeads]);

  // Check WebSocket connection status
  const isConnected = wsRef.current?.readyState === WebSocket.OPEN;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <TopBar onSearch={handleSearch} onClear={() => { setLeads([]); setSelectedIds(new Set()); setMetrics({ totalFound: 0, enrichedWithEmail: 0, phonesFound: 0, fallbackSitesScraped: 0 }); setSearchStatus(''); leadsMapRef.current.clear(); }} leadCount={leads.length} isSearching={isSearching} />

        {/* Metrics Ribbon */}
        <MetricsRibbon metrics={metrics} isSearching={isSearching} status={searchStatus} />

        {/* Status bar when searching */}
        {searchStatus && (
          <div className="px-4 md:px-6 py-2 text-xs text-gray-500 border-b border-panel-border bg-white flex items-center gap-2 whitespace-normal">
            {isSearching && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent-500 animate-pulse shrink-0" />
            )}
            {!isConnected && isSearching && (
              <span className="text-amber-500 font-medium shrink-0">[WS reconnecting] </span>
            )}
            <span className="break-words">{searchStatus}</span>
          </div>
        )}

        {/* Data Table */}
        <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
          <LeadsTable
            leads={leads.slice(0, displayLimit)}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
          />

          {/* Load More */}
          {displayLimit < leads.length && (
            <div className="flex justify-center">
              <button
                onClick={() => setDisplayLimit((prev) => prev + 50)}
                className="mx-auto mt-4 mb-6 px-6 py-2.5 bg-white border border-panel-border rounded-full text-sm text-accent-600 hover:bg-gray-50 transition-colors"
              >
                Load More ({leads.length - displayLimit} more)
              </button>
            </div>
          )}
        </div>

        {/* Empty State */}
        {leads.length === 0 && !isSearching && (
          <div className="flex-1 flex items-center justify-center text-center px-4 md:px-6">
            <div className="max-w-md">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Search for leads</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Enter a keyword and location above to find local businesses on Google Maps. No automatic enrichment — use the <strong>Enrich Leads</strong> page when you&apos;re ready to find emails and more.
              </p>
            </div>
          </div>
        )}

        {/* Progress indicator for streaming */}
        {isSearching && leads.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
              <p className="text-sm text-gray-500">Searching Google Maps...</p>
            </div>
          </div>
        )}

        {/* Export Footer */}
        <ExportFooter
          selectedCount={selectedIds.size}
          totalCount={leads.length}
          onExportCSV={handleExportCSV}
          onSaveList={handleSaveList}
        />
      </div>
    </div>
  );
}
