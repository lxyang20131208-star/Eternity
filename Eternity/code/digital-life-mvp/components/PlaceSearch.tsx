'use client';

import { useState, useEffect, useRef } from 'react';

interface SearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string; // Nominatim returns display_name, sometimes name
  type: string;
}

interface PlaceSearchProps {
  onSelect: (location: { name: string; lat: number; lng: number; address: string }) => void;
}

export default function PlaceSearch({ onSelect }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length > 2) {
        searchPlaces(query);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  async function searchPlaces(q: string) {
    setLoading(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=zh-CN`
      );
      const data = await response.json();
      setResults(data);
      setShowResults(true);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSelect = (result: SearchResult) => {
    // Extract a simpler name from display_name (usually first part)
    const name = result.display_name.split(',')[0];
    onSelect({
      name: name,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      address: result.display_name,
    });
    setQuery('');
    setShowResults(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="试试回忆旅行去过的地方，比如“京都”“西藏”…"
          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
        <div className="absolute left-3 top-2.5 text-gray-400">🔍</div>
        {loading && (
          <div className="absolute right-3 top-2.5">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 max-h-60 overflow-y-auto">
          {results.map((result) => (
            <button
              key={result.place_id}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
            >
              <div className="font-medium text-gray-900 truncate">
                {result.display_name.split(',')[0]}
              </div>
              <div className="text-xs text-gray-500 truncate mt-1">
                {result.display_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
