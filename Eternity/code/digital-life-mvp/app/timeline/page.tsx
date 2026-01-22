'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { getEvents, getPeople, getPlaces } from '@/lib/knowledgeGraphApi';
import type { EventWithRelations, Person, Place } from '@/lib/types/knowledge-graph';
import { supabase } from '@/lib/supabaseClient';
import UnifiedNav from '../components/UnifiedNav';

// Dynamic import for vis-timeline (SSR disabled)
const VisTimeline = dynamic(() => import('@/components/VisTimeline'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] rounded-xl bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-500">加载时间轴组件...</p>
      </div>
    </div>
  ),
});

export default function TimelinePage() {
  const [events, setEvents] = useState<EventWithRelations[]>([]);
  const [factEvents, setFactEvents] = useState<EventWithRelations[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');
  const [extracting, setExtracting] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Filter states
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showUnverified, setShowUnverified] = useState(true);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

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
      loadData();
    }
  }, [projectId]);

  async function loadData() {
    if (!projectId) return;

    try {
      setLoading(true);
      const [eventsData, peopleData, placesData, factsData] = await Promise.all([
        getEvents(projectId),
        getPeople(projectId),
        getPlaces(projectId),
        loadTimelineFacts(projectId),
      ]);
      setEvents(eventsData);
      setPeople(peopleData);
      setPlaces(placesData);
      setFactEvents(factsData.map((fact) => mapFactToEvent(fact, projectId)));
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }

  async function extractTimeline() {
    if (!projectId || extracting) return;

    try {
      setExtracting(true);
      const { data, error } = await supabase.functions.invoke('extract_timeline_facts', {
        body: { projectId },
      });

      if (error) throw error;

      alert(`成功抽取 ${data.extracted} 个时间轴事实，插入 ${data.inserted} 条记录`);
      await loadData();
    } catch (error: any) {
      console.error('时间轴抽取失败:', error);
      alert('时间轴抽取失败: ' + (error.message || '未知错误'));
    } finally {
      setExtracting(false);
    }
  }

  async function loadTimelineFacts(activeProjectId: string) {
    const { data, error } = await supabase
      .from('timeline_fact_extracts')
      .select('id, summary, quote, inferred_time_start, inferred_time_end, time_precision, confidence, status, created_at, updated_at')
      .eq('project_id', activeProjectId)
      .order('inferred_time_start', { ascending: true });

    if (error) {
      console.warn('加载时间轴抽取失败:', error);
      return [];
    }

    return data || [];
  }

  function mapFactToEvent(
    fact: {
      id: string;
      summary: string | null;
      quote: string;
      inferred_time_start: string | null;
      inferred_time_end: string | null;
      time_precision: string | null;
      confidence: number | null;
      status: string | null;
      created_at: string;
      updated_at: string;
    },
    activeProjectId: string
  ): EventWithRelations & { time_ref?: any } {
    const start = fact.inferred_time_start || undefined;
    const end = fact.inferred_time_end || undefined;
    const type = end ? 'range' : start ? 'exact' : 'fuzzy';

    return {
      id: fact.id,
      project_id: activeProjectId,
      title: fact.summary || '未命名时间轴事件',
      summary: fact.summary || fact.quote,
      time_ref_id: undefined,
      tags: [],
      evidence: [
        {
          text: fact.quote,
          source: 'timeline_fact_extracts',
          confidence: fact.confidence ?? undefined,
        },
      ],
      importance_score: 0,
      verified: false,
      metadata: { source: 'timeline_fact_extracts', status: fact.status || 'inferred' },
      created_at: fact.created_at,
      updated_at: fact.updated_at,
      people: [],
      places: [],
      time_ref: {
        type,
        start_date: start,
        end_date: end,
        text: fact.summary || fact.quote,
        confidence: fact.confidence ?? 0.5,
      },
    };
  }

  const allEvents = useMemo(() => {
    return [...events, ...factEvents];
  }, [events, factEvents]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
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
  }, [allEvents, showUnverified, selectedPeople, selectedPlaces, selectedTags]);

  // Convert events to timeline format
  const timelineEvents = useMemo(() => {
    return filteredEvents.map((event) => {
      const timeRef = resolveTimeRef(event);
      const startDate = timeRef?.start_date ? new Date(timeRef.start_date) : new Date();
      const endDate = timeRef?.end_date ? new Date(timeRef.end_date) : undefined;

      return {
        id: event.id,
        content: event.title || '无标题事件',
        start: startDate,
        end: endDate,
        type: endDate ? ('range' as const) : ('box' as const),
        className: event.verified ? 'verified' : 'unverified',
      };
    });
  }, [filteredEvents]);

  const allTags = Array.from(new Set(allEvents.flatMap((e) => e.tags)));

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

  function resolveTimeRef(event: any) {
    return event.time_ref || event.timeRef;
  }

  const selectedEvent = useMemo(() => {
    return allEvents.find(e => e.id === selectedEventId);
  }, [allEvents, selectedEventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"
           style={{ fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2C2C2C] mx-auto mb-4"></div>
          <p className="text-[#666666]">加载时间轴...</p>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"
           style={{ fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
        <UnifiedNav />
        <div className="text-center max-w-md mx-auto p-8 pt-28">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-bold text-[#2C2C2C] mb-2">未找到项目</h2>
          <p className="text-[#666666] mb-6">请先创建或选择一个项目</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]"
         style={{ padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <UnifiedNav />
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                生命时间轴
              </h1>
              <p className="text-[#666666] mt-1">
                按时间顺序查看人生重要事件，共 {allEvents.length} 个事件
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex gap-1 bg-[#E5E5E0] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'timeline'
                      ? 'bg-white text-[#2C2C2C] shadow-sm'
                      : 'text-[#666666] hover:text-[#2C2C2C]'
                  }`}
                >
                  📊 时间轴
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
                onClick={extractTimeline}
                disabled={extracting}
                className="px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extracting ? '抽取中...' : '🤖 AI抽取事件'}
              </button>
            </div>
          </div>
          
          <div className="h-6"></div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* People filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">👤 人物</label>
                <select
                  multiple
                  value={selectedPeople}
                  onChange={(e) => setSelectedPeople(Array.from(e.target.selectedOptions, option => option.value))}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm max-h-24"
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Places filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">📍 地点</label>
                <select
                  multiple
                  value={selectedPlaces}
                  onChange={(e) => setSelectedPlaces(Array.from(e.target.selectedOptions, option => option.value))}
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm max-h-24"
                >
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags filter */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">🏷️ 标签</label>
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        setSelectedTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                      }}
                      className={`px-2 py-1 text-xs rounded-full transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-amber-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">⚙️ 选项</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showUnverified}
                    onChange={(e) => setShowUnverified(e.target.checked)}
                    className="rounded"
                  />
                  显示未验证事件
                </label>
                <button
                  onClick={() => {
                    setSelectedPeople([]);
                    setSelectedPlaces([]);
                    setSelectedTags([]);
                  }}
                  className="mt-2 text-xs text-amber-600 hover:text-amber-700"
                >
                  清除筛选
                </button>
              </div>
            </div>
          </div>
          <div className="hidden lg:block" />
        </div>

        {/* Timeline View */}
        {viewMode === 'timeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
            {/* Timeline */}
            <div>
              <div className="bg-white rounded-xl shadow-lg p-6 h-[660px]">
                <VisTimeline
                  events={timelineEvents}
                  onEventClick={setSelectedEventId}
                  selectedEventId={selectedEventId || undefined}
                />
              </div>
            </div>

            {/* Side panel */}
            <div>
              {selectedEvent ? (
                <EventDetailPanel
                  event={selectedEvent}
                  onClose={() => setSelectedEventId(null)}
                  formatDate={formatDate}
                />
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">事件列表</h3>
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {filteredEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEventId(event.id)}
                        className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-amber-500 hover:bg-amber-50 transition-all"
                      >
                    <div className="font-medium text-gray-900">{event.title || '无标题'}</div>
                        <div className="text-xs text-gray-500 mt-1">{formatDate(resolveTimeRef(event))}</div>
                      </button>
                    ))}
                    {filteredEvents.length === 0 && (
                      <div className="text-center text-gray-500 py-8">暂无事件数据</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg divide-y divide-gray-200">
                {filteredEvents.map((event) => (
                  <div key={event.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">{event.title || '无标题事件'}</h3>
                          {!event.verified && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">未验证</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mb-3">{formatDate(resolveTimeRef(event))}</p>
                        {event.summary && <p className="text-gray-700 mb-3">{event.summary}</p>}

                        {/* Tags */}
                        {event.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {event.tags.map((tag) => (
                              <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* People & Places */}
                        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                          {event.people && event.people.length > 0 && (
                            <div>
                              👤 {event.people.map(p => p.name).join(', ')}
                            </div>
                          )}
                          {event.places && event.places.length > 0 && (
                            <div>
                              📍 {event.places.map(p => p.name).join(', ')}
                            </div>
                          )}
                        </div>

                        {/* Evidence */}
                        {event.evidence && event.evidence.length > 0 && (
                          <div className="mt-3">
                            <button
                              onClick={() => toggleEvidence(event.id)}
                              className="text-sm text-amber-600 hover:text-amber-700"
                            >
                              {expandedEvents.has(event.id) ? '隐藏证据' : `查看证据 (${event.evidence.length})`}
                            </button>
                            {expandedEvents.has(event.id) && (
                              <div className="mt-2 pl-4 border-l-2 border-amber-200 space-y-2">
                                {event.evidence.map((ev, idx) => (
                                  <div key={idx} className="text-sm text-gray-600">
                                    <span className="text-gray-400">"{ev.text}"</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {filteredEvents.length === 0 && (
                  <div className="p-12 text-center text-gray-500">
                    <p className="text-lg">暂无事件数据</p>
                    <p className="text-sm mt-2">点击"AI抽取事件"从回答中提取时间轴事件</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-1">
              {selectedEvent ? (
                <EventDetailPanel
                  event={selectedEvent}
                  onClose={() => setSelectedEventId(null)}
                  formatDate={formatDate}
                />
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
                  <div className="text-center text-gray-500">
                    <p className="mb-2">👈</p>
                    <p>点击事件查看详情</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// Event detail panel
function EventDetailPanel({
  event,
  onClose,
  formatDate,
}: {
  event: EventWithRelations;
  onClose: () => void;
  formatDate: (timeRef: any) => string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 sticky top-8">
      <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 mb-4">
        ← 返回
      </button>

      <h2 className="text-xl font-bold text-gray-900 mb-3">{event.title || '无标题事件'}</h2>

      {!event.verified && (
        <div className="mb-3">
          <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm rounded-full">未验证</span>
        </div>
      )}

      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-700 mb-1">⏰ 时间</div>
        <p className="text-gray-600">{formatDate((event as any).time_ref || (event as any).timeRef)}</p>
      </div>

      {event.summary && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-1">📝 描述</div>
          <p className="text-gray-600">{event.summary}</p>
        </div>
      )}

      {event.tags.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">🏷️ 标签</div>
          <div className="flex flex-wrap gap-2">
            {event.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.people && event.people.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">👤 相关人物</div>
          <div className="flex flex-wrap gap-2">
            {event.people.map((person) => (
              <span key={person.id} className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                {person.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {event.places && event.places.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">📍 相关地点</div>
          <div className="space-y-1">
            {event.places.map((place) => (
              <div key={place.id} className="text-gray-600 text-sm">
                {place.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {event.evidence && event.evidence.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">📄 证据 ({event.evidence.length})</div>
          <div className="space-y-2">
            {event.evidence.map((ev, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                "{ev.text}"
                {ev.confidence && (
                  <div className="text-xs text-gray-400 mt-1">
                    置信度: {(ev.confidence * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
