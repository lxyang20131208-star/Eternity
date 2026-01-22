"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabaseClient'

// Types
interface Question {
  id: string
  text: string
  chapter: string | null
}

interface AnswerSessionRow {
  id: string
  created_at: string
  question_id: string
  transcript_text?: string | null
  status?: string | null
}

interface OutlineRow {
  id: string
  version: number
  status: string
  created_at: string
}

const FALLBACK_CHAPTER = '未分章节'

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export default function BookProgressPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<AnswerSessionRow[]>([])
  const [outlines, setOutlines] = useState<OutlineRow[]>([])

  // Auth + project bootstrap
  useEffect(() => {
    let canceled = false
    async function bootstrap() {
      try {
        setLoading(true)
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) {
          if (!canceled) setError('请先登录以查看书籍进度')
          return
        }
        if (!canceled) setUserEmail(user.email ?? null)

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

  // Load data for stats/cards
  useEffect(() => {
    let canceled = false
    async function loadData() {
      if (!projectId) return
      setLoading(true)
      try {
        const [qRes, aRes, oRes] = await Promise.all([
          supabase.from('questions').select('id, text, chapter').in('scope', ['global', 'user']),
          supabase.from('answer_sessions').select('id, created_at, question_id, transcript_text, status').eq('project_id', projectId).order('created_at', { ascending: false }),
          supabase.from('biography_outlines').select('id, version, status, created_at').eq('project_id', projectId).order('version', { ascending: false }),
        ])

        if (qRes.error) throw qRes.error
        if (aRes.error) throw aRes.error
        if (oRes.error) throw oRes.error

        if (!canceled) {
          const normalizedQs: Question[] = (qRes.data ?? []).map((q: any) => ({
            id: String(q.id),
            text: q.text ?? '未命名题目',
            chapter: q.chapter ?? FALLBACK_CHAPTER,
          }))
          setQuestions(normalizedQs)
          setAnswers((aRes.data ?? []) as AnswerSessionRow[])
          setOutlines((oRes.data ?? []) as OutlineRow[])
        }
      } catch (e: any) {
        if (!canceled) setError(e?.message ?? '加载进度失败')
      } finally {
        if (!canceled) setLoading(false)
      }
    }
    loadData()
    return () => {
      canceled = true
    }
  }, [projectId])

  const chapterStats = useMemo(() => {
    if (!questions.length) return []
    const completedIds = new Set(answers.map((a) => String(a.question_id)))
    const grouped: Record<string, { total: number; done: number }> = {}
    questions.forEach((q) => {
      const key = q.chapter || FALLBACK_CHAPTER
      if (!grouped[key]) grouped[key] = { total: 0, done: 0 }
      grouped[key].total += 1
      if (completedIds.has(q.id)) grouped[key].done += 1
    })
    const parseOrder = (name: string): number => {
      const trimmed = name.trim()
      const m = trimmed.match(/^0*(\d+)/)
      return m ? Number(m[1]) : 9999
    }

    return Object.entries(grouped)
      .map(([name, info]) => ({
        name,
        total: info.total,
        done: info.done,
        percent: info.total === 0 ? 0 : Math.round((info.done / info.total) * 100),
        order: parseOrder(name),
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }, [answers, questions])

  const latestOutline = outlines.find((o) => o.status === 'done') || outlines[0]

  const cards = useMemo(() => {
    const qMap = new Map(questions.map((q) => [q.id, q]))
    return answers.slice(0, 12).map((a) => {
      const q = qMap.get(String(a.question_id))
      const chapter = q?.chapter || FALLBACK_CHAPTER
      const title = q?.text || '未命名题目'
      const summary = a.transcript_text?.slice(0, 120) || '转写进行中，稍后生成摘要/金句卡片…'
      return {
        id: a.id,
        title,
        chapter,
        created_at: a.created_at,
        summary,
        status: a.status || 'processing',
      }
    })
  }, [answers, questions])

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">Book Progress</div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">书籍进度与即时卡片</h1>
            <p className="mt-1 text-sm text-slate-600">录完就出卡：摘要 / 金句 / 时间线，随时查看章节完成度。</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/main"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              返回录音
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

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatTile label="已录答案" value={`${answers.length}`} hint="录完即生成卡片" />
          <StatTile label="覆盖章节" value={`${chapterStats.length}`} hint="章节含至少一个答案" />
          <StatTile label="最新提纲" value={latestOutline ? `v${latestOutline.version} · ${latestOutline.status}` : '暂无'} hint={latestOutline ? new Date(latestOutline.created_at).toLocaleString() : '生成提纲后查看'} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Chapters</div>
                <h3 className="text-lg font-semibold text-slate-900">章节完成度</h3>
              </div>
              <Link href="/progress" className="text-sm font-semibold text-amber-600 hover:text-amber-700">查看章节路径 →</Link>
            </div>
            {chapterStats.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无章节数据，先去回答几道题目吧。</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {chapterStats.map((c) => (
                  <div key={c.name} className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                      <span>{c.name}</span>
                      <span>{c.percent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-500" style={{ width: `${c.percent}%` }} />
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{c.done} / {c.total} 题</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Deliverables</div>
              <h3 className="text-lg font-semibold text-slate-900">成品预览</h3>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <Link href="/stories" className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-amber-700 hover:border-amber-200 hover:bg-amber-50">卷轴故事预览</Link>
              <Link href="/export" className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800 hover:border-emerald-200 hover:bg-emerald-50">电子书导出/PDF</Link>
              <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-slate-500">硬皮书/相册书 (预售占位)</div>
              <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-slate-500">未来信/纪念页 (单页交付)</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Instant Cards</div>
              <h3 className="text-lg font-semibold text-slate-900">录完即出卡</h3>
            </div>
            <span className="text-xs font-semibold text-amber-600">最新 12 条</span>
          </div>
          {cards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">暂无录音卡片，去录一条试试。</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <div key={card.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.chapter}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">{card.title}</div>
                    </div>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{card.status === 'done' ? '已生成' : '生成中'}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 line-clamp-3">{card.summary}</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{new Date(card.created_at).toLocaleString()}</span>
                    <Link href="/export" className="font-semibold text-amber-700 hover:text-amber-800">插入书稿</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
