'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPhotos, getUnsortedStats } from '@/lib/photosApi';
import type { Photo, PhotoFilters, UnsortedStats } from '@/lib/types/photos';
import MasonryGallery from '@/components/MasonryGallery';

export default function PhotosPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<UnsortedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PhotoFilters>({});
  const [viewMode, setViewMode] = useState<'all' | 'unsorted'>('all');

  // Load photos
  useEffect(() => {
    loadPhotos();
    loadStats();
  }, [filters, viewMode]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: Get from session
      if (!projectId || projectId === 'YOUR_PROJECT_ID') {
        // Running in demo/dev without a real project — skip API call
        setPhotos([]);
        return;
      }
      const data = await getPhotos(projectId, {
        filters: {
          ...filters,
          is_sorted: viewMode === 'unsorted' ? false : undefined,
        },
        sort: 'taken_at',
        order: 'desc',
      });
      setPhotos(data);
    } catch (error: any) {
      console.error('Failed to load photos:', error?.message ?? error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: Get from session
      if (!projectId || projectId === 'YOUR_PROJECT_ID') {
        setStats(null);
        return;
      }
      const data = await getUnsortedStats(projectId);
      setStats(data);
    } catch (error: any) {
      console.error('Failed to load stats:', error?.message ?? error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  照片
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {photos.length > 0 ? `${photos.length} 张照片` : '记录美好瞬间'}
                </p>
              </div>

              {/* View mode toggle */}
              <div className="flex gap-1 bg-gray-100/80 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    viewMode === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  全部照片
                </button>
                <button
                  onClick={() => setViewMode('unsorted')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative ${
                    viewMode === 'unsorted'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  待整理
                  {stats && stats.total_count > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs rounded-full font-semibold">
                      {stats.total_count}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Upload button */}
            <button
              onClick={() => router.push('/photos/new')}
              className="group px-5 py-2.5 bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] hover:from-[#efd2a8] hover:to-[#efe0d6] text-[#2C2C2C] rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm"
            >
              <svg className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              上传照片
            </button>
          </div>
        </div>
      </header>

      {/* Unsorted banner */}
      {viewMode === 'all' && stats && stats.total_count > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center shadow-lg shadow-orange-200">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-orange-900">
                    有 <strong>{stats.total_count}</strong> 张照片待整理
                  </p>
                  <p className="text-xs text-orange-700/70">
                    {stats.without_person > 0 && `${stats.without_person} 张未标记人物`}
                    {stats.without_person > 0 && stats.without_place > 0 && '，'}
                    {stats.without_place > 0 && `${stats.without_place} 张未标记地点`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewMode('unsorted')}
                className="text-sm font-medium text-orange-700 hover:text-orange-800 flex items-center gap-1 group"
              >
                去整理
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6">
        {loading ? (
          // Skeleton loader with masonry-like layout
          <div className="flex gap-3 px-2">
            {[...Array(5)].map((_, colIndex) => (
              <div key={colIndex} className="flex-1 flex flex-col gap-3">
                {[...Array(4)].map((_, i) => {
                  const heights = ['h-48', 'h-64', 'h-52', 'h-72', 'h-56'];
                  return (
                    <div
                      key={i}
                      className={`${heights[(colIndex + i) % heights.length]} bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl animate-pulse`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : photos.length === 0 ? (
          // Empty state
          <div className="text-center py-20 px-4">
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-6 mx-auto">
                <svg
                  className="w-16 h-16 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-pink-400 to-rose-400 rounded-lg transform rotate-12 opacity-60" />
              <div className="absolute -bottom-1 -left-3 w-4 h-4 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg transform -rotate-12 opacity-60" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {viewMode === 'unsorted' ? '没有待整理的照片' : '还没有照片'}
            </h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              {viewMode === 'unsorted'
                ? '太棒了！所有照片都已整理完毕'
                : '上传你的第一张照片，开始记录生活中的美好瞬间'}
            </p>
            {viewMode === 'all' && (
              <button
                  onClick={() => router.push('/photos/new')}
                  className="group px-8 py-3.5 bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] hover:from-[#efd2a8] hover:to-[#efe0d6] text-[#2C2C2C] rounded-2xl transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-sm"
                >
                <svg className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                上传照片
              </button>
            )}
          </div>
        ) : (
          // Masonry gallery
          <MasonryGallery photos={photos} />
        )}
      </main>
    </div>
  );
}
