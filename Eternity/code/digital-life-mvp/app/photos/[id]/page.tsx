'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getPhoto, updatePhoto, deletePhoto } from '@/lib/photosApi';
import type { PhotoWithRelations } from '@/lib/types/photos';

export default function PhotoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const photoId = params.id as string;

  const [photo, setPhoto] = useState<PhotoWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    tags: [] as string[],
  });

  // 加载照片
  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  const loadPhoto = async () => {
    setLoading(true);
    try {
      const data = await getPhoto(photoId);
      setPhoto(data);
      setEditData({
        title: data.title || '',
        description: data.description || '',
        tags: data.tags || [],
      });
    } catch (error) {
      console.error('Failed to load photo:', error);
      router.push('/photos');
    } finally {
      setLoading(false);
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (!photo) return;
    try {
      await updatePhoto(photo.id, editData);
      await loadPhoto();
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update photo:', error);
      alert('保存失败');
    }
  };

  // 删除照片
  const handleDelete = async () => {
    if (!photo) return;
    if (!confirm('确定要删除这张照片吗？此操作无法撤销。')) return;

    try {
      await deletePhoto(photo.id);
      router.push('/photos');
    } catch (error) {
      console.error('Failed to delete photo:', error);
      alert('删除失败');
    }
  };

  // 标记为已整理
  const handleMarkAsSorted = async () => {
    if (!photo) return;
    try {
      await updatePhoto(photo.id, { is_sorted: true });
      await loadPhoto();
    } catch (error) {
      console.error('Failed to mark as sorted:', error);
      alert('操作失败');
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
      </div>
    );
  }

  if (!photo) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 顶部工具栏 */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {!photo.is_sorted && (
              <button
                onClick={handleMarkAsSorted}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
              >
                标记为已整理
              </button>
            )}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-red-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="pt-16 pb-20 flex">
        {/* 左侧：照片 */}
        <div className="flex-1 flex items-center justify-center p-8">
          <img
            src={photo.url}
            alt={photo.title || '照片'}
            className="max-w-full max-h-[85vh] object-contain"
          />
        </div>

        {/* 右侧：信息面板 */}
        <aside className="w-96 bg-zinc-900 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* 标题和描述 */}
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">标题</label>
                  <input
                    type="text"
                    value={editData.title}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="照片标题"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">描述</label>
                  <textarea
                    value={editData.description}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="添加描述..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditData({
                        title: photo.title || '',
                        description: photo.description || '',
                        tags: photo.tags || [],
                      });
                    }}
                    className="flex-1 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {photo.title && (
                  <h2 className="text-xl font-semibold mb-2">{photo.title}</h2>
                )}
                {photo.description && (
                  <p className="text-gray-400 text-sm">{photo.description}</p>
                )}
              </div>
            )}

            {/* 拍摄信息 */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase">拍摄信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">拍摄时间</span>
                  <span>{formatDate(photo.taken_at)}</span>
                </div>
                {photo.place && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">地点</span>
                    <span>{photo.place.name}</span>
                  </div>
                )}
                {photo.event && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">事件</span>
                    <span>{photo.event.title}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">尺寸</span>
                  <span>
                    {photo.width} × {photo.height}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">文件大小</span>
                  <span>{(photo.file_size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
            </div>

            {/* 标签 */}
            {photo.tags && photo.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase">标签</h3>
                <div className="flex flex-wrap gap-2">
                  {photo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-zinc-800 rounded-full text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 相关人物 */}
            {photo.people && photo.people.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase">相关人物</h3>
                <div className="space-y-2">
                  {photo.people.map((person) => (
                    <div key={person.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-zinc-700 rounded-full" />
                      <span className="text-sm">{person.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EXIF 数据 */}
            {photo.metadata?.exif && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-gray-400 uppercase">相机信息</h3>
                <div className="space-y-2 text-sm">
                  {photo.metadata.exif.make && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">相机</span>
                      <span>{photo.metadata.exif.make} {photo.metadata.exif.model}</span>
                    </div>
                  )}
                  {photo.metadata.exif.fNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">光圈</span>
                      <span>f/{photo.metadata.exif.fNumber}</span>
                    </div>
                  )}
                  {photo.metadata.exif.exposureTime && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">快门</span>
                      <span>{photo.metadata.exif.exposureTime}s</span>
                    </div>
                  )}
                  {photo.metadata.exif.iso && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">ISO</span>
                      <span>{photo.metadata.exif.iso}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
