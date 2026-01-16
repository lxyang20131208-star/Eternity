'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPerson, createPlace, createEvent, createTimeRef, createMemory } from '@/lib/knowledgeGraphApi';
import type { ExtractedPerson, ExtractedPlace, ExtractedTime, ExtractedEvent, ExtractionResult } from '@/lib/types/knowledge-graph';

export default function ExtractReviewPage() {
  const router = useRouter();
  const [sourceText, setSourceText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [saving, setSaving] = useState(false);
  
  // 选中状态
  const [selectedPeople, setSelectedPeople] = useState<Set<number>>(new Set());
  const [selectedPlaces, setSelectedPlaces] = useState<Set<number>>(new Set());
  const [selectedEvents, setSelectedEvents] = useState<Set<number>>(new Set());

  const projectId = typeof window !== 'undefined' ? localStorage.getItem('currentProjectId') || '' : '';

  async function handleExtract() {
    if (!sourceText.trim()) {
      alert('请输入要分析的文本');
      return;
    }

    try {
      setExtracting(true);
      const response = await fetch('/api/ai/extract-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sourceText, projectId }),
      });

      if (!response.ok) {
        throw new Error('抽取失败');
      }

      const result = await response.json();
      setExtractionResult(result.data);
      
      // 默认全选置信度 > 0.7 的结果
      setSelectedPeople(new Set(result.data.people.map((_: any, i: number) => i).filter((i: number) => result.data.people[i].confidence > 0.7)));
      setSelectedPlaces(new Set(result.data.places.map((_: any, i: number) => i).filter((i: number) => result.data.places[i].confidence > 0.7)));
      setSelectedEvents(new Set(result.data.events.map((_: any, i: number) => i).filter((i: number) => result.data.events[i].confidence > 0.7)));
    } catch (error) {
      console.error('抽取失败:', error);
      alert('抽取失败，请重试');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSaveAll() {
    if (!extractionResult) return;

    try {
      setSaving(true);

      // 保存人物
      const savedPeople = new Map<string, string>();
      for (const idx of selectedPeople) {
        const person = extractionResult.people[idx];
        const created = await createPerson({
          project_id: projectId,
          name: person.name,
          aliases: person.aliases,
          role: person.role,
          importance_score: Math.round(person.frequency * 10),
          created_from: 'AI抽取',
          metadata: { confidence: person.confidence, evidence: person.evidence },
        });
        savedPeople.set(person.name, created.id);
      }

      // 保存地点
      const savedPlaces = new Map<string, string>();
      for (const idx of selectedPlaces) {
        const place = extractionResult.places[idx];
        const created = await createPlace({
          project_id: projectId,
          name: place.name,
          place_level: place.placeLevel as any,
          metadata: { confidence: place.confidence, evidence: place.evidence },
        });
        savedPlaces.set(place.name, created.id);
      }

      // 保存时间引用
      const savedTimes = new Map<string, string>();
      for (const time of extractionResult.times) {
        const created = await createTimeRef({
          project_id: projectId,
          type: time.type,
          text: time.text,
          start_date: time.startDate,
          end_date: time.endDate,
          confidence: time.confidence,
          metadata: { evidence: time.evidence },
        });
        savedTimes.set(time.text, created.id);
      }

      // 保存事件
      for (const idx of selectedEvents) {
        const event = extractionResult.events[idx];
        const peopleIds = event.people.map((name) => savedPeople.get(name)).filter((id): id is string => id !== undefined);
        const placeIds = event.places.map((name) => savedPlaces.get(name)).filter((id): id is string => id !== undefined);
        const timeRefId = event.time ? savedTimes.get(event.time.text) : undefined;

        await createEvent(
          {
            project_id: projectId,
            title: event.title,
            summary: event.summary,
            time_ref_id: timeRefId,
            tags: event.tags,
            evidence: event.evidence,
            importance_score: Math.round(event.confidence * 10),
            verified: false,
            metadata: { confidence: event.confidence },
          },
          peopleIds,
          placeIds
        );
      }

      alert(`成功保存！\n人物：${selectedPeople.size}\n地点：${selectedPlaces.size}\n事件：${selectedEvents.size}`);
      router.push('/family');
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function toggleSelection(set: Set<number>, setFn: (s: Set<number>) => void, idx: number) {
    const newSet = new Set(set);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setFn(newSet);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 页头 */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🤖 AI 抽取 & 审核</h1>
          <p className="text-gray-600">让 AI 帮你从对话或文本中自动提取人物、地点、时间和事件</p>
        </div>

        {/* 输入区 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <label className="block text-lg font-semibold text-gray-900 mb-3">📝 输入文本</label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
            rows={10}
            placeholder="粘贴对话记录或传记文本..."
          />
          <button
            onClick={handleExtract}
            disabled={extracting || !sourceText.trim()}
            className="mt-4 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {extracting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>AI 分析中...</span>
              </>
            ) : (
              <>
                <span>✨</span>
                <span>开始 AI 抽取</span>
              </>
            )}
          </button>
        </div>

        {/* 抽取结果 */}
        {extractionResult && (
          <div className="space-y-8">
            {/* 人物 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">👤 人物 ({extractionResult.people.length})</h2>
                <span className="text-sm text-gray-600">已选择 {selectedPeople.size} 个</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extractionResult.people.map((person, idx) => (
                  <label
                    key={idx}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedPeople.has(idx) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPeople.has(idx)}
                        onChange={() => toggleSelection(selectedPeople, setSelectedPeople, idx)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{person.name}</span>
                          {person.role && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">{person.role}</span>}
                          <span className={`px-2 py-0.5 text-xs rounded ${person.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {Math.round(person.confidence * 100)}%
                          </span>
                        </div>
                        {person.aliases.length > 0 && <p className="text-sm text-gray-600 mb-2">别名：{person.aliases.join('、')}</p>}
                        <p className="text-xs text-gray-500">提及 {person.frequency} 次</p>
                        {person.evidence.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-indigo-600 cursor-pointer">查看证据</summary>
                            <div className="mt-2 space-y-1">
                              {person.evidence.slice(0, 2).map((ev, i) => (
                                <p key={i} className="text-xs text-gray-600 italic border-l-2 border-indigo-300 pl-2">
                                  &ldquo;{ev.text}&rdquo;
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 地点 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">📍 地点 ({extractionResult.places.length})</h2>
                <span className="text-sm text-gray-600">已选择 {selectedPlaces.size} 个</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {extractionResult.places.map((place, idx) => (
                  <label
                    key={idx}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedPlaces.has(idx) ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPlaces.has(idx)}
                        onChange={() => toggleSelection(selectedPlaces, setSelectedPlaces, idx)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{place.name}</span>
                          {place.placeLevel && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">{place.placeLevel}</span>}
                          <span className={`px-2 py-0.5 text-xs rounded ${place.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {Math.round(place.confidence * 100)}%
                          </span>
                        </div>
                        {place.parentPlace && <p className="text-sm text-gray-600">上级：{place.parentPlace}</p>}
                        <p className="text-xs text-gray-500">提及 {place.frequency} 次</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 事件 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">📅 事件 ({extractionResult.events.length})</h2>
                <span className="text-sm text-gray-600">已选择 {selectedEvents.size} 个</span>
              </div>
              <div className="space-y-4">
                {extractionResult.events.map((event, idx) => (
                  <label
                    key={idx}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedEvents.has(idx) ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedEvents.has(idx)}
                        onChange={() => toggleSelection(selectedEvents, setSelectedEvents, idx)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-gray-900 text-lg">{event.title}</span>
                          <span className={`px-2 py-0.5 text-xs rounded ${event.confidence > 0.8 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {Math.round(event.confidence * 100)}%
                          </span>
                        </div>
                        {event.summary && <p className="text-gray-700 mb-2">{event.summary}</p>}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {event.people.map((p) => (
                            <span key={p} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                              👤 {p}
                            </span>
                          ))}
                          {event.places.map((p) => (
                            <span key={p} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                              📍 {p}
                            </span>
                          ))}
                          {event.time && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">⏰ {event.time.text}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {event.tags.map((tag) => (
                            <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                              🏷️ {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 保存按钮 */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-700">
                    即将保存：
                    <strong className="text-blue-600"> {selectedPeople.size} 人物</strong>、
                    <strong className="text-green-600"> {selectedPlaces.size} 地点</strong>、
                    <strong className="text-amber-600"> {selectedEvents.size} 事件</strong>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">保存后可在人物页、时间轴、地图中查看和编辑</p>
                </div>
                <button
                  onClick={handleSaveAll}
                  disabled={saving || (selectedPeople.size === 0 && selectedPlaces.size === 0 && selectedEvents.size === 0)}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>保存到知识图谱</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
