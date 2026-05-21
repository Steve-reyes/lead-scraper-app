'use client';

import { Users, Loader2 } from 'lucide-react';
import type { Metrics } from '@/lib/types';

interface MetricsRibbonProps {
  metrics: Metrics;
  isSearching: boolean;
  status?: string;
}

export default function MetricsRibbon({ metrics, isSearching, status }: MetricsRibbonProps) {
  return (
    <div className="bg-white border-b border-panel-border px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Total Found */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-lg border border-panel-border shadow-card">
          <div className={`w-9 h-9 rounded-lg bg-accent-500/10 flex items-center justify-center`}>
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-accent-500 animate-spin" />
            ) : (
              <Users className="w-4 h-4 text-accent-500" />
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Total Found</p>
            <p className="text-lg font-bold text-gray-900">{metrics.totalFound}</p>
          </div>
        </div>

        {/* Status text */}
        {status && (
          <div className="flex items-center gap-2 px-3 py-1">
            {isSearching && (
              <span className="inline-block w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
            )}
            <span className="text-sm text-gray-500">{status}</span>
          </div>
        )}
      </div>
    </div>
  );
}
