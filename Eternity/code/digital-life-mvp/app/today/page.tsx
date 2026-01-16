"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

const LOCAL_STREAK_KEY = 'dailyQuestions.streak'
const LOCAL_COMPLETED_TODAY_KEY = 'dailyQuestions.completedToday'

interface Question {
  id: string
  text: string
  text_en?: string | null
  chapter: string | null
  estimatedMinutes?: number
  mood?: 'light' | 'medium' | 'deep'
}

interface StreakData {
  current: number
  lastDate: string
  total: number
}

interface TodayQuestion extends Question {
  status: 'pending' | 'skipped' | 'completed'
}

type Lang = 'zh' | 'en'

const MOOD_COLORS = {
  light: { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
  deep: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
}

const MOOD_LABELS = {
  light: '轻松聊聊',
  medium: '适度回忆',
  deep: '深入思考',
}

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function QuestionCard({
  question,
  index,
  onAnswer,
  onSkip,
  disabled,
  lang,
}: {
  question: TodayQuestion
  index: number
  onAnswer: () => void
  onSkip: () => void
  disabled: boolean
  lang: Lang
}) {
  const displayText = lang === 'en' && question.text_en ? question.text_en : question.text
  const moodStyle = question.mood ? MOOD_COLORS[question.mood] : MOOD_COLORS.light

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${
        question.status === 'completed'
          ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100'
          : question.status === 'skipped'
            ? 'border-slate-300 bg-slate-50 opacity-60'
            : 'border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
      } p-6 transition-all`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              question.status === 'completed'
                ? 'bg-emerald-500 text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)]'
                : question.status === 'skipped'
                  ? 'bg-slate-300 text-slate-600'
                  : 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-[0_10px_30px_rgba(251,191,36,0.35)]'
            } text-xl font-bold`}
          >
            {question.status === 'completed' ? '✓' : question.status === 'skipped' ? '−' : index + 1}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {question.chapter || '未分章节'}
            </div>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{displayText}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {question.estimatedMinutes && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              ~{question.estimatedMinutes} 分钟
            </span>
          )}
          {question.mood && (
            <span className={`rounded-full ${moodStyle.bg} ${moodStyle.text} px-3 py-1 text-xs font-semibold`}>
              {MOOD_LABELS[question.mood]}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        {question.status === 'pending' && (
          <>
            <button
              onClick={onAnswer}
              disabled={disabled}
              className="flex-1 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_30px_rgba(251,191,36,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_rgba(251,191,36,0.45)] disabled:opacity-50"
            >
              开始回答 →
            </button>
            <button
              onClick={onSkip}
              disabled={disabled}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              跳过
            </button>
          </>
        )}
        {question.status === 'completed' && (
          <div className="flex-1 text-center text-sm font-semibold text-emerald-700">✓ 已完成</div>
        )}
        {question.status === 'skipped' && (
          <div className="flex-1 text-center text-sm font-semibold text-slate-500">已跳过</div>
        )}
      </div>
    </div>
  )
}

export default function TodayPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set())
  const [todayQuestions, setTodayQuestions] = useState<TodayQuestion[]>([])
  const [streak, setStreak] = useState<StreakData>({ current: 0, lastDate: '', total: 0 })
  const [toast, setToast] = useState<string | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderLoading, setReminderLoading] = useState(false)
  const [questionLang, setQuestionLang] = useState<'zh' | 'en'>('zh')

  function showToast(text: string) {
    setToast(text)
    setTimeout(() => setToast(null), 2000)
  }

  // Bootstrap auth + project
  useEffect(() => {
    let canceled = false
    async function bootstrap() {
      try {
        setLoading(true)
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) {
          if (!canceled) setError('请先登录查看每日三题')
          return
        }
        if (!canceled) {
          setUserId(user.id)
          setUserEmail(user.email ?? null)
        }

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)
        if (selErr) throw selErr

        let pid = list?.[0]?.id as string | undefined
        if (!pid) {
          const { data: created, error: insErr } = await supabase
            .from('projects')
            .insert({ owner_id: user.id, name: 'My Vault' })
            .select('id')
            .maybeSingle()
          if (insErr) throw insErr
          pid = created?.id
        }
        if (!canceled) setProjectId(pid ?? null)
      } catch (e: any) {
        if (!canceled) setError(e?.message ?? '加载账户失败')
      } finally {
        if (!canceled) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      canceled = true
    }
  }, [])

  // Load reminder status
  useEffect(() => {
    let canceled = false
    async function loadReminder() {
      if (!userId) return
      try {
        setReminderLoading(true)
        const { data, error } = await supabase
          .from('weekly_reminders')
          .select('status')
          .eq('user_id', userId)
          .eq('channel', 'email')
          .maybeSingle()
        if (error) throw error
        if (!canceled) setReminderEnabled(Boolean(data && data.status === 'active'))
      } catch (e: any) {
        console.error('Load reminder failed:', e?.message || e, e)
        const msg = e?.message || '无法读取提醒设置，请确认已运行最新数据库迁移'
        showToast(msg)
        if (!canceled) setReminderEnabled(false)
      } finally {
        if (!canceled) setReminderLoading(false)
      }
    }
    loadReminder()
    return () => {
      canceled = true
    }
  }, [userId])

  // Load questions + answered
  useEffect(() => {
    let canceled = false
    async function loadData() {
      if (!projectId) return
      setLoading(true)
      try {
        const [qRes, aRes] = await Promise.all([
          supabase.from('questions').select('id, text, text_en, chapter').order('id', { ascending: true }),
          supabase.from('answer_sessions').select('question_id').eq('project_id', projectId),
        ])

        if (qRes.error) throw qRes.error
        if (aRes.error) throw aRes.error

        if (!canceled) {
          const qs: Question[] = (qRes.data ?? []).map((q: any, idx: number) => ({
            id: String(q.id),
            text: q.text ?? '未命名题目',
            text_en: q.text_en ?? null,
            chapter: q.chapter ?? null,
            estimatedMinutes: [3, 5, 8, 5, 3][idx % 5],
            mood: (['light', 'medium', 'deep'] as const)[idx % 3],
          }))
          setAllQuestions(qs)

          const answered = new Set((aRes.data ?? []).map((a: any) => String(a.question_id)))
          setAnsweredIds(answered)
        }
      } catch (e: any) {
        if (!canceled) setError(e?.message ?? '加载题目失败')
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    loadData()
    return () => {
      canceled = true
    }
  }, [projectId])

  // Pick today's 3 questions
  useEffect(() => {
    if (!allQuestions.length) return

    const today = getToday()
    const completedTodayRaw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_COMPLETED_TODAY_KEY) : null
    let completedToday: Record<string, string[]> = {}
    try {
      if (completedTodayRaw) completedToday = JSON.parse(completedTodayRaw)
    } catch (e) {
      console.warn('Parse completed today failed', e)
    }

    const todayCompleted = new Set(completedToday[today] || [])

    // Pick unanswered questions, prioritize those not answered today
    const unanswered = allQuestions.filter((q) => !answeredIds.has(q.id))
    const seed = new Date(today).getTime()
    const shuffled = [...unanswered].sort((a, b) => {
      const hashA = (seed + parseInt(a.id.replace(/\D/g, '0'), 10)) % 1000
      const hashB = (seed + parseInt(b.id.replace(/\D/g, '0'), 10)) % 1000
      return hashA - hashB
    })

    const picked = shuffled.slice(0, 3)
    const withStatus: TodayQuestion[] = picked.map((q) => ({
      ...q,
      status: todayCompleted.has(q.id) ? 'completed' : 'pending',
    }))

    setTodayQuestions(withStatus)
  }, [allQuestions, answeredIds])

  // Load streak
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(LOCAL_STREAK_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StreakData
        const today = getToday()
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

        if (parsed.lastDate === today) {
          setStreak(parsed)
        } else if (parsed.lastDate === yesterday) {
          setStreak({ ...parsed, current: parsed.current })
        } else {
          setStreak({ current: 0, lastDate: parsed.lastDate, total: parsed.total })
        }
      }
    } catch (e) {
      console.warn('Streak restore failed', e)
    }
  }, [])

  function handleAnswer(qid: string) {
    router.push(`/?questionId=${encodeURIComponent(qid)}`)
  }

  function handleSkip(qid: string) {
    setTodayQuestions((prev) =>
      prev.map((q) => (q.id === qid ? { ...q, status: 'skipped' as const } : q))
    )
    showToast('已跳过此题，明天还会推送')
  }

  function markCompleted(qid: string) {
    const today = getToday()
    const completedTodayRaw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_COMPLETED_TODAY_KEY) : null
    let completedToday: Record<string, string[]> = {}
    try {
      if (completedTodayRaw) completedToday = JSON.parse(completedTodayRaw)
    } catch (e) {
      console.warn('Parse completed today failed', e)
    }

    if (!completedToday[today]) completedToday[today] = []
    if (!completedToday[today].includes(qid)) {
      completedToday[today].push(qid)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_COMPLETED_TODAY_KEY, JSON.stringify(completedToday))
      }

      const newCurrent = streak.lastDate === today ? streak.current : streak.current + 1
      const newStreak: StreakData = {
        current: newCurrent,
        lastDate: today,
        total: streak.total + 1,
      }
      setStreak(newStreak)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_STREAK_KEY, JSON.stringify(newStreak))
      }
    }

    setTodayQuestions((prev) =>
      prev.map((q) => (q.id === qid ? { ...q, status: 'completed' as const } : q))
    )
  }

  useEffect(() => {
    const handleStorageChange = () => {
      const today = getToday()
      const completedTodayRaw = window.localStorage.getItem(LOCAL_COMPLETED_TODAY_KEY)
      let completedToday: Record<string, string[]> = {}
      try {
        if (completedTodayRaw) completedToday = JSON.parse(completedTodayRaw)
      } catch (e) {
        return
      }
      const todayCompleted = new Set(completedToday[today] || [])
      setTodayQuestions((prev) =>
        prev.map((q) => ({
          ...q,
          status: todayCompleted.has(q.id) ? 'completed' : answeredIds.has(q.id) ? 'completed' : q.status,
        }))
      )
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [answeredIds])

  const completedCount = todayQuestions.filter((q) => q.status === 'completed').length
  const allDone = completedCount === todayQuestions.length && todayQuestions.length > 0

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">Today's 3</div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">今日三题</h1>
            <p className="mt-1 text-sm text-slate-600">每天只需 3 分钟，坚持记录你的人生故事。</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="text-xs text-slate-500">连续天数</div>
              <div className="text-2xl font-bold text-amber-600">{streak.current}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="text-xs text-slate-500">累计完成</div>
              <div className="text-2xl font-bold text-emerald-600">{streak.total}</div>
            </div>
            {/* Language Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => setQuestionLang('zh')}
                className={`px-3 py-2 text-sm font-medium transition ${
                  questionLang === 'zh'
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-slate-500 hover:bg-slate-50'
                } rounded-l-lg`}
              >
                中文
              </button>
              <button
                onClick={() => setQuestionLang('en')}
                className={`px-3 py-2 text-sm font-medium transition ${
                  questionLang === 'en'
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-slate-500 hover:bg-slate-50'
                } rounded-r-lg`}
              >
                EN
              </button>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              返回主页
            </Link>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading && !todayQuestions.length ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-slate-600">
            正在准备今日三题...
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-amber-800">今天的进度</div>
                  <div className="mt-1 text-xs text-amber-700">
                    {allDone ? '🎉 今日三题全部完成！' : `已完成 ${completedCount} / ${todayQuestions.length} 题`}
                  </div>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-2xl font-bold text-white shadow-[0_10px_30px_rgba(251,191,36,0.35)]">
                  {completedCount}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all"
                  style={{ width: `${(completedCount / (todayQuestions.length || 1)) * 100}%` }}
                />
              </div>
            </div>

            <section className="grid grid-cols-1 gap-4">
              {todayQuestions.map((q, idx) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  index={idx}
                  onAnswer={() => handleAnswer(q.id)}
                  onSkip={() => handleSkip(q.id)}
                  disabled={loading}
                  lang={questionLang}
                />
              ))}
            </section>

            {todayQuestions.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-slate-500">
                暂无可用题目，请先在题库创建问题。
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">📬 每周推送提醒</div>
                  <div className="mt-1 text-xs text-slate-600">设置邮件提醒，不错过每日三题</div>
                </div>
                <button
                  onClick={async () => {
                    if (!userId) {
                      showToast('请先登录')
                      return
                    }
                    setReminderLoading(true)
                    try {
                      const { error } = await supabase
                        .from('weekly_reminders')
                        .upsert({
                          user_id: userId,
                          email: userEmail,
                          channel: 'email',
                          weekday: 'mon',
                          status: 'active',
                          updated_at: new Date().toISOString(),
                        })
                      if (error) throw error
                      setReminderEnabled(true)
                      showToast('邮件提醒已开启')
                    } catch (e: any) {
                      console.error('Enable reminder failed:', e)
                      showToast('开启提醒失败')
                    } finally {
                      setReminderLoading(false)
                    }
                  }}
                  disabled={reminderLoading || reminderEnabled}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                    reminderEnabled
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                  } disabled:opacity-70`}
                >
                  {reminderEnabled ? '已开启' : reminderLoading ? '开启中…' : '开启邮件提醒'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-xl">
          {toast}
        </div>
      )}
    </main>
  )
}
