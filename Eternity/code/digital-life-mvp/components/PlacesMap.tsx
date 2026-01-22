'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Place } from '@/lib/types/knowledge-graph';

interface PlacesMapProps {
  places: Place[];
  onPlaceClick?: (placeId: string) => void;
  selectedPlaceId?: string;
}

export default function PlacesMap({ places, onPlaceClick, selectedPlaceId }: PlacesMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return;

    const initMap = () => {
      setMapError(null);

      // Fix Leaflet default icon issue
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Default center (China)
      const defaultCenter: [number, number] = [35.8617, 104.1954];
      const defaultZoom = 4;

      const map = L.map(mapRef.current!, {
        center: defaultCenter,
        zoom: defaultZoom,
        scrollWheelZoom: true,
      });

      // Add tile layer (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
      setIsMapReady(true);
    };

    try {
      initMap();
    } catch (error) {
      console.error('Leaflet 初始化失败:', error);
      setMapError('地图加载失败，请刷新或稍后再试。');
      setIsMapReady(false);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when places change
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const updateMarkers = () => {
      const map = mapInstanceRef.current;

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Filter places with coordinates
      const placesWithCoords = places.filter(p => p.lat && p.lng);

      if (placesWithCoords.length === 0) return;

      // Add markers
      const bounds = L.latLngBounds([]);

      placesWithCoords.forEach(place => {
        if (!place.lat || !place.lng) return;

        const isSelected = place.id === selectedPlaceId;

        // Custom icon for selected place
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div style="
              width: ${isSelected ? '36px' : '28px'};
              height: ${isSelected ? '36px' : '28px'};
              background: ${isSelected ? '#10b981' : '#3b82f6'};
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: ${isSelected ? '16px' : '12px'};
              transform: translate(-50%, -50%);
            ">
              ${isSelected ? '★' : '📍'}
            </div>
          `,
          iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
          iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
        });

        const marker = L.marker([place.lat, place.lng], { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width: 150px;">
              <h3 style="font-weight: bold; margin-bottom: 4px;">${place.name}</h3>
              ${place.description ? `<p style="font-size: 12px; color: #666; margin: 0;">${place.description.slice(0, 100)}${place.description.length > 100 ? '...' : ''}</p>` : ''}
              ${place.photos && place.photos.length > 0 ? `<p style="font-size: 11px; color: #888; margin-top: 4px;">📷 ${place.photos.length} 张照片</p>` : ''}
            </div>
          `);

        marker.on('click', () => {
          if (onPlaceClick) {
            onPlaceClick(place.id);
          }
        });

        markersRef.current.push(marker);
        bounds.extend([place.lat, place.lng]);
      });

      // Fit bounds with padding
      if (placesWithCoords.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    };

    updateMarkers();
  }, [places, isMapReady, selectedPlaceId, onPlaceClick]);

  // Pan to selected place
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !selectedPlaceId) return;

    const selectedPlace = places.find(p => p.id === selectedPlaceId);
    if (selectedPlace?.lat && selectedPlace?.lng) {
      mapInstanceRef.current.setView([selectedPlace.lat, selectedPlace.lng], 10, {
        animate: true,
        duration: 0.5,
      });
    }
  }, [selectedPlaceId, places, isMapReady]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden border border-gray-200">
      <div ref={mapRef} className="w-full h-full" />
      {!isMapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            {mapError ? (
              <p className="text-sm text-red-600">{mapError}</p>
            ) : (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">加载地图...</p>
              </>
            )}
          </div>
        </div>
      )}
      <style jsx global>{`
        .custom-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px;
        }
        .leaflet-popup-content {
          margin: 12px 16px;
        }
      `}</style>
    </div>
  );
}
