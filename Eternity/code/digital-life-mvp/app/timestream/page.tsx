'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import UnifiedNav from '../components/UnifiedNav'
import './timestream.css'

interface TimelineEntry {
  id: string
  date: Date | null
  year: number | null
  month: number | null
  dateDisplay: string
  event: string
  quote?: string
  confidence?: number
  status?: string
  isEditing?: boolean
}

export default function TimestreamPage() {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [extracting, setExtracting] = useState(false)
  const [merging, setMerging] = useState(false)
  const [projectId, setProjectId] = useState<string>('')
  const [newEvent, setNewEvent] = useState('')
  const [newYear, setNewYear] = useState('')
  const [newMonth, setNewMonth] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedProjectId = localStorage.getItem('currentProjectId')
      if (storedProjectId) setProjectId(storedProjectId)
    }
  }, [])

  useEffect(() => {
    if (projectId) loadTimelineFacts()
  }, [projectId])

  async function loadTimelineFacts() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('timeline_fact_extracts')
        .select('id, summary, quote, inferred_time_start, inferred_time_end, time_precision, confidence, status, created_at')
        .eq('project_id', projectId)
        .order('inferred_time_start', { ascending: true })

      if (error) {
        console.warn('加载时间轴数据失败:', error)
        setEntries([])
        return
      }

      const mappedEntries: TimelineEntry[] = (data || []).map(fact => {
        const date = fact.inferred_time_start ? new Date(fact.inferred_time_start) : null
        return {
          id: fact.id,
          date,
          year: date ? date.getFullYear() : null,
          month: date ? date.getMonth() + 1 : null,
          dateDisplay: formatDateDisplay(fact.inferred_time_start, fact.time_precision),
          event: fact.summary || fact.quote || '未知事件',
          quote: fact.quote,
          confidence: fact.confidence,
          status: fact.status,
          isEditing: false
        }
      })

      setEntries(mappedEntries)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  function formatDateDisplay(dateStr: string | null, precision: string | null): string {
    if (!dateStr) return '时间未知'
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    switch (precision) {
      case 'year': return `${year}年`
      case 'month': return `${year}年${month}月`
      default: return `${year}年${month}月`
    }
  }

  async function extractTimeline() {
    if (!projectId || extracting) return
    try {
      setExtracting(true)
      const { data, error } = await supabase.functions.invoke('extract_timeline_facts', {
        body: { projectId },
      })
      if (error) throw error
      alert(`成功抽取 ${data.extracted} 个时间轴事实，插入 ${data.inserted} 条记录`)
      await loadTimelineFacts()
    } catch (error: any) {
      console.error('时间轴抽取失败:', error)
      alert('时间轴抽取失败: ' + (error.message || '未知错误'))
    } finally {
      setExtracting(false)
    }
  }

  async function mergeSimilar() {
    if (!projectId || merging || entries.length < 2) return
    try {
      setMerging(true)
      const { data, error } = await supabase.functions.invoke('merge_timeline_facts', {
        body: { projectId },
      })
      if (error) throw error
      alert(`成功合并 ${data.merged || 0} 组事件，删除 ${data.deleted || 0} 条重复记录`)
      await loadTimelineFacts()
    } catch (error: any) {
      console.error('合并失败:', error)
      alert('合并失败: ' + (error.message || '未知错误'))
    } finally {
      setMerging(false)
    }
  }

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (!a.year && !b.year) return 0
      if (!a.year) return 1
      if (!b.year) return -1
      if (a.year !== b.year) return a.year - b.year
      if (!a.month && !b.month) return 0
      if (!a.month) return -1
      if (!b.month) return 1
      return a.month - b.month
    })
  }, [entries])

  const startEditing = (id: string) => {
    setEntries(entries.map(e => ({ ...e, isEditing: e.id === id })))
  }

  const cancelEditing = () => {
    loadTimelineFacts()
  }

  const updateEntryField = (id: string, field: 'year' | 'month' | 'event', value: string | number | null) => {
    setEntries(entries.map(e => {
      if (e.id !== id) return e
      const updated = { ...e }
      if (field === 'year') {
        updated.year = value ? Number(value) : null
        updated.dateDisplay = updated.year
          ? (updated.month ? `${updated.year}年${updated.month}月` : `${updated.year}年`)
          : '时间未知'
      } else if (field === 'month') {
        updated.month = value ? Number(value) : null
        updated.dateDisplay = updated.year
          ? (updated.month ? `${updated.year}年${updated.month}月` : `${updated.year}年`)
          : '时间未知'
      } else if (field === 'event') {
        updated.event = value as string
      }
      return updated
    }))
  }

  const saveEntry = async (id: string) => {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    try {
      let newDate: string | null = null
      if (entry.year) {
        const month = entry.month || 1
        newDate = `${entry.year}-${String(month).padStart(2, '0')}-01`
      }
      const { error } = await supabase
        .from('timeline_fact_extracts')
        .update({
          summary: entry.event,
          inferred_time_start: newDate,
          time_precision: entry.month ? 'month' : 'year',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      if (error) throw error
      setEntries(entries.map(e => e.id === id ? { ...e, isEditing: false } : e))
    } catch (error: any) {
      console.error('保存失败:', error)
      alert('保存失败: ' + (error.message || '未知错误'))
    }
  }

  const deleteEntry = async (id: string) => {
    if (!confirm('确定要删除这个事件吗？')) return
    try {
      const { error } = await supabase
        .from('timeline_fact_extracts')
        .delete()
        .eq('id', id)
      if (error) throw error
      setEntries(entries.filter(e => e.id !== id))
    } catch (error: any) {
      console.error('删除失败:', error)
      alert('删除失败: ' + (error.message || '未知错误'))
    }
  }

  const addEntry = async () => {
    if (!newEvent.trim() || !newYear) return
    try {
      const year = parseInt(newYear)
      const month = newMonth ? parseInt(newMonth) : null
      const dateStr = `${year}-${String(month || 1).padStart(2, '0')}-01`
      const { data, error } = await supabase
        .from('timeline_fact_extracts')
        .insert({
          project_id: projectId,
          summary: newEvent.trim(),
          quote: newEvent.trim(),
          inferred_time_start: dateStr,
          time_precision: month ? 'month' : 'year',
          confidence: 1.0,
          status: 'manual'
        })
        .select()
        .single()
      if (error) throw error
      setEntries([...entries, {
        id: data.id,
        date: new Date(dateStr),
        year,
        month,
        dateDisplay: month ? `${year}年${month}月` : `${year}年`,
        event: newEvent.trim(),
        status: 'manual',
        isEditing: false
      }])
      setNewEvent('')
      setNewYear('')
      setNewMonth('')
      setShowAddForm(false)
    } catch (error: any) {
      console.error('添加失败:', error)
      alert('添加失败: ' + (error.message || '未知错误'))
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]"
         style={{ padding: '24px 16px', fontFamily: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <UnifiedNav />
        <div className="max-w-7xl mx-auto px-4 py-6">

          {/* Header bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">人生纪年</h1>
              <p className="text-[#666666] mt-1">
                按时间顺序记录人生重要事件，共 {entries.length} 个事件
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-2.5 bg-white border border-[#D5D0C8] text-[#2C2C2C] rounded-xl text-sm font-medium hover:bg-[#F0EDE8] transition-all duration-200"
              >
                + 手动添加
              </button>
              <button
                onClick={mergeSimilar}
                disabled={merging || entries.length < 2}
                className="px-4 py-2.5 bg-white border border-[#D5D0C8] text-[#2C2C2C] rounded-xl text-sm font-medium hover:bg-[#F0EDE8] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {merging ? '合并中...' : 'AI 合并相似'}
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 bg-white border border-[#D5D0C8] text-[#2C2C2C] rounded-xl text-sm font-medium hover:bg-[#F0EDE8] transition-all duration-200"
              >
                打印 / PDF
              </button>
              <button
                onClick={extractTimeline}
                disabled={extracting}
                className="px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {extracting ? '抽取中...' : '🤖 AI抽取事件'}
              </button>
            </div>
          </div>

          {/* Add form */}
          {showAddForm && (
            <div className="mt-4 p-5 bg-white rounded-xl border border-[#E5E0D8] no-print">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="年份"
                  className="w-24 px-3 py-2 border border-[#D5D0C8] rounded-lg text-sm outline-none focus:border-[#999]"
                  min="1900" max="2100"
                />
                <input
                  type="number"
                  value={newMonth}
                  onChange={(e) => setNewMonth(e.target.value)}
                  placeholder="月(可选)"
                  className="w-24 px-3 py-2 border border-[#D5D0C8] rounded-lg text-sm outline-none focus:border-[#999]"
                  min="1" max="12"
                />
                <input
                  type="text"
                  value={newEvent}
                  onChange={(e) => setNewEvent(e.target.value)}
                  placeholder="事件描述"
                  className="flex-1 min-w-[200px] px-3 py-2 border border-[#D5D0C8] rounded-lg text-sm outline-none focus:border-[#999]"
                  maxLength={200}
                />
                <button
                  onClick={addEntry}
                  disabled={!newEvent.trim() || !newYear}
                  className="px-5 py-2 bg-[#2C2C2C] text-white rounded-lg text-sm font-medium hover:bg-[#404040] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  添加
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-[#666] text-sm hover:text-[#333]"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="h-6"></div>

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2C2C2C] mx-auto mb-3"></div>
                <p className="text-[#666]">加载时间轴...</p>
              </div>
            </div>
          ) : (

          /* Book page */
          <div className="book-page">
            <div className="page-header">
              <h1 className="page-title">人生纪年</h1>
              <div className="page-subtitle">Life Chronicle</div>
            </div>

            <div className="timeline-container">
              <div className="timeline-line" />

              {sortedEntries.length === 0 ? (
                <div className="empty-state">
                  <p>暂无时间轴数据</p>
                  <p className="hint">点击「AI 抽取事件」从您的回答中提取人生事件</p>
                </div>
              ) : (
                sortedEntries.map((entry) => (
                  <div key={entry.id} className={`timeline-entry ${entry.isEditing ? 'editing' : ''}`}>
                    <div className="timeline-dot" />

                    {entry.isEditing ? (
                      <div className="entry-content entry-editing no-print">
                        <div className="edit-fields">
                          <input
                            type="number"
                            value={entry.year || ''}
                            onChange={(e) => updateEntryField(entry.id, 'year', e.target.value)}
                            placeholder="年"
                            className="edit-year"
                            min="1900" max="2100"
                          />
                          <span className="edit-label">年</span>
                          <input
                            type="number"
                            value={entry.month || ''}
                            onChange={(e) => updateEntryField(entry.id, 'month', e.target.value)}
                            placeholder="月"
                            className="edit-month"
                            min="1" max="12"
                          />
                          <span className="edit-label">月</span>
                          <span className="entry-separator">|</span>
                          <input
                            type="text"
                            value={entry.event}
                            onChange={(e) => updateEntryField(entry.id, 'event', e.target.value)}
                            className="edit-event"
                            maxLength={200}
                          />
                        </div>
                        <div className="edit-actions">
                          <button onClick={() => saveEntry(entry.id)} className="save-btn">保存</button>
                          <button onClick={cancelEditing} className="cancel-btn">取消</button>
                        </div>
                      </div>
                    ) : (
                      <div className="entry-content">
                        <span className="entry-date">{entry.dateDisplay}</span>
                        <span className="entry-separator">|</span>
                        <span className="entry-event">{entry.event}</span>
                        <div className="entry-actions no-print">
                          <button onClick={() => startEditing(entry.id)} className="act-btn" title="编辑">✎</button>
                          <button onClick={() => deleteEntry(entry.id)} className="act-btn del" title="删除">×</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="page-footer">
              <div className="page-number">共 {sortedEntries.length} 个事件</div>
            </div>
          </div>

          )}
        </div>
      </div>
    </div>
  )
}
