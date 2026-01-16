'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import {
  getRound2Questions,
  updateQuestionStatus,
  skipQuestion,
  getRound2Progress,
  getQuestionTypeLabel,
  getQuestionTypeColor,
  type Round2Question,
} from '../../lib/round2Api'

function uuid() {
  return crypto.randomUUID()
}

type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done' | 'error'

function QuestionTypeTag({ type }: { type: Round2Question['question_type'] }) {
  const label = getQuestionTypeLabel(type)
  const color = getQuestionTypeColor(type)

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {label}
    </span>
  )
}

function QuestionCard({
  question,
  isActive,
  onSelect,
  onSkip,
}: {
  question: Round2Question
  isActive: boolean
  onSelect: () => void
  onSkip: () => void
}) {
  const isAnswered = question.status === 'answered'
  const isSkipped = question.status === 'skipped'

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 p-5 transition-all ${
        isActive
          ? 'border-amber-400 bg-amber-50 shadow-lg'
          : isAnswered
            ? 'border-emerald-300 bg-emerald-50'
            : isSkipped
              ? 'border-slate-200 bg-slate-50 opacity-60'
              : 'border-slate-200 bg-white hover:border-amber-200 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <QuestionTypeTag type={question.question_type} />
            {question.related_chapter && (
              <span className="text-xs text-slate-500">{question.related_chapter}</span>
            )}
            {isAnswered && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Answered
              </span>
            )}
            {isSkipped && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                Skipped
              </span>
            )}
          </div>

          <p className="text-base font-medium text-slate-800">{question.question_text}</p>

          {question.media_prompt && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
              <span>📷</span>
              {question.media_prompt}
            </p>
          )}

          {question.missing_element_description && (
            <p className="mt-2 text-xs text-slate-400 italic">
              Purpose: {question.missing_element_description}
            </p>
          )}
        </div>
      </div>

      {!isAnswered && !isSkipped && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={onSelect}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              isActive
                ? 'bg-amber-500 text-white'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
            }`}
          >
            {isActive ? 'Answering...' : 'Start answering'}
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  )
}

function RecordingPanel({
  status,
  onStart,
  onStop,
  audioUrl,
  error,
}: {
  status: RecordingStatus
  onStart: () => void
  onStop: () => void
  audioUrl: string | null
  error: string | null
}) {
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-6">
      <h3 className="mb-4 text-lg font-bold text-slate-900">Voice Recording</h3>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-col items-center gap-4">
        {status === 'idle' && (
          <button
            onClick={onStart}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-3xl text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
          >
            🎤
          </button>
        )}

        {status === 'recording' && (
          <>
            <div className="flex items-center gap-2 text-red-600">
              <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="font-semibold">Recording...</span>
            </div>
            <button
              onClick={onStop}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-3xl text-white shadow-lg transition hover:scale-105"
            >
              ⏹️
            </button>
          </>
        )}

        {status === 'stopped' && (
          <div className="text-center text-slate-600">
            <div className="mb-2 text-2xl">✓</div>
            <div>Recording stopped, processing...</div>
          </div>
        )}

        {status === 'uploading' && (
          <div className="flex items-center gap-2 text-amber-600">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="font-semibold">Uploading...</span>
          </div>
        )}

        {status === 'done' && audioUrl && (
          <div className="w-full">
            <div className="mb-2 text-center text-emerald-600 font-semibold">Answer saved\!</div>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {status === 'error' && (
          <button
            onClick={onStart}
            className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-white shadow transition hover:bg-amber-600"
          >
            Re-record
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        Click microphone to start recording, click again to stop
      </p>
    </div>
  )
}

export default function Round2Page() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Round2Question[]>([])
  const [progress, setProgress] = useState({ total: 0, answered: 0, pending: 0, skipped: 0 })
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  // Recording state
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle')
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Bootstrap auth + project
  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser()
        if (userErr) throw userErr
        if (!user) {
          router.push('/')
          return
        }
        setUserId(user.id)

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)
        if (selErr) throw selErr

        if (list?.[0]?.id) {
          setProjectId(list[0].id)
        } else {
          setError('Project not found')
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load')
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [router])

  // Load questions
  useEffect(() => {
    async function loadQuestions() {
      if (!projectId) return
      try {
        const [questionsData, progressData] = await Promise.all([
          getRound2Questions(projectId),
          getRound2Progress(projectId),
        ])
        setQuestions(questionsData)
        setProgress(progressData)
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load questions')
      }
    }

    loadQuestions()
  }, [projectId])

  async function startRecording() {
    if (!activeQuestionId) return

    setRecordingError(null)
    setAudioUrl(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        try {
          if (!userId || !projectId || !activeQuestionId) {
            setRecordingError('Missing required data')
            setRecordingStatus('error')
            return
          }

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          const sessionId = uuid()

          const now = new Date()
          const yyyy = now.getFullYear()
          const mm = String(now.getMonth() + 1).padStart(2, '0')

          const objectPath = `projects/${projectId}/audio_raw/${yyyy}/${mm}/${sessionId}.webm`

          setRecordingStatus('uploading')

          // Upload audio
          const { error: uploadError } = await supabase.storage.from('vault').upload(objectPath, blob, {
            contentType: blob.type || 'audio/webm',
            upsert: false,
          })

          if (uploadError) throw uploadError

          // Get signed URL
          const { data: signed, error: signErr } = await supabase.storage
            .from('vault')
            .createSignedUrl(objectPath, 3600)

          if (signErr) throw signErr

          // Create answer session (question_id is null for round 2)
          const { error: dbErr } = await supabase.from('answer_sessions').insert({
            id: sessionId,
            project_id: projectId,
            question_id: null,
            audio_object_key: objectPath,
            status: 'uploaded',
            round_number: 2,
            round2_question_id: activeQuestionId,
          })

          if (dbErr) throw dbErr

          // Trigger transcription
          const { error: transcribeErr } = await supabase.functions.invoke('transcribe_session', {
            body: { session_id: sessionId },
          })

          if (transcribeErr) console.error('Transcription error:', transcribeErr)

          // Update question status
          await updateQuestionStatus(activeQuestionId, 'answered', sessionId)

          // Update local state
          setQuestions((prev) =>
            prev.map((q) => (q.id === activeQuestionId ? { ...q, status: 'answered' as const } : q))
          )
          setProgress((prev) => ({
            ...prev,
            answered: prev.answered + 1,
            pending: prev.pending - 1,
          }))

          setAudioUrl(signed?.signedUrl ?? null)
          setRecordingStatus('done')
          setActiveQuestionId(null)
        } catch (e: any) {
          setRecordingError(e?.message ?? String(e))
          setRecordingStatus('error')
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingStatus('recording')
    } catch (e: any) {
      setRecordingError(e?.message ?? 'Cannot access microphone')
      setRecordingStatus('error')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecordingStatus('stopped')
  }

  async function handleSkip(questionId: string) {
    try {
      await skipQuestion(questionId)
      setQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, status: 'skipped' as const } : q))
      )
      setProgress((prev) => ({
        ...prev,
        skipped: prev.skipped + 1,
        pending: prev.pending - 1,
      }))
    } catch (e: any) {
      setError(e?.message ?? 'Operation failed')
    }
  }

  function handleSelectQuestion(questionId: string) {
    setActiveQuestionId(questionId)
    setRecordingStatus('idle')
    setAudioUrl(null)
    setRecordingError(null)
  }

  const activeQuestion = questions.find((q) => q.id === activeQuestionId)
  const pendingQuestions = questions.filter((q) => q.status === 'pending')
  const completedQuestions = questions.filter((q) => q.status === 'answered' || q.status === 'skipped')

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-12 text-slate-600">Loading...</div>
      </main>
    )
  }

  if (questions.length === 0) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mb-4 text-4xl">📝</div>
            <h2 className="mb-2 text-xl font-bold text-slate-800">No supplement questions</h2>
            <p className="mb-6 text-slate-600">Please click Deep Supplement on the progress page to generate questions first</p>
            <Link
              href="/progress"
              className="inline-block rounded-lg bg-amber-500 px-6 py-3 font-semibold text-white shadow transition hover:bg-amber-600"
            >
              Back to Progress
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-amber-50">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-600">
              Deep Supplement
            </div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">Deep Supplement Questions</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/progress"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Back to Progress
            </Link>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-8 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-600">Answer Progress</span>
            <span className="font-semibold text-amber-600">
              {progress.answered} / {progress.total} completed
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
              style={{ width: `${progress.total > 0 ? (progress.answered / progress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span>Pending: {progress.pending}</span>
            <span>Skipped: {progress.skipped}</span>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left: Question list */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">
              Pending ({pendingQuestions.length})
            </h2>
            {pendingQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                isActive={activeQuestionId === q.id}
                onSelect={() => handleSelectQuestion(q.id)}
                onSkip={() => handleSkip(q.id)}
              />
            ))}

            {completedQuestions.length > 0 && (
              <>
                <h2 className="mt-8 text-lg font-bold text-slate-800">
                  Completed ({completedQuestions.length})
                </h2>
                {completedQuestions.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    isActive={false}
                    onSelect={() => {}}
                    onSkip={() => {}}
                  />
                ))}
              </>
            )}
          </div>

          {/* Right: Recording panel */}
          <div className="lg:sticky lg:top-8 lg:self-start">
            {activeQuestion ? (
              <div>
                <div className="mb-4 rounded-xl border border-amber-200 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <QuestionTypeTag type={activeQuestion.question_type} />
                    <span className="text-xs text-slate-500">{activeQuestion.related_chapter}</span>
                  </div>
                  <p className="text-lg font-medium text-slate-800">{activeQuestion.question_text}</p>
                </div>

                <RecordingPanel
                  status={recordingStatus}
                  onStart={startRecording}
                  onStop={stopRecording}
                  audioUrl={audioUrl}
                  error={recordingError}
                />
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <div className="mb-2 text-3xl">👈</div>
                <p className="text-slate-600">Select a question on the left to start answering</p>
              </div>
            )}
          </div>
        </div>

        {progress.answered === progress.total && progress.total > 0 && (
          <div className="mt-8 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
            <div className="mb-2 text-4xl">🎉</div>
            <h3 className="mb-2 text-xl font-bold text-emerald-800">All done\!</h3>
            <p className="mb-4 text-emerald-700">You have answered all supplement questions. You can now generate a richer biography.</p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white shadow transition hover:bg-emerald-600"
            >
              Back to Home to Generate Biography
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}







