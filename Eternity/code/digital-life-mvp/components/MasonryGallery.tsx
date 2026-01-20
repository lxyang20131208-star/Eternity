'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import type { Photo } from '@/lib/types/photos';

interface MasonryGalleryProps {
  photos: Photo[];
  onPhotoClick?: (photo: Photo) => void;
}

// Generate random aspect ratios for demo/empty state
function getAspectRatio(photo: Photo): number {
  if (photo.width && photo.height) {
    return photo.height / photo.width;
  }
  // Fallback: generate a consistent pseudo-random ratio based on id
  const hash = photo.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const ratios = [0.75, 1, 1.25, 1.5, 0.8, 1.1, 1.33];
  return ratios[hash % ratios.length];
}

export default function MasonryGallery({ photos, onPhotoClick }: MasonryGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  // Responsive column calculation
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) setColumns(2);
      else if (width < 768) setColumns(3);
      else if (width < 1024) setColumns(4);
      else if (width < 1280) setColumns(5);
      else setColumns(6);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Distribute photos into columns using shortest-column algorithm
  const columnPhotos = useMemo(() => {
    const cols: Photo[][] = Array.from({ length: columns }, () => []);
    const colHeights: number[] = Array(columns).fill(0);

    photos.forEach((photo) => {
      // Find shortest column
      const minHeight = Math.min(...colHeights);
      const shortestCol = colHeights.indexOf(minHeight);

      cols[shortestCol].push(photo);
      colHeights[shortestCol] += getAspectRatio(photo);
    });

    return cols;
  }, [photos, columns]);

  const handleImageLoad = (photoId: string) => {
    setLoadedImages((prev) => new Set(prev).add(photoId));
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (photos.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="flex gap-3 px-2"
      style={{ alignItems: 'flex-start' }}
    >
      {columnPhotos.map((colPhotos, colIndex) => (
        <div
          key={colIndex}
          className="flex-1 flex flex-col gap-3"
          style={{ minWidth: 0 }}
        >
          {colPhotos.map((photo) => {
            const aspectRatio = getAspectRatio(photo);
            const isLoaded = loadedImages.has(photo.id);

            return (
              <Link
                key={photo.id}
                href={`/photos/${photo.id}`}
                className="group relative block overflow-hidden rounded-2xl bg-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                style={{
                  aspectRatio: `1 / ${aspectRatio}`,
                }}
                onClick={(e) => {
                  if (onPhotoClick) {
                    e.preventDefault();
                    onPhotoClick(photo);
                  }
                }}
              >
                {/* Skeleton loader */}
                {!isLoaded && (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
                )}

                {/* Image */}
                <img
                  src={photo.thumb_url || photo.url}
                  alt={photo.title || '照片'}
                  className={`w-full h-full object-cover transition-all duration-500 ${
                    isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                  } group-hover:scale-105`}
                  loading="lazy"
                  onLoad={() => handleImageLoad(photo.id)}
                />

                {/* Gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Unsorted badge */}
                {!photo.is_sorted && (
                  <div className="absolute top-2 right-2 z-10">
                    <span className="px-2 py-1 bg-orange-500/90 backdrop-blur-sm text-white text-xs rounded-full font-medium shadow-lg">
                      待整理
                    </span>
                  </div>
                )}

                {/* Info overlay on hover */}
                <div className="absolute bottom-0 left-0 right-0 p-3 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  {photo.title && (
                    <h3 className="text-white text-sm font-semibold truncate mb-0.5 drop-shadow-lg">
                      {photo.title}
                    </h3>
                  )}
                  <div className="flex items-center gap-2 text-white/80 text-xs">
                    {photo.taken_at && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {formatDate(photo.taken_at)}
                      </span>
                    )}
                    {photo.person_ids && photo.person_ids.length > 0 && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {photo.person_ids.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Corner highlight effect */}
                <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-tl-2xl" />
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
