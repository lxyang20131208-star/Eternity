"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import {
  triggerContentAnalysis,
  getLatestRound,
  getRound2Progress,
  checkFirstRoundReadiness,
  type QuestionRound,
} from '../../lib/round2Api'

// Constants to shape the MVP behavior
const CHAPTER_ORDER = [
  '1. 童年与原生家庭',
  '2. 小学到初中',
  '3. 高中到大学',
  '4. 进入社会与早期独立',
  '5. 成家责任与关键变化',
  '6. 价值观模式与整合',
]
const MAX_VISIBLE_AVAILABLE = 5 // 每章默认展示的"今天可做"节点数
const UNLOCK_WINDOW = 5 // 每章同时最多可做节点数（滚动窗口）
const NEXT_CHAPTER_THRESHOLD = 5 // 解锁下一章节需要完成的节点数

// Feature unlock threshold for Second Round Questions
const SECOND_ROUND_UNLOCK_THRESHOLD = 70

// Basic types for the view model
type Question = {
  id: string
  text: string
  chapter: string
  order: number
}

type NodeStatus = 'locked' | 'available' | 'completed'

type PathNodeView = {
  question: Question
  status: NodeStatus
  isToday: boolean
}

type ChapterView = {
  name: string
  total: number
  completed: number
  unlocked: boolean
  nodes: PathNodeView[]
  visibleNodes: PathNodeView[]
  hiddenCount: number
  today: PathNodeView[]
}

// Mock fallback so页面可直接体验
const MOCK_QUESTIONS: Question[] = [
  { id: 'm1', text: '童年最深刻的记忆', chapter: '1. 童年与原生家庭', order: 1 },
  { id: 'm2', text: '父母对你的影响', chapter: '1. 童年与原生家庭', order: 2 },
  { id: 'm3', text: '小学印象最深的老师', chapter: '2. 小学到初中', order: 1 },
  { id: 'm4', text: '初中的好朋友', chapter: '2. 小学到初中', order: 2 },
  { id: 'm5', text: '高中的理想', chapter: '3. 高中到大学', order: 1 },
  { id: 'm6', text: '大学的成长', chapter: '3. 高中到大学', order: 2 },
  { id: 'm7', text: '第一份工作', chapter: '4. 进入社会与早期独立', order: 1 },
  { id: 'm8', text: '独立生活的挑战', chapter: '4. 进入社会与早期独立', order: 2 },
  { id: 'm9', text: '成家后的变化', chapter: '5. 成家责任与关键变化', order: 1 },
  { id: 'm10', text: '人生价值观', chapter: '6. 价值观模式与整合', order: 1 },
]

function normalizeQuestions(raw: any[]): Question[] {
  return raw.map((q, idx) => ({
    id: String(q.id ?? idx),
    text: q.text ?? '未命名题目',
    chapter: q.chapter ?? CHAPTER_ORDER[idx % CHAPTER_ORDER.length] ?? '未分章节',
    order: typeof q.order === 'number' ? q.order : idx + 1,
  }))
}

function groupChapters(questions: Question[]): { name: string; nodes: Question[] }[] {
  const grouped: Record<string, Question[]> = {}
  questions.forEach((q) => {
    const name = q.chapter || '未分章节'
    if (!grouped[name]) grouped[name] = []
    grouped[name].push(q)
  })

  const sortedNames = Object.keys(grouped).sort((a, b) => {
    const ia = CHAPTER_ORDER.indexOf(a)
    const ib = CHAPTER_ORDER.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })

  return sortedNames.map((name) => ({
    name,
    nodes: grouped[name].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  }))
}

function buildChapterViews(
  chapters: { name: string; nodes: Question[] }[],
  completedIds: Set<string>,
  expanded: Record<string, boolean>
): ChapterView[] {
  let previousCleared = true // 第一章默认解锁

  return chapters.map((chapter, idx) => {
    const baseUnlocked = idx === 0 ? true : previousCleared
    const nodes = chapter.nodes
    const completedCount = nodes.filter((n) => completedIds.has(n.id)).length

    // 解锁窗口：从第一个未完成节点开始，最多 UNLOCK_WINDOW 个
    const firstIncompleteIndex = nodes.findIndex((n) => !completedIds.has(n.id))
    const startIndex = !baseUnlocked
      ? nodes.length
      : firstIncompleteIndex === -1
        ? Math.max(nodes.length - 1, 0)
        : firstIncompleteIndex
    const endIndex = Math.min(nodes.length - 1, startIndex + UNLOCK_WINDOW - 1)
    const unlockedIndices = new Set<number>()
    for (let i = startIndex; i <= endIndex; i += 1) unlockedIndices.add(i)

    const nodeViews: PathNodeView[] = nodes.map((node, i) => {
      if (!baseUnlocked) return { question: node, status: 'locked', isToday: false }
      if (completedIds.has(node.id)) return { question: node, status: 'completed', isToday: false }
      if (unlockedIndices.has(i)) return { question: node, status: 'available', isToday: unlockedIndices.has(i) }
      return { question: node, status: 'locked', isToday: false }
    })

    const availableNodes = nodeViews.filter((n) => n.status === 'available')
    const today = availableNodes.slice(0, MAX_VISIBLE_AVAILABLE)

    const visibleLimit = expanded[chapter.name]
      ? nodeViews.length
      : Math.min(
          nodeViews.length,
          Math.max(endIndex + 1, (firstIncompleteIndex === -1 ? nodeViews.length : firstIncompleteIndex + MAX_VISIBLE_AVAILABLE))
        )
    const visibleNodes = nodeViews.slice(0, visibleLimit)
    const hiddenCount = nodeViews.length - visibleNodes.length

    previousCleared = completedCount >= NEXT_CHAPTER_THRESHOLD

    return {
      name: chapter.name,
      total: nodes.length,
      completed: completedCount,
      unlocked: baseUnlocked,
      nodes: nodeViews,
      visibleNodes,
      hiddenCount,
      today,
    }
  })
}

function PathNode({ node, onClick }: { node: PathNodeView; onClick: () => void }) {
  const palette: Record<NodeStatus, string> = {
    locked: 'bg-slate-200 text-slate-500 border-slate-200',
    available: 'bg-[#F8F6F2] text-[#8B7355] border-[#E3D6C6] shadow-sm',
    completed: 'bg-[#8B7355] text-white border-[#8B7355] shadow-md',
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-full border px-4 py-2 transition-transform duration-150 hover:-translate-y-0.5 ${palette[node.status]}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/40 ${node.status === 'completed' ? 'bg-white/20' : 'bg-[#8B7355]/10'} text-base font-semibold`}>
        {node.status === 'completed' ? '✓' : '•'}
      </div>
      <div className="flex flex-col items-start text-left">
        <span className="text-sm font-semibold leading-tight line-clamp-1">{node.question.text}</span>
        <span className="text-xs opacity-80">节点 #{node.question.order}</span>
      </div>
      {node.isToday && node.status === 'available' && (
        <span className="ml-auto rounded-full bg-[#8B7355] px-2 py-0.5 text-[11px] font-semibold text-white">今天可做</span>
      )}
    </button>
  )
}

function ChapterCard({
  chapter,
  expanded,
  onToggle,
  onNodeClick,
}: {
  chapter: ChapterView
  expanded: boolean
  onToggle: () => void
  onNodeClick: (node: PathNodeView) => void
}) {
  const progress = chapter.total === 0 ? 0 : Math.round((chapter.completed / chapter.total) * 100)
  const statusBadge = chapter.completed >= chapter.total
    ? { text: '已完成', className: 'bg-[#F8F6F2] text-[#8B7355] border border-[#E3D6C6]' }
    : chapter.unlocked
      ? { text: '已解锁', className: 'bg-[#F8F6F2] text-[#8B7355] border border-[#E3D6C6]' }
      : { text: '待解锁', className: 'bg-slate-100 text-slate-600' }

  // Auto-collapse chapters 3-6, show only first 2 nodes when collapsed
  const chapterIndex = parseInt(chapter.name.charAt(0)) || 1
  const shouldAutoCollapse = chapterIndex >= 3 && chapterIndex <= 6
  
  // All chapters can be collapsed: show 2 nodes when collapsed, show all when expanded
  const displayNodes = expanded 
    ? chapter.nodes 
    : chapter.nodes.slice(0, 2)
  
  const remainingCount = expanded 
    ? 0 
    : Math.max(0, chapter.nodes.length - 2)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white via-slate-50 to-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-[#8B7355] text-center text-lg font-black leading-9 text-white shadow-md">
            {chapter.name.at(0)}
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900">{chapter.name}</div>
            <div className="text-xs text-slate-500">{chapter.completed} / {chapter.total} 节点</div>
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.className}`}>{statusBadge.text}</div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-lime-400 to-emerald-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="relative mt-5">
        <div className="flex flex-col gap-4">
          {displayNodes.map((node, idx) => (
            <div key={node.question.id} className="relative pl-4">
              {idx !== 0 && (
                <div className="absolute left-[22px] top-[-18px] h-6 w-[2px] rounded-full bg-slate-200" />
              )}
              <PathNode node={node} onClick={() => onNodeClick(node)} />
            </div>
          ))}
        </div>
        
        {!expanded && remainingCount > 0 && (
          <div className="relative">
            <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-white/70 to-white pointer-events-none" />
            <div className="relative pt-4 text-center">
              <button 
                onClick={onToggle}
                className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
              >
                <span>还有 {remainingCount} 个节点</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-medium">今天可做：</span>
          <div className="flex flex-wrap gap-2">
            {chapter.today.length === 0 && <span className="text-slate-400">等待解锁</span>}
            {chapter.today.map((n) => (
              <span key={n.question.id} className="rounded-full bg-lime-100 px-2 py-1 text-[11px] font-semibold text-lime-700">
                #{n.question.order}
              </span>
            ))}
          </div>
        </div>
        {expanded && (
          <button onClick={onToggle} className="text-xs font-semibold text-slate-600 underline underline-offset-4">
            收起
          </button>
        )}
      </div>
    </div>
  )
}

function Toast({ text }: { text: string }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl">
      {text}
    </div>
  )
}

function DeepSupplementCard({
  projectId,
  onAnalysisComplete,
}: {
  projectId: string
  onAnalysisComplete: () => void
}) {
  const router = useRouter()
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState<QuestionRound | null>(null)
  const [progress, setProgress] = useState<{ total: number; answered: number } | null>(null)
  const [readiness, setReadiness] = useState<{ ready: boolean; currentCount: number; requiredCount: number } | null>(null)

  useEffect(() => {
    async function loadStatus() {
      try {
        const [roundData, progressData, readinessData] = await Promise.all([
          getLatestRound(projectId),
          getRound2Progress(projectId),
          checkFirstRoundReadiness(projectId),
        ])
        setRound(roundData)
        setProgress(progressData)
        setReadiness(readinessData)
      } catch (e) {
        console.error('Failed to load round 2 status:', e)
      }
    }
    loadStatus()
  }, [projectId])

  async function handleAnalyze() {
    setAnalyzing(true)
    setError(null)
    try {
      const result = await triggerContentAnalysis(projectId)
      setRound({
        id: result.round_id,
        project_id: projectId,
        round_number: 2,
        status: 'active',
        total_questions: result.question_count,
        answered_questions: 0,
        created_at: new Date().toISOString(),
      })
      setProgress({ total: result.question_count, answered: 0 })
      onAnalysisComplete()
    } catch (e: any) {
      setError(e?.message || '分析失败')
    } finally {
      setAnalyzing(false)
    }
  }

  const hasRound2 = round && progress && progress.total > 0
  const allCompleted = hasRound2 && progress.answered >= progress.total

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#E3D6C6] bg-[#F8F6F2] p-6 shadow-sm">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#B89B72]/10 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-[#B89B72]/10 blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#8B7355]/10 text-2xl border border-[#8B7355]/20 text-[#8B7355]">
            {hasRound2 ? (allCompleted ? '✓' : '📝') : '🔍'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#2C2C2C]">深度补充</h3>
            <p className="text-sm text-[#5A4F43]/80">AI 分析您的故事，补充关键细节</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {!hasRound2 ? (
          <div className="mt-5">
            {readiness && !readiness.ready ? (
              <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
                需要完成至少 {readiness.requiredCount} 个问题才能开始深度分析
                <div className="mt-1 text-xs text-slate-500">
                  当前已完成: {readiness.currentCount} / {readiness.requiredCount}
                </div>
              </div>
            ) : (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full rounded-xl bg-[#8B7355] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#6D5A43] disabled:opacity-50"
              >
                {analyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI 正在分析...
                  </span>
                ) : (
                  '开始分析'
                )}
              </button>
            )}
            <p className="mt-3 text-center text-xs text-[#8C8377]">
              AI 会分析您的回答，找出需要补充的冲突、感官细节和金句
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-[#5A4F43]">补充问题进度</span>
              <span className="font-semibold text-[#8B7355]">
                {progress.answered} / {progress.total} 已完成
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#E3D6C6]/30">
              <div
                className="h-full rounded-full bg-[#8B7355] transition-all"
                style={{ width: `${(progress.answered / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/round2')}
                className={`flex-1 rounded-xl px-6 py-3 text-base font-semibold shadow-md transition hover:-translate-y-0.5 ${
                  allCompleted
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-[#8B7355] text-white hover:bg-[#6D5A43]'
                }`}
              >
                {allCompleted ? '查看补充回答' : '继续回答'}
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="rounded-xl border border-[#8B7355]/30 bg-white px-4 py-3 text-sm font-semibold text-[#8B7355] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#F8F6F2] disabled:opacity-50"
              >
                {analyzing ? '分析中...' : '重新分析'}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-[#8C8377]">
              重新分析将生成新的补充问题（约30-40道）
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

import UnifiedNav from '../components/UnifiedNav';

export default function ProgressPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [showLockModal, setShowLockModal] = useState(false)

  // bootstrap: auth + project
  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) {
          setUserId(null)
          setUserEmail(null)
          setProjectId(null)
          setError('请先登录以查看进度')
          setLoading(false)
          return
        }
        setUserId(user.id)
        setUserEmail(user.email ?? null)

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)
        if (selErr) throw selErr

        if (list?.[0]?.id) {
          setProjectId(list[0].id)
          return
        }

        const { data: created, error: insErr } = await supabase
          .from('projects')
          .insert({ owner_id: user.id, name: 'My Vault' })
          .select('id')
          .maybeSingle()
        if (insErr) throw insErr
        setProjectId(created?.id ?? null)
      } catch (e: any) {
        setError(e?.message ?? '加载用户信息失败')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  // load questions + completion
  useEffect(() => {
    async function loadData() {
      if (!projectId || !userId) return
      setLoading(true)
      try {
        const [{ data: qData, error: qErr }, { data: aData, error: aErr }] = await Promise.all([
          supabase.from('questions').select('id, text, chapter').in('scope', ['global', 'user']).order('id', { ascending: true }),
          supabase.from('answer_sessions').select('question_id').eq('project_id', projectId),
        ])

        if (qErr) throw qErr
        if (aErr) throw aErr

        const normalized = qData?.length ? normalizeQuestions(qData) : []
        setQuestions(normalized)
        setCompletedIds(new Set((aData ?? []).map((r: any) => String(r.question_id))))
      } catch (e: any) {
        setError(e?.message ?? '加载数据失败')
        if (!questions.length) setQuestions([])
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId, userId])

  const chapters = useMemo(() => groupChapters(questions), [questions])
  const views = useMemo(() => buildChapterViews(chapters, completedIds, expanded), [chapters, completedIds, expanded])

  function handleNodeClick(node: PathNodeView) {
    if (node.status === 'locked') {
      setToast('完成上一关后解锁')
      setTimeout(() => setToast(null), 1800)
      return
    }

    // Link to主答题页并携带 questionId
    router.push(`/main?questionId=${encodeURIComponent(node.question.id)}`)
  }

  function getChapterJumpNode(chapter: ChapterView): PathNodeView | null {
    return chapter.nodes.find((node) => node.status !== 'locked') || chapter.nodes[0] || null
  }

  if (loading && !questions.length) {
    return (
      <main className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <UnifiedNav />
        </div>
        <div className="mx-auto max-w-5xl px-4 py-12 text-slate-600">正在加载章节路径…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <UnifiedNav />
        
        <div className="max-w-7xl mx-auto px-4 py-6">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                章节路径 / 地图关卡
              </h1>
              <p className="text-[#666666] mt-1">
                完成问答，解锁人生新篇章
              </p>
            </div>
            {/* Nav links removed as UnifiedNav handles them now */}
          </header>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <section className="mt-6">
            <style>{`
              /* Demo map styles (scoped) */
              .map-wrap{ display:grid; grid-template-columns: 2fr 1fr; gap:20px; align-items:start; }
              .map{ position:relative; border:1px solid #E6E0D6; background: rgba(255,255,255,.9); border-radius:24px; padding:28px 14px 28px; box-shadow:0 10px 30px rgba(0,0,0,.06); }
              .path{ position:relative; max-width:640px; margin:0 auto; padding:12px 0 24px; }
              .path-line{ position:absolute; left:50%; top:0; bottom:0; width:6px; transform:translateX(-50%); border-radius:999px; background: linear-gradient(180deg, rgba(139,115,85,.16), rgba(184,155,114,.12)); opacity:.75; }
              .node{ position: relative; width:100%; height:120px; display:flex; align-items:center; justify-content:center; }
              .node-inner{ position:absolute; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:12px; transition: all 0.3s ease; }
              
              /* Desktop Alternating Layout */
              .node[data-side="left"] .node-inner{ transform: translateX(-50%) translateX(-140px); flex-direction: row-reverse; text-align: right; }
              .node[data-side="left"] .label .title { justify-content: flex-end; }
              .node[data-side="left"] .label .meta { justify-content: flex-end; }
              
              .node[data-side="right"] .node-inner{ transform: translateX(-50%) translateX(140px); }
              
              .bubble{ width:74px; height:74px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-weight:800; cursor:pointer; border:2px solid rgba(0,0,0,.06); box-shadow:0 14px 30px rgba(0,0,0,.10); background:#fff; transition:transform .15s ease; flex-shrink: 0; }
                .bubble:hover{ transform: translateY(-2px) scale(1.02); }
                .label{ min-width:240px; max-width:320px; padding:10px 12px; border-radius:14px; border:1px solid #E6E0D6; background: rgba(255,255,255,.86); box-shadow:0 10px 22px rgba(0,0,0,.06); }
                .label .title{ font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px; margin-bottom:4px; }
                .label .meta{ font-size:12px; color:#6B7280; display:flex; gap:10px; }
                .deep-area{ position:sticky; top:92px; }

                /* Mobile Responsive Styles */
                @media (max-width: 768px) {
                  .map-wrap{ grid-template-columns:1fr; gap: 32px; }
                  .deep-area{ position:static; margin-top: 0; }
                  
                  /* Mobile Vertical Timeline */
                  .path-line { left: 24px; transform: none; width: 4px; }
                  .path { padding: 0 0 24px; }
                  .node { height: auto; min-height: 80px; margin-bottom: 20px; justify-content: flex-start; padding-left: 60px; }
                  
                  /* Reset all transform logic for mobile */
                  .node-inner, 
                  .node[data-side="left"] .node-inner, 
                  .node[data-side="right"] .node-inner { 
                    position: relative; 
                    left: auto; 
                    transform: none !important; 
                    flex-direction: row !important; 
                    text-align: left !important; 
                    width: 100%; 
                    gap: 12px;
                  }
                  
                  /* Reset label alignment */
                  .node[data-side="left"] .label .title,
                  .node[data-side="right"] .label .title,
                  .node[data-side="left"] .label .meta,
                  .node[data-side="right"] .label .meta { justify-content: flex-start; }
  
                  /* Adjust Bubble Position */
                  .bubble { 
                    width: 48px; 
                    height: 48px; 
                    position: absolute; 
                    left: -52px; /* Relative to padding-left: 60px */
                    top: 0;
                    margin-top: 0;
                    font-size: 14px;
                  }

                  /* Adjust Label Width */
                  .label { 
                    min-width: auto; 
                    max-width: 100%; 
                    width: 100%; 
                    padding: 10px;
                  }
                  
                  .label .title { font-size: 13px; flex-wrap: wrap; gap: 4px; }
                  .label .meta { flex-wrap: wrap; gap: 6px; }
                  
                  /* Container adjustments */
                  .map { padding: 20px 12px; border-radius: 16px; }
                }
            `}</style>

            <div className="map-wrap">
              <div className="map-area">
                <div className="map">
                  <div className="path">
                    <div className="path-line" />
                    {(() => {
                      const sidePattern = ['left','center','right','center','left','center','right']
                      const currentIndex = views.findIndex(v => v.unlocked && v.completed < v.total)
                      return views.map((ch, idx) => {
                        const state = !ch.unlocked ? 'locked' : (ch.completed >= ch.total ? 'done' : (idx === currentIndex ? 'current' : 'open'))
                        const side = sidePattern[idx % sidePattern.length]
                        const tagText = state === 'done' ? '已完成' : state === 'current' ? '下一关' : state === 'open' ? '已解锁' : `锁定 · 需${NEXT_CHAPTER_THRESHOLD}题`
                        const jumpNode = getChapterJumpNode(ch)
                        return (
                          <div className={`node state-${state}`} data-side={side} key={ch.name}>
                            <div className="node-inner">
                              <div
                                className="bubble"
                                onClick={() => jumpNode && handleNodeClick(jumpNode)}
                                aria-label={ch.name}
                              >
                                {state === 'locked' ? '🔒' : (state === 'open' || state === 'current' ? <span style={{fontSize:14}}>{idx+1}</span> : '')}
                              </div>

                              <div
                                className="label cursor-pointer"
                                onClick={() => jumpNode && handleNodeClick(jumpNode)}
                                role="button"
                                tabIndex={0}
                              >
                                <div className="title">
                                  <span>{idx+1}. {ch.name}</span>
                                  <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 8px',borderRadius:999,fontSize:11,border:'1px solid #E6E0D6',background:'rgba(250,250,247,.8)'}}>{tagText}</span>
                                </div>
                                <div className="meta">
                                  <span>{ch.completed}/{ch.total} 节点</span>
                                  <span style={{color:'#9A8F7A'}}>·</span>
                                  <span>{state === 'locked' ? `点一下看看如何解锁` : '点击开始 / 查看'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>

              <aside className="deep-area">
                {projectId && (
                  completedIds.size >= SECOND_ROUND_UNLOCK_THRESHOLD ? (
                    <DeepSupplementCard
                      projectId={projectId}
                      onAnalysisComplete={() => { setToast('分析完成！已生成补充问题'); setTimeout(() => setToast(null), 3000) }}
                    />
                  ) : (
                    <div onClick={() => setShowLockModal(true)} className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-slate-200/30 blur-2xl" />
                      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-slate-200/30 blur-2xl" />

                      <div className="relative">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 text-2xl shadow-lg">🔒</div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-500">深度补充</h3>
                            <p className="text-sm text-slate-400">完成 {SECOND_ROUND_UNLOCK_THRESHOLD} 道问题后解锁</p>
                          </div>
                        </div>

                        <div className="mt-5">
                          <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-500">
                            当前进度: {completedIds.size} / {SECOND_ROUND_UNLOCK_THRESHOLD}
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-slate-400 transition-all" style={{ width: `${Math.min(100, (completedIds.size / SECOND_ROUND_UNLOCK_THRESHOLD) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </aside>
            </div>

          </section>

        </div>
      </div>
      {toast && <Toast text={toast} />}
    </main>
  )
}
