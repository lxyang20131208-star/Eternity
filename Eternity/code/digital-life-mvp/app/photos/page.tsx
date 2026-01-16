'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPhotos, getUnsortedStats } from '@/lib/photosApi';
import type { Photo, PhotoFilters, UnsortedStats } from '@/lib/types/photos';
import Link from 'next/link';

export default function PhotosPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<UnsortedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<PhotoFilters>({});
  const [viewMode, setViewMode] = useState<'all' | 'unsorted'>('all');

  // 加载照片
  useEffect(() => {
    loadPhotos();
    loadStats();
  }, [filters, viewMode]);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: 从session获取
      const data = await getPhotos(projectId, {
        ...filters,
        is_sorted: viewMode === 'unsorted' ? false : undefined,
        sort_by: 'taken_at',
        sort_order: 'desc',
      });
      setPhotos(data);
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: 从session获取
      const data = await getUnsortedStats(projectId);
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '未知日期';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-semibold text-gray-900">照片</h1>
              
              {/* 视图切换 */}
              <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  全部照片
                </button>
                <button
                  onClick={() => setViewMode('unsorted')}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors relative ${
                    viewMode === 'unsorted'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  待整理
                  {stats && stats.total_count > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                      {stats.total_count}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 右侧按钮 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/photos/upload')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                上传照片
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 未整理提示横幅 */}
      {viewMode === 'all' && stats && stats.total_count > 0 && (
        <div className="bg-orange-50 border-b border-orange-200">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-orange-900">
                  你有 <strong>{stats.total_count}</strong> 张照片待整理，其中{' '}
                  {stats.without_person > 0 && `${stats.without_person} 张未标记人物`}
                  {stats.without_place > 0 && `, ${stats.without_place} 张未标记地点`}
                </p>
              </div>
              <button
                onClick={() => setViewMode('unsorted')}
                className="text-sm font-medium text-orange-700 hover:text-orange-800"
              >
                去整理 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          // 加载骨架屏
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          // 空状态
          <div className="text-center py-20">
            <svg
              className="mx-auto h-24 w-24 text-gray-300 mb-4"
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {viewMode === 'unsorted' ? '没有待整理的照片' : '还没有照片'}
            </h3>
            <p className="text-gray-500 mb-6">
              {viewMode === 'unsorted'
                ? '所有照片都已整理完毕！'
                : '上传你的第一张照片，开始记录回忆'}
            </p>
            {viewMode === 'all' && (
              <button
                onClick={() => router.push('/photos/upload')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                上传照片
              </button>
            )}
          </div>
        ) : (
          // 照片网格
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1">
            {photos.map((photo) => (
              <Link
                key={photo.id}
                href={`/photos/${photo.id}`}
                className="group relative aspect-square bg-gray-100 overflow-hidden hover:opacity-90 transition-opacity"
              >
                <img
                  src={photo.thumb_url || photo.url}
                  alt={photo.title || '照片'}
                  className="w-full h-full object-cover"
                />
                
                {/* 悬停信息 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    {photo.title && (
                      <p className="text-white text-sm font-medium truncate mb-1">
                        {photo.title}
                      </p>
                    )}
                    {photo.taken_at && (
                      <p className="text-white/80 text-xs">
                        {formatDate(photo.taken_at)}
                      </p>
                    )}
                  </div>
                </div>

                {/* 未整理标记 */}
                {!photo.is_sorted && (
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full font-medium">
                      待整理
                    </span>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
