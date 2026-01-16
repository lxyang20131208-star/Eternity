'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPhotos, batchUpdatePhotos } from '@/lib/photosApi';
import type { Photo } from '@/lib/types/photos';

export default function UnsortedQueuePage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUnsortedPhotos();
  }, []);

  const loadUnsortedPhotos = async () => {
    setLoading(true);
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: 从session获取
      const data = await getPhotos(projectId, {
        is_sorted: false,
        sort_by: 'created_at',
        sort_order: 'asc',
      });
      setPhotos(data);
    } catch (error) {
      console.error('Failed to load photos:', error);
    } finally {
      setLoading(false);
    }
  };

  // 切换选中
  const toggleSelect = (photoId: string) => {
    setSelectedIds((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.length === photos.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(photos.map((p) => p.id));
    }
  };

  // 批量标记为已整理
  const markAsSorted = async () => {
    if (selectedIds.length === 0) return;
    
    try {
      await batchUpdatePhotos(selectedIds, { is_sorted: true });
      await loadUnsortedPhotos();
      setSelectedIds([]);
    } catch (error) {
      console.error('Failed to mark as sorted:', error);
      alert('操作失败');
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '未知日期';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部工具栏 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">未整理队列</h1>
                <p className="text-sm text-gray-500">{photos.length} 张照片待整理</p>
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  已选中 {selectedIds.length} 张
                </span>
                <button
                  onClick={markAsSorted}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  标记为已整理
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-16 w-16 text-green-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              所有照片都已整理！
            </h3>
            <p className="text-gray-500 mb-6">
              做得好！所有照片都已标记人物和地点
            </p>
            <button
              onClick={() => router.push('/photos')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              查看照片库
            </button>
          </div>
        ) : (
          <>
            {/* 批量操作提示 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-blue-900 mb-2">
                    <strong>提示：</strong>点击照片可以查看详情并标记人物、地点等信息。完成整理后勾选照片并点击"标记为已整理"。
                  </p>
                  <button
                    onClick={toggleSelectAll}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800"
                  >
                    {selectedIds.length === photos.length ? '取消全选' : '全选'}
                  </button>
                </div>
              </div>
            </div>

            {/* 照片网格 */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="group relative bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* 选择框 */}
                  <div className="absolute top-3 left-3 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(photo.id);
                      }}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedIds.includes(photo.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-white/80 border-white hover:border-blue-400'
                      }`}
                    >
                      {selectedIds.includes(photo.id) && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* 照片 */}
                  <a
                    href={`/photos/${photo.id}`}
                    className="block aspect-square"
                  >
                    <img
                      src={photo.thumb_url || photo.url}
                      alt={photo.title || '照片'}
                      className="w-full h-full object-cover"
                    />
                  </a>

                  {/* 信息 */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 truncate mb-1">
                      {photo.title || '未命名照片'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(photo.taken_at)}
                    </p>
                    
                    {/* 缺失信息标签 */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(!photo.person_ids || photo.person_ids.length === 0) && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                          缺少人物
                        </span>
                      )}
                      {!photo.place_id && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                          缺少地点
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
