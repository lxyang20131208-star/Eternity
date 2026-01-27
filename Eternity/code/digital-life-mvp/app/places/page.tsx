'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { getPlaces, getPlace, updatePlace, createPlace, deletePlace } from '@/lib/knowledgeGraphApi';
import type { Place, PlaceWithRelations } from '@/lib/types/knowledge-graph';
import { supabase } from '@/lib/supabaseClient';
import PlaceSearch from '@/components/PlaceSearch';
import PlaceUploadModal from '@/components/PlaceUploadModal';
import UnifiedNav from '@/app/components/UnifiedNav';
import { reverseGeocode } from '@/lib/utils/geocoding';

// Dynamic import for Leaflet map (SSR disabled)
const PlacesMap = dynamic(() => import('@/components/PlacesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] rounded-xl bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-500">加载地图组件...</p>
      </div>
    </div>
  ),
});

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupedPlaces, setGroupedPlaces] = useState<Record<string, Place[]>>({});
  const [projectId, setProjectId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [fixingAddresses, setFixingAddresses] = useState(false);
  const [fixProgress, setFixProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedProjectId = localStorage.getItem('currentProjectId');
      if (storedProjectId) {
        setProjectId(storedProjectId);
      } else {
        // Auto-detect or create project if missing
        autoDetectProject();
      }
    }
  }, []);

  async function autoDetectProject() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Try to find existing project
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (projects && projects.length > 0) {
        const pid = projects[0].id;
        setProjectId(pid);
        localStorage.setItem('currentProjectId', pid);
      } else {
        // Create default project
        const { data: created } = await supabase
          .from('projects')
          .insert({ owner_id: user.id, name: 'My Vault' })
          .select('id')
          .single();
        
        if (created) {
          setProjectId(created.id);
          localStorage.setItem('currentProjectId', created.id);
        }
      }
    } catch (e) {
      console.error('Auto detect project failed:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) {
      loadData();
    } else {
      // Don't stop loading yet if we are auto-detecting
    }
  }, [projectId]);

  async function loadData() {
    if (!projectId) {
      return;
    }

    try {
      setLoading(true);
      const placesData = await getPlaces(projectId, { hasEvents: true });
      setPlaces(placesData);

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
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        console.debug('Load aborted');
        return;
      }
      console.error('加载地点失败:', error.message || error);
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

  async function handleSearchSelect(location: { name: string; lat: number; lng: number; address: string }) {
    if (!projectId) return;

    // Check if place already exists nearby (simple check)
    const existing = places.find(p => 
      p.name === location.name || 
      (p.lat && p.lng && Math.abs(p.lat - location.lat) < 0.001 && Math.abs(p.lng - location.lng) < 0.001)
    );

    if (existing) {
      handlePlaceClick(existing.id);
      return;
    }

    // Create new place
    if (confirm(`要在地图上添加新地点 "${location.name}" 吗？`)) {
      try {
        const newPlace = await createPlace({
          project_id: projectId,
          name: location.name,
          lat: location.lat,
          lng: location.lng,
          description: location.address,
          place_level: 'point', // Default to point
          metadata: {
            address: location.address,
            provider: 'nominatim'
          }
        });
        
        await loadData();
        handlePlaceClick(newPlace.id);
      } catch (error) {
        console.error('Failed to create place:', error);
        alert('创建地点失败');
      }
    }
  }

  async function handlePlaceUpdate(updates: Partial<Place>) {
    if (!selectedPlace) return;
    try {
      const updated = await updatePlace(selectedPlace.id, updates);
      setSelectedPlace({ ...selectedPlace, ...updated }); // Optimistic update
      await loadData(); // Refresh list
    } catch (error) {
      console.error('Update failed:', error);
      alert('更新失败');
    }
  }

  async function handlePlaceDelete() {
    if (!selectedPlace) return;
    
    if (confirm(`确定要删除地点 "${selectedPlace.name}" 吗？此操作无法撤销。`)) {
      try {
        await deletePlace(selectedPlace.id);
        setSelectedPlace(null);
        await loadData(); // Refresh list
      } catch (error) {
        console.error('Delete failed:', error);
        alert('删除失败');
      }
    }
  }

  async function extractPlaces() {
    if (!projectId || extracting) return;

    try {
      setExtracting(true);
      const { data, error } = await supabase.functions.invoke('extract_places', {
        body: { projectId },
      });

      if (error) throw error;

      alert(`成功抽取 ${data.extracted} 个地点，新增 ${data.newPlaces} 个`);
      await loadData();
    } catch (error: any) {
      console.error('地点抽取失败:', error);
      alert('地点抽取失败: ' + (error.message || '未知错误'));
    } finally {
      setExtracting(false);
    }
  }

  // Filter places by search query (local filter)
  const filteredPlaces = useMemo(() => {
    if (!searchQuery.trim()) return places;
    const query = searchQuery.toLowerCase();
    return places.filter(
      p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
    );
  }, [places, searchQuery]);

  // Places with coordinates for map
  const placesWithCoords = useMemo(() => {
    return filteredPlaces.filter(p => p.lat && p.lng);
  }, [filteredPlaces]);

  // 新增：找出有坐标但没有地址信息的地点
  const placesMissingAddress = useMemo(() => {
    return placesWithCoords.filter(p => !p.metadata?.address);
  }, [placesWithCoords]);

  async function handleFixMissingAddresses() {
    if (placesMissingAddress.length === 0) return;
    
    if (!confirm(`将为 ${placesMissingAddress.length} 个地点自动获取地址信息？\n注意：这可能需要一些时间（每秒处理 1 个以符合 API 限制）。`)) {
      return;
    }

    setFixingAddresses(true);
    setFixProgress({ current: 0, total: placesMissingAddress.length });

    try {
      for (let i = 0; i < placesMissingAddress.length; i++) {
        const place = placesMissingAddress[i];
        setFixProgress({ current: i + 1, total: placesMissingAddress.length });

        // 1. 调用 Nominatim API
        if (place.lat && place.lng) {
          const address = await reverseGeocode(place.lat, place.lng); 
          
          if (address) {
            // 2. 更新数据库
            await updatePlace(place.id, {
              metadata: {
                ...place.metadata,
                address: address, // 保存获取到的地址
                geocoded_at: new Date().toISOString()
              }
            });
          }
        }

        // 3. 延时防限流 (最后一次循环不需要延时)
        if (i < placesMissingAddress.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      alert('地址补全完成！');
      await loadData(); // 重新加载数据以更新 UI
    } catch (error) {
      console.error('Batch fix failed:', error);
      alert('处理过程中发生错误，部分地址可能未更新。');
    } finally {
      setFixingAddresses(false);
    }
  }

  function formatTimeRange(place: PlaceWithRelations): string {
    const events = place.events || [];
    if (events.length === 0) return '无时间记录';

    const dates = events.map((e) => e.created_at);
    const earliest = dates.reduce((a, b) => (a < b ? a : b));
    const latest = dates.reduce((a, b) => (a > b ? a : b));

    return `${new Date(earliest).toLocaleDateString('zh-CN')} - ${new Date(latest).toLocaleDateString('zh-CN')}`;
  }

  if (loading) {
    return (
      <main className="detroit-bg" style={{ minHeight: '100vh', padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <UnifiedNav />
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600">加载地图...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!projectId) {
    return (
      <main className="detroit-bg" style={{ minHeight: '100vh', padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <UnifiedNav />
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center max-w-md mx-auto p-8">
              <div className="text-6xl mb-4">🗺️</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">未找到项目</h2>
              <p className="text-gray-600 mb-6">请先创建或选择一个项目</p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    setLoading(true);
                    autoDetectProject();
                  }}
                  className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  🔄 自动加载项目
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="detroit-bg" style={{ minHeight: '100vh', padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <UnifiedNav />
        
        {/* Header Content */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                人生地图
              </h1>
              <p className="text-[#666666] mt-1">
                按地理位置查看人生足迹，共 {places.length} 个地点
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex gap-1 bg-[#E5E5E0] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'map'
                      ? 'bg-white text-[#2C2C2C] shadow-sm'
                      : 'text-[#666666] hover:text-[#2C2C2C]'
                  }`}
                >
                  🗺️ 地图
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'list'
                      ? 'bg-white text-[#2C2C2C] shadow-sm'
                      : 'text-[#666666] hover:text-[#2C2C2C]'
                  }`}
                >
                  📋 列表
                </button>
              </div>
              {/* Extract button */}
              <button
                onClick={extractPlaces}
                disabled={extracting}
                className="px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? '抽取中...' : '🤖 AI抽取地点'}
              </button>
            </div>
          </div>
          
        </div>

        {/* Map View */}
        {viewMode === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Map */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg overflow-hidden" style={{ height: '500px' }}>
                <PlacesMap
                  places={filteredPlaces}
                  onPlaceClick={handlePlaceClick}
                  selectedPlaceId={selectedPlace?.id}
                />
              </div>
              {/* Search Bar - Global Search (Nominatim) */}
              <div className="mt-4">
                 <PlaceSearch onSelect={handleSearchSelect} />
              </div>
              {placesWithCoords.length === 0 && places.length > 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
                  📍 提示：{places.length} 个地点尚未添加坐标，无法在地图上显示。使用AI抽取或手动编辑添加坐标。
                </div>
              )}

              {/* 新增：地址补全提示 */}
              {placesMissingAddress.length > 0 && (
                <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>📍 发现 {placesMissingAddress.length} 个地点有坐标但缺少地址信息。</span>
                  </div>
                  <button
                    onClick={handleFixMissingAddresses}
                    disabled={fixingAddresses}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 text-xs font-medium whitespace-nowrap"
                  >
                    {fixingAddresses 
                      ? `处理中 ${fixProgress.current}/${fixProgress.total}...` 
                      : '🌏 自动补全地址'
                    }
                  </button>
                </div>
              )}
            </div>

            {/* Side panel */}
            <div className="lg:col-span-1">
              {selectedPlace ? (
                <PlaceDetailPanel
                  place={selectedPlace}
                  onClose={() => setSelectedPlace(null)}
                  onPlaceClick={handlePlaceClick}
                  formatTimeRange={formatTimeRange}
                  onUpdate={handlePlaceUpdate}
                  onDelete={handlePlaceDelete}
                  onUpload={() => setIsUploadModalOpen(true)}
                />
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col" style={{ height: '500px' }}>
                  <h3 className="font-semibold text-gray-900 mb-4 flex-shrink-0">地点列表</h3>
                  <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                    {filteredPlaces.map((place) => (
                      <button
                        key={place.id}
                        onClick={() => handlePlaceClick(place.id)}
                        className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-green-500 hover:shadow-md transition-all bg-white mb-3 group"
                      >
                        {/* 第一行：名称 */}
                        <div className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-green-700 transition-colors">
                          {place.name}
                        </div>

                        {/* 第二行：城市 · 国家 */}
                        <div className="text-xs text-gray-500 mb-2 font-medium flex items-center gap-1">
                           <span className="uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded text-[10px] text-gray-600">
                            {(() => {
                              // 特殊层级直接显示
                              if (place.place_level === 'country') return '国家';
                              if (place.place_level === 'city') return '城市';
                              
                              // 尝试从地址中提取 "城市 · 国家"
                              if (place.metadata?.address) {
                                const parts = place.metadata.address.split(/[,，]/).map((s: string) => s.trim());
                                // 简单的过滤：取最后两段非邮编的文本
                                const validParts = parts.filter((p: string) => p && !/^\d+$/.test(p) && !/^\d+-\d+$/.test(p));
                                
                                if (validParts.length >= 2) {
                                  const country = validParts[validParts.length - 1];
                                  const city = validParts[validParts.length - 2];
                                  // 如果包含数字（可能是街道号），则尝试往前找
                                  if (/\d/.test(city) && validParts.length >= 3) {
                                     return `${validParts[validParts.length - 3]} · ${country}`;
                                  }
                                  return `${city} · ${country}`;
                                } else if (validParts.length === 1) {
                                  return validParts[0];
                                }
                              }
                              
                              // 如果有坐标但没有地址
                              if (place.lat && place.lng) {
                                // 暂时显示坐标，等待补全
                                return `${place.lat.toFixed(1)}°N, ${place.lng.toFixed(1)}°E (未获取地址)`;
                              }
                              
                              return '未知区域';
                            })()}
                          </span>
                          
                          {/* 如果地址很长，且未在标签中完全展示，可以在这里补充显示，或者隐藏以保持简洁 */}
                          {place.metadata?.address && (
                            <span className="truncate flex-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              {place.metadata.address}
                            </span>
                          )}
                        </div>

                        {/* 第三行：斜体描述 */}
                        {place.description ? (
                          <div className="text-sm text-gray-400 italic font-serif border-l-2 border-gray-100 pl-3 py-1 line-clamp-3">
                            {place.description}
                          </div>
                        ) : (
                           <div className="text-xs text-gray-300 italic pl-3">暂无描述</div>
                        )}
                      </button>
                    ))}
                    {filteredPlaces.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        {searchQuery ? '没有找到匹配的地点' : '暂无地点数据'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

                const filtered = levelPlaces.filter(
                  p =>
                    !searchQuery.trim() ||
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
                );

                if (filtered.length === 0) return null;

                return (
                  <div key={level} className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">{levelNames[level]}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filtered.map((place) => (
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
                  <p className="text-gray-400 text-sm mt-2">点击"AI抽取地点"从回答中提取地点信息</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              {selectedPlace ? (
                <PlaceDetailPanel
                  place={selectedPlace}
                  onClose={() => setSelectedPlace(null)}
                  onPlaceClick={handlePlaceClick}
                  formatTimeRange={formatTimeRange}
                  onUpdate={handlePlaceUpdate}
                  onDelete={handlePlaceDelete}
                  onUpload={() => setIsUploadModalOpen(true)}
                />
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
        )}
      </div>

      {isUploadModalOpen && selectedPlace && projectId && (
        <PlaceUploadModal
          place={selectedPlace}
          projectId={projectId}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={() => {
             // Refresh data after upload
             handlePlaceClick(selectedPlace.id);
             loadData();
          }}
        />
      )}
    </main>
  );
}

// Place detail panel component
function PlaceDetailPanel({
  place,
  onClose,
  onPlaceClick,
  formatTimeRange,
  onUpdate,
  onDelete,
  onUpload
}: {
  place: PlaceWithRelations;
  onClose: () => void;
  onPlaceClick: (id: string) => void;
  formatTimeRange: (place: PlaceWithRelations) => string;
  onUpdate: (updates: Partial<Place>) => void;
  onDelete: () => void;
  onUpload: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(place.name);
  const [editDesc, setEditDesc] = useState(place.description || '');

  const handleSave = () => {
    onUpdate({
      name: editName,
      description: editDesc,
    });
    setIsEditing(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
      <div className="flex justify-between items-start mb-4">
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 返回列表
        </button>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
               <button
                onClick={() => setIsEditing(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                ✏️ 编辑
              </button>
              <button
                onClick={onDelete}
                className="text-sm text-red-600 hover:text-red-800"
              >
                🗑️ 删除
              </button>
              <button
                onClick={onUpload}
                className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                📷 上传照片
              </button>
            </>
          ) : (
             <div className="flex gap-2">
               <button
                onClick={() => setIsEditing(false)}
                className="text-sm text-gray-500"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                保存
              </button>
             </div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="mb-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">名称</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full border border-gray-300 rounded p-2"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">描述</label>
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 h-24"
            />
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{place.name}</h2>
          {place.description && (
            <div className="mb-6">
              <p className="text-gray-600">{place.description}</p>
            </div>
          )}
        </>
      )}

      {place.photos && place.photos.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📸 照片 ({place.photos.length})</h3>
          <div className="grid grid-cols-2 gap-2">
            {place.photos.slice(0, 4).map((photo, idx) => (
              <div key={idx} className="aspect-square rounded-lg overflow-hidden relative group">
                <img src={photo} alt={`${place.name} ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          {place.photos.length > 4 && (
             <p className="text-xs text-gray-400 mt-1">还有 {place.photos.length - 4} 张...</p>
          )}
        </div>
      )}

      {place.lat && place.lng && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📍 坐标</h3>
          <p className="text-gray-600 font-mono text-sm">
            {place.lat.toFixed(6)}, {place.lng.toFixed(6)}
          </p>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">⏰ 时间范围</h3>
        <p className="text-gray-600">{formatTimeRange(place)}</p>
      </div>

      {place.childPlaces && place.childPlaces.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📍 子地点 ({place.childPlaces.length})</h3>
          <div className="space-y-2">
            {place.childPlaces.map((child) => (
              <button
                key={child.id}
                onClick={() => onPlaceClick(child.id)}
                className="w-full text-left px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-sm"
              >
                {child.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {place.events && place.events.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📅 相关事件 ({place.events.length})</h3>
          <div className="space-y-2">
            {place.events.map((event) => (
              <div key={event.id} className="p-3 bg-amber-50 rounded-lg">
                <p className="font-medium text-gray-900">{event.title}</p>
                {event.summary && <p className="text-sm text-gray-600 mt-1">{event.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {place.people && place.people.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">👥 相关人物 ({place.people.length})</h3>
          <div className="flex flex-wrap gap-2">
            {place.people.map((person) => (
              <span key={person.id} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                {person.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
