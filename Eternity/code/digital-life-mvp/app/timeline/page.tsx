'use client';

import { useState, useEffect } from 'react';
import { getEvents, getPeople, getPlaces } from '@/lib/knowledgeGraphApi';
import type { EventWithRelations, Person, Place } from '@/lib/types/knowledge-graph';

export default function TimelinePage() {
  const [events, setEvents] = useState<EventWithRelations[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 筛选状态
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showUnverified, setShowUnverified] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    // 获取 projectId
    if (typeof window !== 'undefined') {
      const storedProjectId = localStorage.getItem('currentProjectId');
      if (storedProjectId) {
        setProjectId(storedProjectId);
      }
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  async function loadData() {
    if (!projectId) {
      console.error('projectId 为空，无法加载数据');
      return;
    }

    try {
      setLoading(true);
      const [eventsData, peopleData, placesData] = await Promise.all([
        getEvents(projectId),
        getPeople(projectId),
        getPlaces(projectId),
      ]);
      setEvents(eventsData);
      setPeople(peopleData);
      setPlaces(placesData);
    } catch (error) {
      console.error('加载数据失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`加载数据失败: ${errorMessage}\n请检查网络连接和数据库配置`);
    } finally {
      setLoading(false);
    }
  }

  // 筛选事件
  const filteredEvents = events.filter((event) => {
    if (!showUnverified && !event.verified) return false;
    if (selectedPeople.length > 0) {
      const eventPeopleIds = event.people?.map((p) => p.id) || [];
      if (!selectedPeople.some((id) => eventPeopleIds.includes(id))) return false;
    }
    if (selectedPlaces.length > 0) {
      const eventPlaceIds = event.places?.map((p) => p.id) || [];
      if (!selectedPlaces.some((id) => eventPlaceIds.includes(id))) return false;
    }
    if (selectedTags.length > 0) {
      if (!selectedTags.some((tag) => event.tags.includes(tag))) return false;
    }
    return true;
  });

  // 获取所有标签
  const allTags = Array.from(new Set(events.flatMap((e) => e.tags)));

  function toggleEvidence(eventId: string) {
    setExpandedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  }

  function formatDate(timeRef: any): string {
    if (!timeRef) return '时间未知';
    if (timeRef.type === 'exact' && timeRef.start_date) {
      return new Date(timeRef.start_date).toLocaleDateString('zh-CN');
    }
    if (timeRef.type === 'range' && timeRef.start_date && timeRef.end_date) {
      return `${new Date(timeRef.start_date).toLocaleDateString('zh-CN')} - ${new Date(timeRef.end_date).toLocaleDateString('zh-CN')}`;
    }
    return timeRef.text || '时间未知';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载时间轴...</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">未找到项目</h2>
          <p className="text-gray-600 mb-6">请先创建或选择一个项目</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">📅 生命时间轴</h1>
          <p className="text-gray-600">按时间顺序查看人生重要事件</p>
        </div>

        {/* 筛选栏 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 人物筛选 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">👤 按人物筛选</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {people.map((person) => (
                  <label key={person.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedPeople.includes(person.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPeople([...selectedPeople, person.id]);
                        } else {
                          setSelectedPeople(selectedPeople.filter((id) => id !== person.id));
                        }
                      }}
                      className="mr-2 rounded text-amber-600"
                    />
                    <span className="text-sm">{person.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 地点筛选 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">📍 按地点筛选</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {places.map((place) => (
                  <label key={place.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedPlaces.includes(place.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPlaces([...selectedPlaces, place.id]);
                        } else {
                          setSelectedPlaces(selectedPlaces.filter((id) => id !== place.id));
                        }
                      }}
                      className="mr-2 rounded text-amber-600"
                    />
                    <span className="text-sm">{place.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 标签筛选 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">🏷️ 按标签筛选</label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {allTags.map((tag) => (
                  <label key={tag} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tag)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTags([...selectedTags, tag]);
                        } else {
                          setSelectedTags(selectedTags.filter((t) => t !== tag));
                        }
                      }}
                      className="mr-2 rounded text-amber-600"
                    />
                    <span className="text-sm">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showUnverified}
                onChange={(e) => setShowUnverified(e.target.checked)}
                className="mr-2 rounded text-amber-600"
              />
              <span className="text-sm text-gray-700">显示未确认事件</span>
            </label>
            <button
              onClick={() => {
                setSelectedPeople([]);
                setSelectedPlaces([]);
                setSelectedTags([]);
              }}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              清除筛选
            </button>
          </div>
        </div>

        {/* 时间轴 */}
        <div className="relative">
          {/* 中央竖线 */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-amber-200"></div>

          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">暂无事件数据</p>
              <p className="text-gray-400 text-sm mt-2">开始对话，让AI帮你整理人生故事</p>
            </div>
          ) : (
            <div className="space-y-8">
              {filteredEvents.map((event) => (
                <div key={event.id} className="relative pl-20">
                  {/* 时间点 */}
                  <div className="absolute left-5 top-6 w-6 h-6 bg-amber-500 rounded-full border-4 border-white shadow-lg"></div>

                  {/* 事件卡片 */}
                  <div className={`bg-white rounded-xl shadow-lg p-6 ${!event.verified ? 'border-2 border-dashed border-amber-300' : ''}`}>
                    {/* 事件头部 */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{event.title}</h3>
                        <p className="text-sm text-gray-500 mb-2">⏰ {formatDate(event.timeRef)}</p>
                        {event.summary && <p className="text-gray-700">{event.summary}</p>}
                      </div>
                      {!event.verified && (
                        <span className="ml-4 px-3 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">待确认</span>
                      )}
                    </div>

                    {/* 关联信息 */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {event.people?.map((person) => (
                        <span key={person.id} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                          👤 {person.name}
                        </span>
                      ))}
                      {event.places?.map((place) => (
                        <span key={place.id} className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                          📍 {place.name}
                        </span>
                      ))}
                      {event.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">
                          🏷️ {tag}
                        </span>
                      ))}
                    </div>

                    {/* 证据展开 */}
                    {event.evidence && event.evidence.length > 0 && (
                      <div>
                        <button
                          onClick={() => toggleEvidence(event.id)}
                          className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center"
                        >
                          {expandedEvents.has(event.id) ? '隐藏' : '查看'}原文证据
                          <span className="ml-1">{expandedEvents.has(event.id) ? '▲' : '▼'}</span>
                        </button>
                        {expandedEvents.has(event.id) && (
                          <div className="mt-3 space-y-2">
                            {event.evidence.map((ev, idx) => (
                              <div key={idx} className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded">
                                <p className="text-sm text-gray-700 italic">&ldquo;{ev.text}&rdquo;</p>
                                {ev.source && <p className="text-xs text-gray-500 mt-1">来源：{ev.source}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
