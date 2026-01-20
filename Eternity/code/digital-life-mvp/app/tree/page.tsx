'use client';

import { useState, useEffect } from 'react';
import { getEvents, getPeople, getPlaces, getPlace, getPerson } from '@/lib/knowledgeGraphApi';
import type { 
  EventWithRelations, 
  Person, 
  Place, 
  PlaceWithRelations,
  PersonWithRelations 
} from '@/lib/types/knowledge-graph';

type TabType = 'people' | 'timeline' | 'map';

export default function TreePage() {
  const [activeTab, setActiveTab] = useState<TabType>('people');
  const [projectId, setProjectId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // People state
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonWithRelations | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Timeline state
  const [events, setEvents] = useState<EventWithRelations[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showUnverified, setShowUnverified] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Map state
  const [places, setPlaces] = useState<Place[]>([]);
  const [groupedPlaces, setGroupedPlaces] = useState<Record<string, Place[]>>({});
  const [selectedPlace, setSelectedPlace] = useState<PlaceWithRelations | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedProjectId = localStorage.getItem('currentProjectId');
      if (storedProjectId) {
        setProjectId(storedProjectId);
      }
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      loadAllData();
    }
  }, [projectId]);

  async function loadAllData() {
    if (!projectId) return;
    
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

      // 按层级分组地点
      const grouped: Record<string, Place[]> = {
        country: [],
        city: [],
        district: [],
        point: [],
        unknown: [],
      };
      
      placesData.forEach((place) => {
        const level = place.place_level || 'unknown';
        if (!grouped[level]) grouped[level] = [];
        grouped[level].push(place);
      });
      
      setGroupedPlaces(grouped);
    } catch (error) {
      console.error('加载数据失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`加载数据失败: ${errorMessage}\n请检查网络连接和数据库配置`);
    } finally {
      setLoading(false);
    }
  }

  async function handlePersonClick(personId: string) {
    try {
      const personDetail = await getPerson(personId);
      setSelectedPerson(personDetail);
    } catch (error) {
      console.error('加载人物详情失败:', error);
    }
  }

  async function handlePlaceClick(placeId: string) {
    try {
      const placeDetail = await getPlace(placeId);
      setSelectedPlace(placeDetail);
    } catch (error) {
      console.error('加载地点详情失败:', error);
    }
  }

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

  // 筛选人物
  const filteredPeople = people.filter((person) => {
    if (roleFilter === 'all') return true;
    return person.role === roleFilter;
  });

  const allTags = Array.from(new Set(events.flatMap((e) => e.tags)));
  const allRoles = Array.from(new Set(people.map((p) => p.role).filter(Boolean)));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载知识图谱...</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">🌳</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">未找到项目</h2>
          <p className="text-gray-600 mb-6">请先创建或选择一个项目</p>
          <a
            href="/main"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">🌳 知识图谱</h1>
          <p className="text-gray-600">人物关系、事件时间轴、地点地图</p>
        </div>

        {/* Tab 切换 */}
        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('people')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'people'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 人物 ({people.length})
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'text-amber-600 border-b-2 border-amber-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📅 时间轴 ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'map'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            🗺️ 地图 ({places.length})
          </button>
        </div>

        {/* People Tab */}
        {activeTab === 'people' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 人物列表 */}
            <div className="lg:col-span-2 space-y-4">
              {/* 筛选器 */}
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      roleFilter === 'all'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    全部
                  </button>
                  {allRoles.map((role) => (
                    <button
                      key={role}
                      onClick={() => setRoleFilter(role!)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        roleFilter === role
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* 人物卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPeople.map((person) => (
                  <div
                    key={person.id}
                    onClick={() => handlePersonClick(person.id)}
                    className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-all cursor-pointer border-l-4 border-purple-400"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        {person.avatar_url ? (
                          <img
                            src={person.avatar_url}
                            alt={person.name}
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center text-2xl">
                            👤
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {person.name}
                        </h3>
                        {person.role && (
                          <span className="inline-block px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs mb-2">
                            {person.role}
                          </span>
                        )}
                        {person.bio_snippet && (
                          <p className="text-sm text-gray-600 line-clamp-2">{person.bio_snippet}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          {person.metadata?.birth_date && <span>🎂 {person.metadata.birth_date}</span>}
                          {person.importance_score && (
                            <span>⭐ {person.importance_score}/10</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {filteredPeople.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg">
                  <div className="text-4xl mb-2">👥</div>
                  <p className="text-gray-500">暂无人物数据</p>
                </div>
              )}
            </div>

            {/* 人物详情 */}
            <div className="lg:col-span-1">
              {selectedPerson ? (
                <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{selectedPerson.name}</h3>
                    <button
                      onClick={() => setSelectedPerson(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {selectedPerson.avatar_url && (
                    <img
                      src={selectedPerson.avatar_url}
                      alt={selectedPerson.name}
                      className="w-full h-48 object-cover rounded-lg mb-4"
                    />
                  )}

                  {selectedPerson.bio_snippet && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">简介</h4>
                      <p className="text-sm text-gray-600">{selectedPerson.bio_snippet}</p>
                    </div>
                  )}

                  <div className="space-y-3 text-sm">
                    {selectedPerson.role && (
                      <div>
                        <span className="text-gray-500">角色：</span>
                        <span className="text-gray-900 ml-2">{selectedPerson.role}</span>
                      </div>
                    )}
                    {selectedPerson.metadata?.birth_date && (
                      <div>
                        <span className="text-gray-500">出生：</span>
                        <span className="text-gray-900 ml-2">{selectedPerson.metadata.birth_date}</span>
                      </div>
                    )}
                    {selectedPerson.importance_score && (
                      <div>
                        <span className="text-gray-500">重要度：</span>
                        <span className="text-gray-900 ml-2">{selectedPerson.importance_score}/10</span>
                      </div>
                    )}
                  </div>

                  {selectedPerson.events && selectedPerson.events.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        相关事件 ({selectedPerson.events.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedPerson.events.slice(0, 5).map((event) => (
                          <div key={event.id} className="text-sm p-2 bg-gray-50 rounded">
                            {event.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 sticky top-4">
                  点击人物卡片查看详情
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* 筛选面板 */}
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-white rounded-lg shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-3">筛选</h3>

                <div className="space-y-4">
                  {/* 人物筛选 */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">人物</label>
                    <div className="space-y-2">
                      {people.slice(0, 5).map((person) => (
                        <label key={person.id} className="flex items-center gap-2 text-sm">
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
                            className="rounded border-gray-300"
                          />
                          <span className="text-gray-700">{person.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 标签筛选 */}
                  {allTags.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">标签</label>
                      <div className="flex flex-wrap gap-2">
                        {allTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              if (selectedTags.includes(tag)) {
                                setSelectedTags(selectedTags.filter((t) => t !== tag));
                              } else {
                                setSelectedTags([...selectedTags, tag]);
                              }
                            }}
                            className={`px-2 py-1 rounded text-xs ${
                              selectedTags.includes(tag)
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 显示未验证 */}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showUnverified}
                      onChange={(e) => setShowUnverified(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-gray-700">显示未验证事件</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 时间轴 */}
            <div className="lg:col-span-3">
              <div className="space-y-4">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 text-center">
                        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-xl">
                          📅
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{event.title}</h3>
                          {!event.verified && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                              未验证
                            </span>
                          )}
                        </div>

                        {event.timeRef && (
                          <div className="text-sm text-gray-600 mb-2">
                            📅 {formatDate(event.timeRef)}
                          </div>
                        )}

                        {event.summary && (
                          <p className="text-sm text-gray-600 mb-3">{event.summary}</p>
                        )}

                        {event.tags && event.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {event.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-amber-50 text-amber-700 text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {event.people && event.people.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className="text-xs text-gray-500">涉及人物：</span>
                            {event.people.map((person) => (
                              <span
                                key={person.id}
                                className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded"
                              >
                                {person.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {event.places && event.places.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className="text-xs text-gray-500">地点：</span>
                            {event.places.map((place) => (
                              <span
                                key={place.id}
                                className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded"
                              >
                                {place.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {event.evidence && event.evidence.length > 0 && (
                          <button
                            onClick={() => toggleEvidence(event.id)}
                            className="text-sm text-blue-600 hover:text-blue-700"
                          >
                            {expandedEvents.has(event.id) ? '▼' : '▶'} 查看证据来源
                          </button>
                        )}

                        {expandedEvents.has(event.id) && event.evidence && event.evidence.length > 0 && (
                          <div className="mt-2 p-3 bg-gray-50 rounded text-sm text-gray-600">
                            {event.evidence.map((e, i) => (
                              <div key={i}>{e.text} <span className="text-gray-400">- {e.source}</span></div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredEvents.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-lg">
                    <div className="text-4xl mb-2">📅</div>
                    <p className="text-gray-500">暂无事件数据</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Map Tab */}
        {activeTab === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 地点列表 */}
            <div className="lg:col-span-2 space-y-6">
              {Object.entries(groupedPlaces).map(([level, placesInLevel]) => {
                if (placesInLevel.length === 0) return null;
                
                const levelNames: Record<string, string> = {
                  country: '🌏 国家/地区',
                  city: '🏙️ 城市',
                  district: '📍 区域',
                  point: '📌 具体地点',
                  unknown: '❓ 未分类',
                };

                return (
                  <div key={level} className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      {levelNames[level] || level}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {placesInLevel.map((place) => (
                        <div
                          key={place.id}
                          onClick={() => handlePlaceClick(place.id)}
                          className="p-4 border border-gray-200 rounded-lg hover:border-green-400 hover:shadow-md transition-all cursor-pointer"
                        >
                          <h4 className="font-semibold text-gray-900 mb-2">{place.name}</h4>
                          {place.lat && place.lng && (
                            <div className="text-xs text-gray-500 mb-2">
                              📍 {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                            </div>
                          )}
                          {place.description && (
                            <p className="text-sm text-gray-600 line-clamp-2">
                              {place.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {places.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg">
                  <div className="text-4xl mb-2">🗺️</div>
                  <p className="text-gray-500">暂无地点数据</p>
                </div>
              )}
            </div>

            {/* 地点详情 */}
            <div className="lg:col-span-1">
              {selectedPlace ? (
                <div className="bg-white rounded-lg shadow-sm p-6 sticky top-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-gray-900">{selectedPlace.name}</h3>
                    <button
                      onClick={() => setSelectedPlace(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {selectedPlace.description && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">描述</h4>
                      <p className="text-sm text-gray-600">{selectedPlace.description}</p>
                    </div>
                  )}

                  <div className="space-y-3 text-sm">
                    {selectedPlace.place_level && (
                      <div>
                        <span className="text-gray-500">层级：</span>
                        <span className="text-gray-900 ml-2">{selectedPlace.place_level}</span>
                      </div>
                    )}
                    {selectedPlace.lat && selectedPlace.lng && (
                      <div>
                        <span className="text-gray-500">坐标：</span>
                        <span className="text-gray-900 ml-2">
                          {selectedPlace.lat.toFixed(4)}, {selectedPlace.lng.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedPlace.events && selectedPlace.events.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        相关事件 ({selectedPlace.events.length})
                      </h4>
                      <div className="space-y-2">
                        {selectedPlace.events.slice(0, 5).map((event) => (
                          <div key={event.id} className="text-sm p-2 bg-gray-50 rounded">
                            {event.title}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 sticky top-4">
                  点击地点查看详情
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
