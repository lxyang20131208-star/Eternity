'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type Question = {
  question_id: string
  question_text: string
  question_order: number
  already_done_count: number
  remaining_count: number
  total_count: number
}

function ElderPage() {
  const searchParams = useSearchParams()
  const uid = searchParams.get('uid')
  const k = searchParams.get('k')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [allDone, setAllDone] = useState(false)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [uploading, setUploading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const maxRecordingTime = 10 * 60 // 10 minutes max

  // Auto-read question when loaded
  useEffect(() => {
    if (question && 'speechSynthesis' in window) {
      setTimeout(() => {
        readQuestion()
      }, 500)
    }
  }, [question])

  useEffect(() => {
    async function init() {
      if (!uid || !k) {
        setError('无效的链接')
        setLoading(false)
        return
      }

      try {
        // Verify token and get session
        const verifyRes = await fetch('/api/elder/verify-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid, token: k }),
        })

        if (!verifyRes.ok) {
          throw new Error('链接已失效，请联系家人重新生成')
        }

        // Load first question
        await loadNextQuestion()
      } catch (err: any) {
        console.error('Init error:', err)
        setError(err.message || '加载失败')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [uid, k])

  async function loadNextQuestion() {
    try {
      const res = await fetch('/api/elder/next-question')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '加载问题失败')
      }

      if (data.done) {
        setAllDone(true)
        setQuestion(null)
        return
      }

      setQuestion(data)
      setAudioBlob(null)
      setRecordingTime(0)
    } catch (err: any) {
      console.error('Load question error:', err)
      setError(err.message)
    }
  }

  function readQuestion() {
    if (!question || !('speechSynthesis' in window)) return

    window.speechSynthesis.cancel() // Cancel any ongoing speech

    // Get available voices
    const voices = window.speechSynthesis.getVoices()

    // Find best Chinese voice (prefer natural sounding ones)
    // Priority: Google/Microsoft natural voices > system voices
    const preferredVoices = [
      'Google 普通话（中国大陆）',
      'Microsoft Yunxi Online (Natural) - Chinese (Mainland)',
      'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
      'Ting-Ting', // macOS
      'Sin-ji', // macOS female
      'zh-CN', // Generic Chinese
    ]

    let selectedVoice = voices.find(voice =>
      voice.lang.includes('zh') &&
      (voice.name.includes('Natural') || voice.name.includes('普通话'))
    )

    // Fallback: any Chinese voice
    if (!selectedVoice) {
      selectedVoice = voices.find(voice =>
        voice.lang.includes('zh-CN') || voice.lang.includes('zh')
      )
    }

    const utterance = new SpeechSynthesisUtterance(question.question_text)
    utterance.lang = 'zh-CN'
    utterance.rate = 0.85 // Slower for elderly (0.85 is more natural than 0.9)
    utterance.pitch = 1.1 // Slightly higher pitch for clarity
    utterance.volume = 1.0 // Max volume

    if (selectedVoice) {
      utterance.voice = selectedVoice
      console.log('[TTS] Using voice:', selectedVoice.name)
    }

    window.speechSynthesis.speak(utterance)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setIsRecording(false)

        stream.getTracks().forEach(track => track.stop())

        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }

        // Auto upload
        uploadRecording(blob)
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder

      setIsRecording(true)
      setRecordingTime(0)

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1
          // Auto-stop at max recording time
          if (newTime >= maxRecordingTime) {
            stopRecording()
          }
          return newTime
        })
      }, 1000)
    } catch (err: any) {
      console.error('Recording error:', err)
      alert('无法启动录音，请允许麦克风权限')
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
    }
  }

  async function uploadRecording(blob: Blob) {
    if (!question) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('question_id', question.question_id)
      formData.append('audio_file', blob, 'recording.webm')
      formData.append('duration_ms', String(recordingTime * 1000))

      const res = await fetch('/api/elder/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || '上传失败')
      }

      // Success! Load next question after 1 second
      setTimeout(() => {
        loadNextQuestion()
        setUploading(false)
      }, 1000)
    } catch (err: any) {
      console.error('Upload error:', err)
      setUploading(false)
      alert(err.message || '上传失败，请重试')
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
        padding: 20,
      }}>
        <div style={{ fontSize: 28, color: '#8B7355' }}>加载中...</div>
      </div>
    )
  }

  if (error) {
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
          maxWidth: 500,
          padding: 40,
          background: 'white',
          borderRadius: 20,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 60, marginBottom: 20 }}>⚠️</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#222', marginBottom: 16 }}>
            出错了
          </div>
          <div style={{ fontSize: 18, color: '#5A4F43' }}>
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (allDone) {
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
          maxWidth: 500,
          padding: 40,
          background: 'white',
          borderRadius: 20,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>🎉</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#222', marginBottom: 16 }}>
            全部完成！
          </div>
          <div style={{ fontSize: 20, color: '#5A4F43', lineHeight: 1.6 }}>
            所有问题都已回答完毕，感谢您的分享！
          </div>
        </div>
      </div>
    )
  }

  if (!question) {
    return null
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F6F2',
      padding: '32px 20px',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          marginBottom: 32,
          textAlign: 'center',
        }}>
          <h1 style={{
            margin: '0 0 12px',
            fontSize: 36,
            fontWeight: 700,
            color: '#222',
          }}>
            今天录一段
          </h1>
          <div style={{
            fontSize: 20,
            color: '#8B7355',
          }}>
            已完成 {question.already_done_count} / 剩余 {question.remaining_count}
          </div>
        </div>

        {/* Question Card */}
        <div style={{
          padding: 32,
          background: 'white',
          borderRadius: 20,
          border: '2px solid rgba(184,155,114,0.2)',
          marginBottom: 24,
        }}>
          <div style={{
            fontSize: 32,
            fontWeight: 600,
            color: '#222',
            lineHeight: 1.6,
            marginBottom: 24,
          }}>
            {question.question_text}
          </div>

          <button
            onClick={readQuestion}
            disabled={isRecording || uploading}
            style={{
              padding: '16px 32px',
              background: 'rgba(184,155,114,0.1)',
              border: '2px solid rgba(184,155,114,0.3)',
              borderRadius: 12,
              fontSize: 20,
              fontWeight: 600,
              color: '#8B7355',
              cursor: isRecording || uploading ? 'not-allowed' : 'pointer',
              opacity: isRecording || uploading ? 0.5 : 1,
            }}
          >
            🔊 再读一遍
          </button>
        </div>

        {/* Recording Controls */}
        {uploading ? (
          <div style={{
            padding: 40,
            background: 'rgba(76,175,80,0.1)',
            borderRadius: 20,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 60, marginBottom: 16 }}>📤</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#222' }}>
              正在上传...
            </div>
            <div style={{ fontSize: 18, color: '#5A4F43', marginTop: 8 }}>
              请不要关闭页面
            </div>
          </div>
        ) : isRecording ? (
          <div>
            <div style={{
              padding: 32,
              background: 'rgba(244,67,54,0.1)',
              borderRadius: 20,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 48,
                fontWeight: 700,
                color: '#f44336',
                marginBottom: 8,
              }}>
                {formatTime(recordingTime)}
              </div>
              <div style={{ fontSize: 20, color: '#5A4F43' }}>
                录音中...
              </div>
            </div>
            <button
              onClick={stopRecording}
              style={{
                width: '100%',
                minHeight: 100,
                padding: '24px',
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 20,
                fontSize: 32,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(76,175,80,0.3)',
              }}
            >
              ⏹ 结束录音
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            style={{
              width: '100%',
              minHeight: 120,
              padding: '32px',
              background: '#8B7355',
              color: 'white',
              border: 'none',
              borderRadius: 20,
              fontSize: 36,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(139,115,85,0.3)',
            }}
          >
            ● 开始录音
          </button>
        )}
      </div>
    </div>
  )
}

export default function ElderPageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>}>
      <ElderPage />
    </Suspense>
  )
}
