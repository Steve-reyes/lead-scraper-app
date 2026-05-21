'use client';

import { useState, FormEvent } from 'react';
import { Search, MapPin, Globe, Navigation, Loader2 } from 'lucide-react';

interface TopBarProps {
  onSearch: (keyword: string, location: string, country: string, radiusKm: number) => void;
  isSearching: boolean;
}

export default function TopBar({ onSearch, isSearching }: TopBarProps) {
  const [keyword, setKeyword] = useState('Dentist');
  const [location, setLocation] = useState('Austin, TX');
  const [country, setCountry] = useState('United States');
  const [radiusKm, setRadiusKm] = useState(0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!keyword.trim() || !location.trim() || isSearching) return;
    onSearch(keyword.trim(), location.trim(), country, radiusKm);
  };

  return (
    <div className="bg-white border-b border-panel-border px-4 sm:px-6 py-3 sm:py-4">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row lg:flex-row gap-2 sm:gap-3 items-stretch sm:items-center"
      >
        {/* Keyword Input */}
        <div className="relative flex-1 max-w-none sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g., Dentist, Plumber, Restaurant"
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-panel-border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all"
            disabled={isSearching}
          />
        </div>

        {/* Location Input */}
        <div className="relative flex-1 max-w-none sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MapPin className="w-4 h-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Austin, TX or Berlin"
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-panel-border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all"
            disabled={isSearching}
          />
        </div>

        {/* Radius Input + Country Input row on mobile, inline on desktop */}
        <div className="flex sm:flex-none gap-2 sm:gap-3 flex-1 sm:flex-initial">
          {/* Radius Input */}
          <div className="relative flex-1 sm:w-[100px] sm:flex-none">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Navigation className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="number"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              placeholder="Radius km"
              min={0}
              max={50}
              step={5}
              className="w-full pl-8 pr-2 py-2 bg-gray-50 border border-panel-border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all"
              disabled={isSearching}
            />
          </div>

          {/* Country Input */}
          <div className="relative flex-1 sm:max-w-[160px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Globe className="w-4 h-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-panel-border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 transition-all"
              disabled={isSearching}
            />
          </div>
        </div>

        {/* Find Leads Button */}
        <button
          type="submit"
          disabled={isSearching || !keyword.trim() || !location.trim()}
          className="flex items-center justify-center gap-2 px-5 py-2 bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 text-white text-sm font-semibold rounded-lg transition-colors disabled:cursor-not-allowed sm:w-auto"
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Find Leads
            </>
          )}
        </button>
      </form>
    </div>
  );
}
