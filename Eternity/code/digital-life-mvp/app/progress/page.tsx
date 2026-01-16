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
    available: 'bg-lime-100 text-lime-700 border-lime-300 shadow-[0_8px_24px_rgba(132,204,22,0.35)]',
    completed: 'bg-emerald-500 text-white border-emerald-500 shadow-[0_10px_30px_rgba(16,185,129,0.45)]',
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-full border px-4 py-2 transition-transform duration-150 hover:-translate-y-0.5 ${palette[node.status]}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/10 text-base font-semibold">
        {node.status === 'completed' ? '✓' : '•'}
      </div>
      <div className="flex flex-col items-start text-left">
        <span className="text-sm font-semibold leading-tight line-clamp-1">{node.question.text}</span>
        <span className="text-xs opacity-80">节点 #{node.question.order}</span>
      </div>
      {node.isToday && node.status === 'available' && (
        <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-lime-700">今天可做</span>
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
    ? { text: '已完成', className: 'bg-emerald-100 text-emerald-700' }
    : chapter.unlocked
      ? { text: '已解锁', className: 'bg-lime-100 text-lime-700' }
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
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-center text-lg font-black leading-9 text-white shadow-[0_10px_30px_rgba(251,191,36,0.35)]">
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
    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 p-6 shadow-[0_20px_60px_rgba(251,191,36,0.15)]">
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-200/30 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-orange-200/30 blur-2xl" />

      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-2xl shadow-lg">
            {hasRound2 ? (allCompleted ? '✓' : '📝') : '🔍'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">深度补充</h3>
            <p className="text-sm text-slate-600">AI 分析您的故事，补充关键细节</p>
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
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50"
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
            <p className="mt-3 text-center text-xs text-slate-500">
              AI 会分析您的回答，找出需要补充的冲突、感官细节和金句
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-slate-600">补充问题进度</span>
              <span className="font-semibold text-amber-600">
                {progress.answered} / {progress.total} 已完成
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                style={{ width: `${(progress.answered / progress.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push('/round2')}
                className={`flex-1 rounded-xl px-6 py-3 text-base font-semibold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl ${
                  allCompleted
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white'
                }`}
              >
                {allCompleted ? '查看补充回答' : '继续回答'}
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="rounded-xl border-2 border-amber-400 bg-white px-4 py-3 text-sm font-semibold text-amber-600 shadow transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-lg disabled:opacity-50"
              >
                {analyzing ? '分析中...' : '重新分析'}
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              重新分析将生成新的补充问题（约30-40道）
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

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
          supabase.from('questions').select('id, text, chapter').order('id', { ascending: true }),
          supabase.from('answer_sessions').select('question_id').eq('project_id', projectId),
        ])

        if (qErr) throw qErr
        if (aErr) throw aErr

        const normalized = qData?.length ? normalizeQuestions(qData) : MOCK_QUESTIONS
        setQuestions(normalized)
        setCompletedIds(new Set((aData ?? []).map((r: any) => String(r.question_id))))
      } catch (e: any) {
        setError(e?.message ?? '加载数据失败')
        if (!questions.length) setQuestions(MOCK_QUESTIONS)
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
    router.push(`/?questionId=${encodeURIComponent(node.question.id)}`)
  }

  if (loading && !questions.length) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-12 text-slate-600">正在加载章节路径…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-600">Chapter Path</div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">章节路径 / 地图关卡</h1>

          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              返回主页
            </Link>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="text-xs text-slate-500">账号</div>
              <div className="text-slate-800">{userEmail || '未登录'}</div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {views.map((chapter) => (
            <ChapterCard
              key={chapter.name}
              chapter={chapter}
              expanded={!!expanded[chapter.name]}
              onToggle={() => setExpanded((prev) => ({ ...prev, [chapter.name]: !prev[chapter.name] }))}
              onNodeClick={handleNodeClick}
            />
          ))}
        </section>

        {views.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-slate-500 shadow-sm">
            暂无题目可展示，请先在题库创建问题。
          </div>
        )}

        {projectId && (
          <section className="mt-4">
            <DeepSupplementCard
              projectId={projectId}
              onAnalysisComplete={() => {
                setToast('分析完成！已生成补充问题')
                setTimeout(() => setToast(null), 3000)
              }}
            />
          </section>
        )}
      </div>
      {toast && <Toast text={toast} />}
    </main>
  )
}
