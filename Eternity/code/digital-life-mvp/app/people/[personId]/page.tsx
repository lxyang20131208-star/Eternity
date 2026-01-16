'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPerson, updatePerson } from '@/lib/knowledgeGraphApi';
import type { PersonWithRelations } from '@/lib/types/knowledge-graph';

export default function PersonDetailPage({ params }: { params: { personId: string } }) {
  const router = useRouter();
  const [person, setPerson] = useState<PersonWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    role: '',
    bio_snippet: '',
    aliases: [] as string[],
  });

  useEffect(() => {
    loadPerson();
  }, [params.personId]);

  async function loadPerson() {
    try {
      setLoading(true);
      const data = await getPerson(params.personId);
      setPerson(data);
      if (data) {
        setEditForm({
          name: data.name,
          role: data.role || '',
          bio_snippet: data.bio_snippet || '',
          aliases: data.aliases || [],
        });
      }
    } catch (error) {
      console.error('加载人物失败:', error);
      alert('加载人物失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!person) return;
    try {
      await updatePerson(person.id, editForm);
      await loadPerson();
      setEditing(false);
      alert('保存成功！');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('zh-CN');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">人物不存在</p>
          <button onClick={() => router.push('/family')} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            返回人物列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 返回按钮 */}
        <button onClick={() => router.push('/family')} className="mb-6 text-blue-600 hover:text-blue-700 flex items-center gap-2">
          <span>←</span>
          <span>返回人物页</span>
        </button>

        {/* 人物头部 */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-start gap-6">
            {/* 头像 */}
            <div className="flex-shrink-0">
              {person.avatar_url ? (
                <img src={person.avatar_url} alt={person.name} className="w-32 h-32 rounded-full object-cover border-4 border-blue-200" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-4xl font-bold">
                  {person.name.charAt(0)}
                </div>
              )}
            </div>

            {/* 基本信息 */}
            <div className="flex-1">
              {editing ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-2xl font-bold"
                    placeholder="姓名"
                  />
                  <input
                    type="text"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="关系（如：父亲、母亲、朋友）"
                  />
                  <textarea
                    value={editForm.bio_snippet}
                    onChange={(e) => setEditForm({ ...editForm, bio_snippet: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    placeholder="一句话简介"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      保存
                    </button>
                    <button onClick={() => setEditing(false)} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-2">
                    <h1 className="text-4xl font-bold text-gray-900">{person.name}</h1>
                    {person.role && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">{person.role}</span>}
                  </div>
                  {person.aliases && person.aliases.length > 0 && (
                    <p className="text-gray-600 mb-2">
                      别名：{person.aliases.join('、')}
                    </p>
                  )}
                  {person.bio_snippet && <p className="text-gray-700 text-lg mb-4">{person.bio_snippet}</p>}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    {person.earliestDate && person.latestDate && (
                      <span>⏰ {formatDate(person.earliestDate)} - {formatDate(person.latestDate)}</span>
                    )}
                    <span>💬 {person.memoryCount || 0} 段回忆</span>
                    <span>⭐ 重要度 {person.importance_score}</span>
                  </div>
                  <button onClick={() => setEditing(true)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    编辑资料
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 照片墙 */}
          {person.cover_photos && person.cover_photos.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">📸 照片墙</h3>
              <div className="grid grid-cols-4 gap-3">
                {person.cover_photos.map((photo, idx) => (
                  <div key={idx} className="aspect-square rounded-lg overflow-hidden">
                    <img src={photo} alt={`${person.name} ${idx + 1}`} className="w-full h-full object-cover hover:scale-110 transition-transform" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 相关事件 */}
        {person.events && person.events.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📅 相关事件</h2>
            <div className="space-y-4">
              {person.events.map((event) => (
                <div key={event.id} className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h3 className="font-semibold text-gray-900">{event.title}</h3>
                  {event.summary && <p className="text-gray-700 mt-2">{event.summary}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 bg-amber-200 text-amber-800 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 共同回忆 */}
        {person.memories && person.memories.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">💭 共同回忆</h2>
            <div className="space-y-4">
              {person.memories.map((memory) => (
                <div key={memory.id} className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  {memory.snippet && <p className="font-medium text-gray-900 mb-2">{memory.snippet}</p>}
                  {memory.quote && (
                    <blockquote className="border-l-4 border-purple-400 pl-4 italic text-gray-700">
                      &ldquo;{memory.quote}&rdquo;
                    </blockquote>
                  )}
                  {memory.photos && memory.photos.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {memory.photos.slice(0, 3).map((photo, idx) => (
                        <img key={idx} src={photo} alt={`回忆 ${idx + 1}`} className="w-20 h-20 rounded object-cover" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 相关地点 */}
        {person.places && person.places.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">📍 相关地点</h2>
            <div className="grid grid-cols-2 gap-4">
              {person.places.map((place) => (
                <div key={place.id} className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="font-semibold text-gray-900">{place.name}</h3>
                  {place.description && <p className="text-sm text-gray-600 mt-1">{place.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
