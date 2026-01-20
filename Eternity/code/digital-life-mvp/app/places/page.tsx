'use client';

import { useState, useEffect } from 'react';
import { getPlaces, getPlace } from '@/lib/knowledgeGraphApi';
import type { Place, PlaceWithRelations } from '@/lib/types/knowledge-graph';

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupedPlaces, setGroupedPlaces] = useState<Record<string, Place[]>>({});
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
      const placesData = await getPlaces(projectId, { hasEvents: true });
      setPlaces(placesData);
      
      // 按层级分组
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
      console.error('加载地点失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      alert(`加载地点失败: ${errorMessage}\n请检查网络连接和数据库配置`);
    } finally {
      setLoading(false);
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

  function formatTimeRange(place: PlaceWithRelations): string {
    const events = place.events || [];
    if (events.length === 0) return '无时间记录';
    
    // 这里简化处理，实际应该从 time_ref 获取
    const dates = events.map((e) => e.created_at);
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    const latest = dates.reduce((a, b) => (a > b ? a : b));
    
    return `${new Date(earliest).toLocaleDateString('zh-CN')} - ${new Date(latest).toLocaleDateString('zh-CN')}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-teal-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">加载地图...</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-teal-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">🗺️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">未找到项目</h2>
          <p className="text-gray-600 mb-6">请先创建或选择一个项目</p>
          <a
            href="/main"
            className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🗺️ 地点地图</h1>
          <p className="text-gray-600">按地理位置查看人生足迹</p>
          <div className="mt-4 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg">
            <p className="text-sm">
              📍 <strong>注意：</strong>交互式地图功能需要集成 Mapbox 或 Google Maps API。
              当前显示的是地点列表视图，点击地点可查看详情。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：地点列表 */}
          <div className="lg:col-span-2 space-y-6">
            {Object.entries(groupedPlaces).map(([level, levelPlaces]) => {
              if (levelPlaces.length === 0) return null;
              
              const levelNames: Record<string, string> = {
                country: '🌍 国家',
                city: '🏙️ 城市',
                district: '🏘️ 区县',
                point: '📍 具体地点',
                unknown: '❓ 未分类',
              };
              
              return (
                <div key={level} className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">{levelNames[level]}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {levelPlaces.map((place) => (
                      <button
                        key={place.id}
                        onClick={() => handlePlaceClick(place.id)}
                        className="text-left p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{place.name}</h3>
                            {place.description && (
                              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{place.description}</p>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              {place.lat && place.lng && (
                                <span className="text-xs text-gray-500">
                                  📍 {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                                </span>
                              )}
                            </div>
                          </div>
                          {place.photos && place.photos.length > 0 && (
                            <div className="ml-2 w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                              <img
                                src={place.photos[0]}
                                alt={place.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {places.length === 0 && (
              <div className="bg-white rounded-xl shadow-lg p-12 text-center">
                <p className="text-gray-500 text-lg">暂无地点数据</p>
                <p className="text-gray-400 text-sm mt-2">开始对话，让AI帮你整理人生足迹</p>
              </div>
            )}
          </div>

          {/* 右侧：地点详情 */}
          <div className="lg:col-span-1">
            {selectedPlace ? (
              <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
                <button
                  onClick={() => setSelectedPlace(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 mb-4"
                >
                  ← 返回列表
                </button>

                <h2 className="text-2xl font-bold text-gray-900 mb-4">{selectedPlace.name}</h2>

                {/* 照片墙 */}
                {selectedPlace.photos && selectedPlace.photos.length > 0 && (
                  <div className="mb-6">
                    <div className="grid grid-cols-2 gap-2">
                      {selectedPlace.photos.slice(0, 4).map((photo, idx) => (
                        <div key={idx} className="aspect-square rounded-lg overflow-hidden">
                          <img src={photo} alt={`${selectedPlace.name} ${idx + 1}`} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 描述 */}
                {selectedPlace.description && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">📝 描述</h3>
                    <p className="text-gray-600">{selectedPlace.description}</p>
                  </div>
                )}

                {/* 时间范围 */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">⏰ 时间范围</h3>
                  <p className="text-gray-600">{formatTimeRange(selectedPlace)}</p>
                </div>

                {/* 子地点 */}
                {selectedPlace.childPlaces && selectedPlace.childPlaces.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">📍 子地点 ({selectedPlace.childPlaces.length})</h3>
                    <div className="space-y-2">
                      {selectedPlace.childPlaces.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => handlePlaceClick(child.id)}
                          className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm"
                        >
                          {child.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关联事件 */}
                {selectedPlace.events && selectedPlace.events.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">📅 相关事件 ({selectedPlace.events.length})</h3>
                    <div className="space-y-2">
                      {selectedPlace.events.map((event) => (
                        <div key={event.id} className="p-3 bg-amber-50 rounded-lg">
                          <p className="font-medium text-gray-900">{event.title}</p>
                          {event.summary && <p className="text-sm text-gray-600 mt-1">{event.summary}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 关联人物 */}
                {selectedPlace.people && selectedPlace.people.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">👥 相关人物 ({selectedPlace.people.length})</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlace.people.map((person) => (
                        <span key={person.id} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                          {person.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
                <div className="text-center text-gray-500">
                  <p className="mb-2">👈</p>
                  <p>点击左侧地点查看详情</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
