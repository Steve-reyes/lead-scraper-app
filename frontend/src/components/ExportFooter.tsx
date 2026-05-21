'use client';

import { Download, Save, FileSpreadsheet, ListPlus } from 'lucide-react';

interface ExportFooterProps {
  selectedCount: number;
  totalCount: number;
  onExportCSV: () => void;
  onSaveList: () => void;
}

export default function ExportFooter({
  selectedCount,
  totalCount,
  onExportCSV,
  onSaveList,
}: ExportFooterProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-panel-border shadow-lg shadow-black/5 animate-in slide-in-from-bottom-2">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center">
            <FileSpreadsheet className="w-4 h-4 text-accent-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <p className="text-[11px] text-gray-500">
              {totalCount} total in results
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSaveList}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-panel-border hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            <ListPlus className="w-4 h-4" />
            Save to List
          </button>
          <button
            onClick={onExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Export to CSV
          </button>
        </div>
      </div>
    </div>
  );
}
