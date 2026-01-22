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
import UnifiedNav from '../components/UnifiedNav'

function uuid() {
  return crypto.randomUUID()
}

type RecordingStatus = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done' | 'error'

function QuestionTypeTag({ type }: { type: Round2Question['question_type'] }) {
  const label = getQuestionTypeLabel(type)
  // Map original colors to theme colors if needed, or keep them subtle
  // Using a neutral/theme compatible style
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border"
      style={{ 
        backgroundColor: '#F8F6F2', 
        color: '#5A4F43',
        borderColor: '#E3D6C6'
      }}
    >
      {label}
    </span>
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
    <div className="glass-card" style={{
      padding: 24,
      border: status === 'recording' ? '1px solid rgba(255, 68, 102, 0.5)' : '1px solid rgba(184,155,114,0.15)',
      boxShadow: status === 'recording' ? '0 0 30px rgba(255, 68, 102, 0.2)' : 'none',
      transition: 'all 0.3s',
    }}>
      {/* Status Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
        padding: '10px 16px',
        background: '#F8F6F2',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '1px',
        color:
          status === 'done' ? '#8B7355' :
          status === 'error' ? '#ff4466' :
          status === 'recording' ? '#ff4466' :
          status === 'uploading' ? '#8B7355' : '#5A4F43',
      }}>
        <span style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background:
            status === 'done' ? '#8B7355' :
            status === 'error' ? '#ff4466' :
            status === 'recording' ? '#ff4466' :
            status === 'uploading' ? '#8B7355' : '#5A4F43',
          boxShadow:
            status === 'recording' ? '0 0 15px #ff4466' :
            status === 'done' ? '0 0 15px #8B7355' : 'none',
          animation: status === 'recording' ? 'pulse-glow 1s ease-in-out infinite' : 'none',
        }} />
        {status === 'idle' && 'STANDBY'}
        {status === 'recording' && 'REC ●'}
        {status === 'stopped' && 'RECORDING COMPLETE'}
        {status === 'uploading' && 'PROCESSING...'}
        {status === 'done' && 'MEMORY SAVED'}
        {status === 'error' && 'ERROR'}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Recording Buttons */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginBottom: 20,
      }}>
        <button
          onClick={onStart}
          disabled={status === 'recording' || status === 'uploading'}
          className={status === 'recording' || status === 'uploading' ? '' : 'cyber-btn cyber-btn-primary'}
          style={{
            flex: 1,
            padding: '16px 18px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '1px',
            background: status === 'recording' || status === 'uploading'
              ? '#FFCCD6'
              : '#F5D7B0',
            color: status === 'recording' || status === 'uploading' ? '#ff3970' : '#5A4F43',
            border: status === 'recording' || status === 'uploading'
              ? '1px solid rgba(255, 68, 102, 0.4)'
              : '1px solid rgba(90, 79, 67, 0.12)',
            borderRadius: 8,
            boxShadow: status === 'recording' || status === 'uploading'
              ? '0 0 10px rgba(255, 68, 102, 0.25)'
              : '0 8px 20px rgba(139, 115, 85, 0.08)',
            cursor: status === 'recording' || status === 'uploading' ? 'not-allowed' : 'pointer',
            transition: 'all 0.25s ease',
            transform: status === 'recording' || status === 'uploading' ? 'none' : 'translateY(0)',
          }}
        >
          ◉ {status === 'recording' ? 'RECORDING...' : 'START REC'}
        </button>
        <button
          onClick={onStop}
          disabled={status !== 'recording'}
          className="cyber-btn cyber-btn-danger"
          style={{
            flex: 1,
            padding: '16px 18px',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '1px',
            borderRadius: 8,
            background: status === 'recording'
              ? 'linear-gradient(135deg, #ff6b6b, #ff3366)'
              : 'white',
            color: status === 'recording' ? '#2C2C2C' : '#5A4F43',
            border: status === 'recording'
              ? '1px solid rgba(255, 107, 107, 0.6)'
              : '1px solid rgba(90, 79, 67, 0.06)',
            boxShadow: status === 'recording'
              ? '0 12px 30px rgba(255, 51, 102, 0.25)'
              : 'none',
            opacity: status === 'recording' ? 1 : 0.95,
            cursor: status === 'recording' ? 'pointer' : 'not-allowed',
            transition: 'all 0.25s ease',
          }}
        >
          ◼ STOP
        </button>
      </div>

      {audioUrl && (
        <div style={{
          padding: 16,
          background: 'rgba(0, 255, 136, 0.05)',
          border: '1px solid rgba(0, 255, 136, 0.3)',
          borderRadius: 4,
        }}>
          <p style={{
            margin: '0 0 12px',
            fontSize: 12,
            fontWeight: 600,
            color: '#8B7355',
            letterSpacing: '1px',
          }}>
            ◈ AUDIO MEMORY CAPTURED
          </p>
          <audio controls src={audioUrl} className="custom-audio" style={{ width: '100%' }} />
        </div>
      )}
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
          setError('未找到项目')
        }
      } catch (e: any) {
        setError(e?.message ?? '加载失败')
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
        
        // Auto-select first pending question if none selected
        if (!activeQuestionId && questionsData.length > 0) {
            const firstPending = questionsData.find(q => q.status === 'pending')
            if (firstPending) {
                setActiveQuestionId(firstPending.id)
            } else {
                setActiveQuestionId(questionsData[0].id)
            }
        }
      } catch (e: any) {
        setError(e?.message ?? '加载问题失败')
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
          
          // Optional: Auto-advance could go here
          
        } catch (e: any) {
          setRecordingError(e?.message ?? String(e))
          setRecordingStatus('error')
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingStatus('recording')
    } catch (e: any) {
      setRecordingError(e?.message ?? '无法访问麦克风')
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
      setError(e?.message ?? '操作失败')
    }
  }

  function handleSelectQuestion(questionId: string) {
    setActiveQuestionId(questionId)
    setRecordingStatus('idle')
    setAudioUrl(null)
    setRecordingError(null)
  }

  const activeQuestion = questions.find((q) => q.id === activeQuestionId)
  
  if (loading) {
    return (
      <main className="detroit-bg" style={{ minHeight: '100vh', padding: '24px 16px', fontFamily: '"Source Han Serif SC", serif' }}>
         <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <UnifiedNav />
          <div style={{ padding: 40, textAlign: 'center', color: '#8C8377' }}>
             LOADING SYSTEM...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="detroit-bg" style={{
      minHeight: '100vh',
      padding: '24px 16px',
      fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif',
    }}>
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
      }}>
        <UnifiedNav />

        {/* Header Area */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                 <h1 style={{ fontSize: 24, fontWeight: 700, color: '#222' }}>深度补充 / Deep Dive</h1>
                 <p style={{ fontSize: 13, color: '#5A4F43', marginTop: 4 }}>AI 分析出的关键细节补充，完善您的人生故事</p>
            </div>
             <Link
              href="/progress"
              className="cyber-btn"
              style={{ borderRadius: 4, textDecoration: 'none', fontSize: 12 }}
            >
              ◁ 返回进度
            </Link>
        </div>

        {error && (
            <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, marginBottom: 20 }}>
                {error}
            </div>
        )}

        {/* Two Column Layout */}
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
        }} className="two-column-layout">
            
            {/* Left Column: Operation Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {activeQuestion ? (
                    <>
                        {/* Question Card */}
                        <div className="glass-card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                                <div style={{
                                    padding: '6px 12px',
                                    background: 'rgba(184,155,114,0.1)',
                                    color: '#8B7355',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    borderRadius: 4,
                                    border: '1px solid rgba(184,155,114,0.3)',
                                    letterSpacing: '1px',
                                }}>
                                    SUPPLEMENT
                                </div>
                                <div style={{
                                    fontSize: 12,
                                    color: '#5A4F43',
                                    flex: 1,
                                    padding: '6px 0',
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center'
                                }}>
                                     {activeQuestion.related_chapter && <span>📘 {activeQuestion.related_chapter}</span>}
                                     <QuestionTypeTag type={activeQuestion.question_type} />
                                </div>
                            </div>

                            <h3 style={{
                                margin: '0 0 16px',
                                fontSize: 20,
                                fontWeight: 500,
                                color: '#222',
                                lineHeight: 1.5,
                            }}>
                                {activeQuestion.question_text}
                            </h3>

                             {activeQuestion.missing_element_description && (
                                <div style={{
                                    padding: '12px',
                                    background: 'rgba(184, 155, 114, 0.08)',
                                    border: '1px solid rgba(184, 155, 114, 0.2)',
                                    borderRadius: 8,
                                    marginBottom: 16,
                                }}>
                                    <div style={{ fontSize: 11, color: '#8B7355', fontWeight: 600, marginBottom: 4 }}>
                                        💡 补充方向
                                    </div>
                                    <div style={{ fontSize: 12, color: '#5A4F43' }}>
                                        {activeQuestion.missing_element_description}
                                    </div>
                                </div>
                            )}

                             {activeQuestion.media_prompt && (
                                <div style={{
                                    padding: '12px',
                                    background: 'rgba(0, 0, 0, 0.03)',
                                    border: '1px solid rgba(0, 0, 0, 0.06)',
                                    borderRadius: 8,
                                    marginBottom: 16,
                                    fontSize: 12,
                                    color: '#666'
                                }}>
                                    📷 建议配图: {activeQuestion.media_prompt}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                 <button
                                    onClick={() => handleSkip(activeQuestion.id)}
                                    style={{
                                        fontSize: 12,
                                        color: '#999',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    暂时跳过此题
                                </button>
                            </div>
                        </div>

                        {/* Recording Panel */}
                        <RecordingPanel
                            status={recordingStatus}
                            onStart={startRecording}
                            onStop={stopRecording}
                            audioUrl={audioUrl}
                            error={recordingError}
                        />
                    </>
                ) : (
                    <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#8C8377' }}>
                        <div style={{ fontSize: 32, marginBottom: 16 }}>✨</div>
                        <p>请在右侧选择一个问题开始回答</p>
                    </div>
                )}

            </div>

            {/* Right Column: List */}
            <div className="glass-card" style={{
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                maxHeight: 'calc(100vh - 200px)',
                overflow: 'hidden',
            }}>
                 {/* Progress */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#5A4F43',
                            letterSpacing: '1px',
                        }}>COMPLETION STATUS</h3>
                        <span style={{
                            fontSize: 14,
                            color: '#8B7355',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                        }}>{progress.answered} / {progress.total > 0 ? progress.total : '—'}</span>
                    </div>
                    <div className="cyber-progress">
                        <div className="cyber-progress-bar" style={{
                            width: progress.total > 0 ? `${(progress.answered / progress.total) * 100}%` : '0%',
                            background: '#8B7355',
                            boxShadow: 'none'
                        }} />
                    </div>
                </div>

                <div style={{
                    marginBottom: 16,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#556677',
                    letterSpacing: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span style={{
                        width: 6,
                        height: 6,
                        background: '#8B7355',
                        borderRadius: '50%',
                    }} />
                    SUPPLEMENTARY QUESTIONS
                </div>

                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    paddingBottom: 40,
                }}>
                    {questions.map((q, idx) => {
                         const isSelected = activeQuestionId === q.id
                         const isDone = q.status === 'answered'
                         const isSkipped = q.status === 'skipped'

                         return (
                            <button
                                key={q.id}
                                onClick={() => handleSelectQuestion(q.id)}
                                style={{
                                  textAlign: 'left',
                                  padding: '12px 14px',
                                  border: isSelected
                                    ? '1px solid rgba(184,155,114,0.8)'
                                    : isDone
                                      ? '1px solid rgba(0, 255, 136, 0.3)'
                                      : '1px solid rgba(184,155,114,0.1)',
                                  background: isSelected
                                    ? 'rgba(184,155,114,0.15)'
                                    : isDone
                                      ? 'rgba(0, 255, 136, 0.05)'
                                      : 'white',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  gap: 12,
                                  alignItems: 'flex-start',
                                  transition: 'all 0.2s',
                                  opacity: isSkipped && !isSelected ? 0.6 : 1,
                                  boxShadow: isSelected ? '0 0 15px rgba(184,155,114,0.2)' : 'none',
                                }}
                            >
                                <div style={{
                                  width: 24,
                                  height: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  flexShrink: 0,
                                  borderRadius: 3,
                                  border: isDone
                                    ? '1px solid rgba(0, 255, 136, 0.5)'
                                    : '1px solid rgba(184,155,114,0.3)',
                                  background: isDone
                                    ? 'rgba(0, 255, 136, 0.2)'
                                    : 'white',
                                  color: isDone ? '#8B7355' : '#556677',
                                  fontWeight: 700
                                }}>
                                  {isDone ? '✓' : (idx + 1)}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontSize: 13,
                                        color: isSelected ? '#8B7355' : isDone ? '#5A4F43' : '#222',
                                        fontWeight: 500,
                                        lineHeight: 1.4,
                                        marginBottom: 4
                                    }}>
                                        {q.question_text}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        <QuestionTypeTag type={q.question_type} />
                                        {isSkipped && <span style={{ fontSize: 10, color: '#999' }}>(已跳过)</span>}
                                    </div>
                                </div>
                            </button>
                         )
                    })}
                    
                    {questions.length === 0 && (
                         <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
                             暂无补充问题
                         </div>
                    )}
                </div>
            </div>

        </div>
        
        {/* Responsive Style */}
        <style>{`
            @media (max-width: 1024px) {
                .two-column-layout {
                    grid-template-columns: 1fr !important;
                }
            }
        `}</style>
      </div>
    </main>
  )
}
