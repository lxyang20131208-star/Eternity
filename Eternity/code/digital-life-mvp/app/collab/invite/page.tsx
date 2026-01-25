'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchInviteByToken,
  fetchInviteQuestions,
  createCollabComment,
  uploadCollabAudio,
  transcribeCollabAudio,
  type CollabInvite,
  type CollabInviteQuestion,
} from '@/lib/collabApi'

type Question = {
  id: string
  text: string
  chapter: string | null
  ownerAnswer?: string | null
}

function InvitePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<CollabInvite | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [error, setError] = useState<string | null>(null)

  // Recording state
  const [recordingQuestionId, setRecordingQuestionId] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Submission state
  const [contributorName, setContributorName] = useState('')
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Auth state
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Ensure isRecording is false when audioBlob is set
  useEffect(() => {
    if (audioBlob && isRecording) {
      console.log('useEffect: audioBlob exists but isRecording is still true, forcing it to false')
      setIsRecording(false)
    }
  }, [audioBlob, isRecording])

  useEffect(() => {
    async function init() {
      if (!token) {
        setError('Invalid invite link')
        setLoading(false)
        return
      }

      try {
        // Check if user is already authenticated
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setIsAuthenticated(true)
          setUserId(user.id)
          setContributorName(user.email?.split('@')[0] || '')
        }

        // Fetch invite
        const { invite: inviteData, error: inviteError } = await fetchInviteByToken(token)
        if (inviteError || !inviteData) {
          throw new Error('Invite not found or expired')
        }

        setInvite(inviteData)

        // Fetch invite questions
        const { questions: inviteQuestions, error: questionsError } = await fetchInviteQuestions(inviteData.id)
        if (questionsError) {
          throw new Error('Failed to load questions')
        }

        // Fetch full question details
        const questionIds = inviteQuestions.map(iq => iq.question_id)
        const { data: questionsData, error: qError } = await supabase
          .from('questions')
          .select('id, text, chapter')
          .in('id', questionIds)

        if (qError) throw qError

        // If can view owner answers, fetch them
        let questionsWithAnswers = questionsData || []
        if (inviteData.can_view_owner_answer) {
          const { data: answersData } = await supabase
            .from('answer_sessions')
            .select('question_id, transcript_text')
            .eq('project_id', inviteData.project_id)
            .in('question_id', questionIds)

          const answersMap = new Map(
            (answersData || []).map(a => [a.question_id, a.transcript_text])
          )

          questionsWithAnswers = questionsData.map(q => ({
            ...q,
            ownerAnswer: answersMap.get(q.id) || null,
          }))
        }

        setQuestions(questionsWithAnswers)
      } catch (err: any) {
        console.error('Init error:', err)
        setError(err.message || 'Failed to load invite')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [token])

  async function startRecording(questionId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, processing audio...')

        // Stop all tracks first
        stream.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind)
          track.stop()
        })

        // Clear timer
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        // Create blob
        const blob = new Blob(chunksRef.current, { type: 'audio/mp4' })
        console.log('Audio blob created:', blob.size, 'bytes')

        // 使用 setTimeout 确保状态更新在下一个事件循环中执行
        setTimeout(() => {
          console.log('Updating state...')
          setAudioBlob(blob)
          setAudioUrl(URL.createObjectURL(blob))
          setIsRecording(false)
          console.log('State updated: isRecording = false')
        }, 0)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder

      setRecordingQuestionId(questionId)
      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } catch (err: any) {
      console.error('Recording error:', err)
      showToast('Failed to start recording. Please allow microphone access.', 'error')
    }
  }

  function stopRecording() {
    console.log('stopRecording called')

    if (!mediaRecorderRef.current) {
      console.error('No mediaRecorder found')
      return
    }

    const state = mediaRecorderRef.current.state
    console.log('MediaRecorder state:', state)

    if (state === 'recording') {
      console.log('Calling stop() on mediaRecorder')
      mediaRecorderRef.current.stop()
      // 不要在这里设置 setIsRecording(false)
      // 让 onstop 事件处理器来处理状态更新
    } else {
      console.warn('MediaRecorder is not in recording state:', state)
    }
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      if (isRecording) {
        mediaRecorderRef.current.stop()
      }
      setIsRecording(false)
      setRecordingQuestionId(null)
      setAudioBlob(null)
      setAudioUrl(null)
      setRecordingTime(0)

      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  async function handleAuth() {
    if (!authEmail || !authPassword) {
      showToast('Please enter email and password', 'error')
      return
    }

    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        })

        if (error) throw error

        if (data.user) {
          setIsAuthenticated(true)
          setUserId(data.user.id)
          setContributorName(authEmail.split('@')[0])
          setShowAuthModal(false)
          showToast('Account created! You now have 1 month of Plus membership! 🎉', 'success')
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        })

        if (error) throw error

        if (data.user) {
          setIsAuthenticated(true)
          setUserId(data.user.id)
          setContributorName(authEmail.split('@')[0])
          setShowAuthModal(false)
          showToast('Signed in successfully!', 'success')
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Authentication failed', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  async function submitContribution(questionId: string) {
    console.log('=== submitContribution called ===')
    console.log('Question ID:', questionId)
    console.log('Is authenticated:', isAuthenticated)
    console.log('Contributor name:', contributorName)
    console.log('Has audio blob:', !!audioBlob)
    console.log('Comment text:', commentText)

    // Check if user is authenticated
    if (!isAuthenticated) {
      console.log('Not authenticated, showing auth modal')
      setShowAuthModal(true)
      return
    }

    if (!contributorName.trim()) {
      showToast('Please enter your name', 'error')
      return
    }

    if (!audioBlob && !commentText.trim()) {
      showToast('Please record audio or add a comment', 'error')
      return
    }

    setSubmitting(true)
    try {
      let audioStoragePath: string | null = null

      // Upload audio if present
      if (audioBlob) {
        console.log('Uploading audio...')
        const tempCommentId = crypto.randomUUID()
        console.log('Temp comment ID:', tempCommentId)

        const { path, error: uploadError } = await uploadCollabAudio(
          invite.project_id,
          invite.id,
          tempCommentId,
          audioBlob
        )

        if (uploadError) {
          console.error('Audio upload error:', uploadError)
          throw uploadError
        }

        audioStoragePath = path
        console.log('Audio uploaded successfully to:', path)
      }

      // Create comment
      console.log('Creating comment with data:', {
        inviteId: invite.id,
        questionId,
        projectId: invite.project_id,
        contributorName: contributorName.trim(),
        audioStoragePath,
        commentText: commentText.trim() || undefined,
      })

      const { comment, error: commentError } = await createCollabComment({
        inviteId: invite.id,
        questionId,
        projectId: invite.project_id,
        contributorUserId: userId || undefined,
        contributorName: contributorName.trim(),
        audioStoragePath: audioStoragePath || undefined,
        commentText: commentText.trim() || undefined,
      })

      if (commentError || !comment) {
        console.error('Comment creation error:', commentError)
        throw commentError
      }

      console.log('Comment created successfully!', comment.id)

      // Trigger transcription in background if audio was uploaded
      if (audioStoragePath && comment.id) {
        console.log('Starting background transcription...')
        // Don't await - let it run in background
        transcribeCollabAudio(comment.id, audioStoragePath).then(({ error: transcribeError }) => {
          if (transcribeError) {
            console.error('Transcription failed:', transcribeError)
          } else {
            console.log('Transcription completed successfully')
          }
        })
      }

      showToast('贡献已提交！正在转写音频...', 'success')

      // Reset form
      setRecordingQuestionId(null)
      setAudioBlob(null)
      setAudioUrl(null)
      setCommentText('')
      setRecordingTime(0)
    } catch (err: any) {
      console.error('Submit error:', err)
      showToast(err.message || 'Failed to submit', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8F6F2',
      }}>
        <div style={{ textAlign: 'center', color: '#8B7355' }}>
          Loading...
        </div>
      </div>
    )
  }

  if (error || !invite) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8F6F2',
        padding: 20,
      }}>
        <div style={{
          maxWidth: 400,
          padding: 40,
          background: 'white',
          borderRadius: 16,
          textAlign: 'center',
          border: '1px solid rgba(184,155,114,0.2)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600, color: '#222' }}>
            Invalid Invite
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: '#5A4F43' }}>
            {error || 'This invite link is invalid or has expired.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F6F2',
      padding: '40px 20px',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          marginBottom: 32,
          padding: 24,
          background: 'white',
          borderRadius: 16,
          border: '1px solid rgba(184,155,114,0.2)',
        }}>
          <h1 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700, color: '#222' }}>
            👥 Help Complete a Life Story
          </h1>

          {/* Explanation */}
          <div style={{
            padding: 16,
            background: 'linear-gradient(135deg, rgba(184,155,114,0.08), rgba(184,155,114,0.03))',
            borderLeft: '4px solid #8B7355',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 8 }}>
              💡 What is this?
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5A4F43', lineHeight: 1.6 }}>
              You've been invited to contribute <strong>your perspective</strong> to someone's life story.
              Your memories and insights will help add <strong>depth and detail</strong> to their answers—like
              adding color to a sketch.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#5A4F43', lineHeight: 1.6 }}>
              ✨ Share <strong>共同的回忆</strong> (shared memories), specific details, or moments you remember
              that they might have forgotten. Your voice matters!
            </p>
          </div>

          {invite.owner_message && (
            <div style={{
              padding: 12,
              background: 'rgba(76,175,80,0.08)',
              borderRadius: 8,
              fontSize: 14,
              color: '#2E7D32',
              marginBottom: 16,
              fontStyle: 'italic',
            }}>
              💬 "{invite.owner_message}"
            </div>
          )}

          {/* Sign up incentive */}
          {!isAuthenticated && (
            <div style={{
              padding: 14,
              background: 'linear-gradient(135deg, #FFD700, #FFA500)',
              borderRadius: 8,
              marginBottom: 16,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 }}>
                🎁 Special Gift!
              </div>
              <div style={{ fontSize: 13, color: '#1a1a2e' }}>
                Sign up to submit your memory and get <strong>1 month of Plus membership FREE</strong> to try EverArchive yourself!
              </div>
            </div>
          )}

          {/* Name Input - Emphasized */}
          <div style={{
            marginTop: 16,
            padding: 16,
            background: 'rgba(255,215,0,0.08)',
            border: '2px solid rgba(255,215,0,0.3)',
            borderRadius: 12,
          }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#222', marginBottom: 6 }}>
              👤 你的昵称 (必填)
            </label>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#5A4F43', lineHeight: 1.5 }}>
              请输入主用户能够识别的昵称（例如：小明、表姐、李叔叔）。这样对方才知道是谁贡献的回忆。
            </p>
            <input
              type="text"
              value={contributorName}
              onChange={(e) => setContributorName(e.target.value)}
              placeholder="例如：小明、表姐、李叔叔..."
              style={{
                width: '100%',
                padding: 14,
                border: '2px solid rgba(184,155,114,0.4)',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                fontFamily: 'inherit',
                background: 'white',
              }}
            />
          </div>
        </div>

        {/* Questions List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map(question => {
            const isRecordingThis = recordingQuestionId === question.id

            return (
              <div
                key={question.id}
                style={{
                  padding: 24,
                  background: 'white',
                  borderRadius: 16,
                  border: isRecordingThis ? '2px solid #4CAF50' : '1px solid rgba(184,155,114,0.2)',
                }}
              >
                <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: '#222' }}>
                  {question.text}
                </h3>

                {question.ownerAnswer && (
                  <div style={{
                    padding: 12,
                    background: 'rgba(184,155,114,0.03)',
                    borderLeft: '3px solid rgba(184,155,114,0.3)',
                    borderRadius: 4,
                    marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 11, color: '#8B7355', marginBottom: 4, fontWeight: 600 }}>
                      Original Answer:
                    </div>
                    <div style={{ fontSize: 13, color: '#5A4F43' }}>
                      {question.ownerAnswer}
                    </div>
                  </div>
                )}

                {/* Show recording UI if currently recording this question */}
                {isRecordingThis && isRecording ? (
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 16,
                      background: 'rgba(76,175,80,0.1)',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}>
                      <div style={{
                        width: 12,
                        height: 12,
                        background: '#f44336',
                        borderRadius: '50%',
                        animation: 'pulse 1s infinite',
                      }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
                        Recording... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={stopRecording}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        ⏹ Stop Recording
                      </button>
                      <button
                        onClick={cancelRecording}
                        style={{
                          padding: '12px 20px',
                          background: 'white',
                          color: '#f44336',
                          border: '1px solid rgba(255,68,102,0.3)',
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : audioBlob && recordingQuestionId === question.id ? (
                  /* Show submission UI if recording is complete for this question */
                  <div>
                    <div style={{
                      padding: 16,
                      background: 'rgba(76,175,80,0.05)',
                      borderRadius: 8,
                      marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                        ✓ Recording Complete ({recordingTime}s)
                      </div>
                      {audioUrl && (
                        <audio
                          src={audioUrl}
                          controls
                          style={{ width: '100%', marginBottom: 12 }}
                        />
                      )}
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                        Additional Notes (Optional)
                      </label>
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add any additional context..."
                        style={{
                          width: '100%',
                          padding: 12,
                          border: '1px solid rgba(184,155,114,0.3)',
                          borderRadius: 8,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          minHeight: 80,
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => submitContribution(question.id)}
                        disabled={submitting}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: submitting ? '#ccc' : '#4CAF50',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: submitting ? 'wait' : 'pointer',
                        }}
                      >
                        {submitting ? 'Submitting...' : '✓ Submit Contribution'}
                      </button>
                      <button
                        onClick={cancelRecording}
                        disabled={submitting}
                        style={{
                          padding: '12px 20px',
                          background: 'white',
                          color: '#8B7355',
                          border: '1px solid rgba(184,155,114,0.3)',
                          borderRadius: 8,
                          fontSize: 14,
                          cursor: submitting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Re-record
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Show record button if no recording in progress and no audio blob */
                  <button
                    onClick={() => startRecording(question.id)}
                    disabled={recordingQuestionId !== null && recordingQuestionId !== question.id}
                    style={{
                      padding: '12px 20px',
                      background: (recordingQuestionId !== null && recordingQuestionId !== question.id) ? '#ccc' : '#8B7355',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: (recordingQuestionId !== null && recordingQuestionId !== question.id) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>🎙</span> Record Your Memory
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          background: toast.type === 'success' ? '#4CAF50' : '#f44336',
          color: 'white',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          zIndex: 2000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast.text}
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          onClick={() => setShowAuthModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              maxWidth: 450,
              width: '100%',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 700, color: '#222', textAlign: 'center' }}>
              {authMode === 'signup' ? '🎁 Create Account & Get 1 Month Free' : '👋 Welcome Back'}
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: '#5A4F43', textAlign: 'center' }}>
              {authMode === 'signup'
                ? 'Sign up to submit your memory and try EverArchive with 1 month of Plus membership—FREE!'
                : 'Sign in to submit your contribution'}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                Email
              </label>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: 12,
                  border: '1px solid rgba(184,155,114,0.3)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                Password
              </label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: 12,
                  border: '1px solid rgba(184,155,114,0.3)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <button
              onClick={handleAuth}
              disabled={authLoading}
              style={{
                width: '100%',
                padding: '14px',
                background: authLoading ? '#ccc' : (authMode === 'signup' ? 'linear-gradient(135deg, #FFD700, #FFA500)' : '#8B7355'),
                color: authMode === 'signup' ? '#1a1a2e' : 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: authLoading ? 'wait' : 'pointer',
                marginBottom: 16,
              }}
            >
              {authLoading ? 'Please wait...' : (authMode === 'signup' ? '🎁 Sign Up & Get Free Month' : 'Sign In')}
            </button>

            <div style={{ textAlign: 'center', fontSize: 13, color: '#5A4F43' }}>
              {authMode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => setAuthMode('signin')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8B7355',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  Don't have an account?{' '}
                  <button
                    onClick={() => setAuthMode('signup')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8B7355',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Sign Up (Get 1 Month Free!)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

export default function InvitePageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>}>
      <InvitePage />
    </Suspense>
  )
}
