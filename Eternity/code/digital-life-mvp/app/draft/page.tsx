'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type DemoStep = 'idle' | 'recording' | 'transcribing' | 'style' | 'rewriting' | 'book' | 'content_page'

// 文风配置（与 export 页面���致）
const AUTHOR_STYLES = {
  'default': { name: '经典传记', description: '平衡的叙事风格，兼顾文学性与可读性' },
  'hemingway': { name: '海明威', description: '简洁有力，冰山理论，用最少的文字传达最深的情感' },
  'capote': { name: '卡波特', description: '温情细腻，如《圣诞忆旧集》般温暖怀旧的笔触' },
  'zweig': { name: '茨威格', description: '深入人物内心，细腻的心理描写，戏剧性的转折' },
  'zhangailing': { name: '张爱玲', description: '华丽苍凉，独特的比喻，对人性幽微处的洞察' },
  'didion': { name: '琼·狄迪恩', description: '冷静克制，精确观察，在平静叙述中蕴含深情' },
  'kundera': { name: '米兰·昆德拉', description: '哲思深邃，在叙事中穿插对生命本质的思考' },
  'fitzgerald': { name: '菲茨杰拉德', description: '诗意浪漫，华美的语言，对时代与梦想的追忆' }
}

export default function DraftPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)

  const [answer, setAnswer] = useState('')
  const [step, setStep] = useState<DemoStep>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null)
  const [recordingPrompt, setRecordingPrompt] = useState('')
  const [transcribedText, setTranscribedText] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<string>('capote')
  const [rewrittenContent, setRewrittenContent] = useState<{ title: string; content: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isFlipping, setIsFlipping] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const charCount = answer.length
  const isValidAnswer = charCount >= 30 && charCount <= 2000

  // ===== 设计系统 =====
  const colors = {
    bg: '#FDFCFA',
    bgWarm: '#FAF8F5',
    bgAccent: '#F5F2ED',
    text: '#2C2C2C',
    textSecondary: '#6B6B6B',
    textMuted: '#9A9A9A',
    border: '#E8E4DE',
    borderLight: '#F0EDE8',
    accent: '#8B7355',
    accentLight: '#A89070',
  }

  const fonts = {
    serif: '"Source Serif 4", "Noto Serif SC", "Songti SC", Georgia, serif',
    sans: '"Inter", "Noto Sans SC", -apple-system, sans-serif',
  }

  // Bootstrap auth + project
  useEffect(() => {
    async function bootstrap() {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser()
        if (userErr) {
          console.warn('Auth fetch failed, continuing as guest:', userErr.message)
          return
        }
        if (!user) {
          return
        }
        setUserId(user.id)

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)

        if (selErr) {
          console.warn('Project fetch failed:', selErr.message)
          return
        }

        if (list?.[0]?.id) {
          setProjectId(list[0].id)
        }
      } catch (e: any) {
        console.warn('Bootstrap error:', e?.message ?? e)
      }
    }

    bootstrap()
  }, [])

  // 清理媒体流
  useEffect(() => {
    return () => {
      // 组件卸载时停止所有媒体流
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (recordingInterval) {
        clearInterval(recordingInterval)
      }
    }
  }, [])

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  async function startRecording() {
    setError(null)
    setTranscribedText('')
    setStep('recording')
    setRecordingTime(0)
    setRecordingPrompt('')

    try {
      // 先停止之前的流（如果有）
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      // 请求更明确的音频约束，避免系统自动优化导致的中断
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,  // 禁用回声消除，避免系统干预
          noiseSuppression: false,  // 禁用噪音抑制
          autoGainControl: false,   // 禁用自动增益，防止静音检测
        }
      })
      streamRef.current = stream

      // 监听音轨结束事件（调试用）
      stream.getAudioTracks().forEach(track => {
        console.log('[Recording] Audio track started:', track.label, track.readyState)
        track.onended = () => {
          console.warn('[Recording] Audio track ended unexpectedly:', track.label)
        }
        track.onmute = () => {
          console.warn('[Recording] Audio track muted:', track.label)
        }
        track.onunmute = () => {
          console.log('[Recording] Audio track unmuted:', track.label)
        }
      })

      // 使用 timeslice 参数定期收集数据，防止数据丢失
      const recorder = new MediaRecorder(stream)

      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          console.log('[Recording] Data chunk received, size:', e.data.size)
        }
      }

      // 监听录音器状态变化
      recorder.onerror = (e: Event) => {
        console.error('[Recording] MediaRecorder error:', e)
      }

      recorder.onpause = () => {
        console.warn('[Recording] MediaRecorder paused unexpectedly')
      }

      recorder.onstop = async () => {
        console.log('[Recording] MediaRecorder stopped, chunks:', chunksRef.current.length)
        // 停止所有音频轨道
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        await handleRealTranscription(recorder)
      }

      mediaRecorderRef.current = recorder
      // 使用 timeslice=1000ms 每秒收集一次数据，确保即使意外中断也有数据
      recorder.start(1000)
      console.log('[Recording] Started with timeslice 1000ms')

      const interval = setInterval(() => {
        // 检查录音器状态
        if (mediaRecorderRef.current?.state !== 'recording') {
          console.warn('[Recording] Recorder state changed to:', mediaRecorderRef.current?.state)
        }

        setRecordingTime(prev => prev + 1)
      }, 1000)
      setRecordingInterval(interval)
    } catch (e: any) {
      console.error('[Recording] Failed to start:', e)
      setError(e?.message ?? '无法访问麦克风')
      setStep('idle')
    }
  }

  async function handleRealTranscription(recorder: MediaRecorder) {
    try {
      setStep('transcribing')

      if (userId && projectId) {
        await handleTranscriptionWithAuth(recorder)
        return
      }

      // 未登录，尝试创建临时匿名用户
      const { data: { session }, error: signUpError } = await supabase.auth.signUp({
        email: `draft_${crypto.randomUUID()}@temp.user`,
        password: crypto.randomUUID(),
        options: {
          data: {
            is_temporary: true,
            created_for: 'draft_demo'
          }
        }
      })

      if (signUpError || !session) {
        console.warn('临时用户创建失败，使用模拟转写:', signUpError)
        await handleMockTranscription()
        return
      }

      const tempUserId = session.user.id
      setUserId(tempUserId)

      // 创建临时项目
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({
          owner_id: tempUserId,
          name: 'Draft Demo',
        })
        .select('id')
        .single()

      if (projectError || !newProject) {
        console.warn('临时项目创建失败，使用模拟转写:', projectError)
        await handleMockTranscription()
        return
      }

      const tempProjectId = newProject.id
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      const sessionId = crypto.randomUUID()

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')

      const objectPath = `projects/${tempProjectId}/audio_raw/${yyyy}/${mm}/${sessionId}.webm`

      // 上传音频
      const { error: uploadError } = await supabase.storage.from('vault').upload(objectPath, blob, {
        contentType: blob.type || 'audio/webm',
        upsert: false,
      })

      if (uploadError) throw uploadError

      // 创建 answer session
      const { error: dbErr } = await supabase.from('answer_sessions').insert({
        id: sessionId,
        project_id: tempProjectId,
        question_id: 'draft_demo',
        audio_object_key: objectPath,
        status: 'uploaded',
        round_number: 0,
      })

      if (dbErr) throw dbErr

      // 触发转写
      const { error: transcribeErr } = await supabase.functions.invoke('transcribe_session', {
        body: { session_id: sessionId },
      })

      if (transcribeErr) throw transcribeErr

      // 轮询获取转写结果
      let attempts = 0
      const maxAttempts = 90 // 增加到3分钟

      console.log('开始轮询转写结果，session_id:', sessionId)

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000))

        const { data: sessionData, error: queryError } = await supabase
          .from('answer_sessions')
          .select('transcript_text, status, error_text')
          .eq('id', sessionId)
          .single()

        if (queryError) {
          console.error('查询转写结果失败:', queryError)
        } else {
          console.log(`轮询第 ${attempts + 1} 次，状态:`, sessionData?.status)
        }

        if (sessionData?.transcript_text) {
          console.log('转写成功，文本长度:', sessionData.transcript_text.length)
          setTranscribedText(sessionData.transcript_text)
          setAnswer(sessionData.transcript_text)
          setStep('style')
          return
        }

        if (sessionData?.status === 'failed') {
          const errorMsg = sessionData?.error_text || '转写失败，请重试'
          console.error('转写失败:', errorMsg)
          throw new Error(errorMsg)
        }

        attempts++
      }

      console.error('转写超时，已尝试', maxAttempts, '次')
      throw new Error('转写超时，请重试')
    } catch (e: any) {
      console.warn('真实转写失败，回退到模拟转写:', e?.message)
      await handleMockTranscription()
    }
  }

  async function handleTranscriptionWithAuth(recorder: MediaRecorder) {
    try {
      setStep('transcribing')

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      console.log('[handleTranscriptionWithAuth] Audio blob size:', blob.size, 'bytes')

      const sessionId = crypto.randomUUID()

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')

      const objectPath = `projects/${projectId}/audio_raw/${yyyy}/${mm}/${sessionId}.webm`

      // Upload audio
      console.log('[handleTranscriptionWithAuth] Uploading audio to:', objectPath)
      const { error: uploadError } = await supabase.storage.from('vault').upload(objectPath, blob, {
        contentType: blob.type || 'audio/webm',
        upsert: false,
      })

      if (uploadError) {
        console.error('[handleTranscriptionWithAuth] Upload failed:', uploadError)
        throw uploadError
      }
      console.log('[handleTranscriptionWithAuth] Upload successful')

      // Create answer session
      const { error: dbErr } = await supabase.from('answer_sessions').insert({
        id: sessionId,
        project_id: projectId,
        question_id: 'draft_demo',
        audio_object_key: objectPath,
        status: 'uploaded',
        round_number: 0,
      })

      if (dbErr) {
        console.error('[handleTranscriptionWithAuth] Insert session failed:', dbErr)
        throw dbErr
      }
      console.log('[handleTranscriptionWithAuth] Session created:', sessionId)

      // Trigger transcription
      console.log('[handleTranscriptionWithAuth] Invoking transcribe_session function')
      const { error: transcribeErr } = await supabase.functions.invoke('transcribe_session', {
        body: { session_id: sessionId },
      })

      if (transcribeErr) {
        console.error('[handleTranscriptionWithAuth] Transcribe function failed:', transcribeErr)
        throw transcribeErr
      }
      console.log('[handleTranscriptionWithAuth] Transcribe function invoked')

      // Poll for transcription result
      let attempts = 0
      const maxAttempts = 90

      console.log('[handleTranscriptionWithAuth] Starting to poll for results, session_id:', sessionId)

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000))

        const { data: session, error: queryError } = await supabase
          .from('answer_sessions')
          .select('transcript_text, status, error_text')
          .eq('id', sessionId)
          .single()

        if (queryError) {
          console.error('[handleTranscriptionWithAuth] Query error:', queryError)
        } else {
          console.log(`[handleTranscriptionWithAuth] Poll ${attempts + 1}/${maxAttempts}, status:`, session?.status)
        }

        if (session?.transcript_text) {
          console.log('[handleTranscriptionWithAuth] Transcription complete, text length:', session.transcript_text.length)
          setTranscribedText(session.transcript_text)
          setAnswer(session.transcript_text)
          setStep('style')
          return
        }

        if (session?.status === 'failed') {
          const errorMsg = session?.error_text || '转写失败，请重试'
          console.error('[handleTranscriptionWithAuth] Transcription failed:', errorMsg)
          throw new Error(errorMsg)
        }

        attempts++
      }

      console.error('[handleTranscriptionWithAuth] Polling timeout after', maxAttempts, 'attempts')
      throw new Error('转写超时，请重试')
    } catch (e: any) {
      console.error('[handleTranscriptionWithAuth] Error:', e)
      setError(e?.message ?? '转写失败')
      setStep('idle')
    }
  }

  async function handleMockTranscription() {
    setStep('transcribing')

    setTimeout(() => {
      const mockTexts = [
        '我记得那年冬天特别冷，奶奶每天早上五点就起来，在厨房里忙活。她说冬天要多吃点热乎的，身体才能暖和。那时候我还小，总喜欢赖在被窝里，听着厨房传来锅碗瓢盆的声音。有一天我悄悄爬起来，看见奶奶在擀饺子皮，手上的面粉像雪一样。她看见我，笑着说：来，奶奶教你包饺子。那是我第一次学会包饺子，虽然包得歪歪扭扭，但奶奶说那是最好看的。',
        '父亲是个沉默寡言的人，他不太会表达感情。但我记得有一次，我考试没考好，回家的路上一直在哭。他在门口等我，什么都没说，只是牵着我的手去买了一根冰棍。那天的夕阳特别红，我们走了很远的路，他始终握着我的手。后来我才明白，那是他表达爱的方式。',
        '搬来这个城市已经十年了，有时候会想起老家的样子。门前有一棵老槐树，夏天的时候，全村的人都喜欢在树下乘凉。我小时候总爱爬上去，坐在最高的枝丫上看远方。那时候觉得远方很神秘，充满了可能性。现在我到了远方，却常常梦见那棵老槐树。',
      ]
      const text = mockTexts[Math.floor(Math.random() * mockTexts.length)]
      setTranscribedText(text)
      setAnswer(text)
      setStep('style')
    }, 2500)
  }

  function stopRecording() {
    if (recordingInterval) {
      clearInterval(recordingInterval)
      setRecordingInterval(null)
    }
    mediaRecorderRef.current?.stop()
  }

  async function generateWithStyle() {
    setStep('rewriting')

    try {
      console.log('开始改写，内容长度:', answer.length, '文风:', selectedStyle)

      // 调用 AI 改写 API
      const response = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: answer,
          style: selectedStyle,
        }),
      })

      const responseText = await response.text()
      console.log('API 响应状态:', response.status, '响应内容:', responseText)

      if (!response.ok) {
        console.error('API 请求失败:', response.status, responseText)
        throw new Error(`改写失败 (${response.status}): ${responseText}`)
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('JSON 解析失败:', parseError, '原始响应:', responseText)
        throw new Error('服务器返回格式错误')
      }

      console.log('改写结果:', data)

      setRewrittenContent({
        title: data.title || '第一章',
        content: data.content || answer,
      })
      setStep('book')
    } catch (e: any) {
      console.error('改写失败，使用前端模拟:', e)
      // 如果 API 调用失败，使用前端模拟改写
      simulateStyleRewrite()
    }
  }

  function simulateStyleRewrite() {
    setStep('rewriting')

    setTimeout(() => {
      const styleConfig = AUTHOR_STYLES[selectedStyle as keyof typeof AUTHOR_STYLES] || AUTHOR_STYLES.default

      let rewrittenTitle = '第一章'
      let rewrittenContent = answer

      // 根据不同风格进行简单的文本处理
      switch (selectedStyle) {
        case 'hemingway':
          rewrittenTitle = '那一页'
          // 简化句子，去除修饰词
          rewrittenContent = answer
            .replace(/很|非常|特别|十分/g, '')
            .replace(/[。！]/g, '。')
          break
        case 'capote':
          rewrittenTitle = '温暖的记忆'
          // 保持温暖感
          rewrittenContent = answer
          break
        case 'zweig':
          rewrittenTitle = '心灵的回响'
          // 增加心理描写的引导语
          rewrittenContent = `我想，这就是记忆。\n\n${answer}\n\n那一刻，在我心中留下了深刻的印记。`
          break
        case 'zhangailing':
          rewrittenTitle = '旧时光'
          // 增加苍凉感
          rewrittenContent = `${answer}\n\n岁月如流，这些片段终究成了泛黄的旧照片。`
          break
        case 'didion':
          rewrittenTitle = '记录'
          // 冷静客观
          rewrittenContent = answer.replace(/[！]/g, '。')
          break
        case 'kundera':
          rewrittenTitle = '存在的瞬间'
          // 增加哲思
          rewrittenContent = `${answer}\n\n或许，这就是生命中那些看似平常却意味深长的时刻。`
          break
        case 'fitzgerald':
          rewrittenTitle = '追忆'
          // 增加诗意
          rewrittenContent = `那是一个特别的时刻。\n\n${answer}\n\n如同梦境一般，永远留在了记忆里。`
          break
        default:
          rewrittenTitle = '第一章'
          rewrittenContent = answer
      }

      setRewrittenContent({
        title: rewrittenTitle,
        content: rewrittenContent,
      })
      setStep('book')
    }, 2000)
  }

  function handleFlipToContent() {
    setIsFlipping(true)
    setTimeout(() => {
      setStep('content_page')
      setIsFlipping(false)
    }, 600)
  }

  function handleBackToCover() {
    setIsFlipping(true)
    setTimeout(() => {
      setStep('book')
      setIsFlipping(false)
    }, 600)
  }

  function resetDemo() {
    setStep('idle')
    setRecordingTime(0)
    setTranscribedText('')
    setSelectedStyle('capote')
    setRewrittenContent(null)
    setRecordingPrompt('')
    setError(null)
    setAnswer('')
    setIsFlipping(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      fontFamily: fonts.sans,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px',
    }}>
      <div style={{
        maxWidth: 560,
        width: '100%',
      }}>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 0',
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: 40,
            textDecoration: 'none',
          }}
        >
          ← 返回
        </Link>

        {(step === 'idle' || step === 'recording' || step === 'transcribing' || step === 'style' || step === 'rewriting') && (
          <>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 'clamp(22px, 4vw, 28px)',
              fontWeight: 400,
              color: colors.text,
              lineHeight: 1.5,
              marginBottom: 12,
            }}>
              写下一件关于家人的事，
              <br />
              你不希望它被忘记。
            </h2>

            <p style={{
              fontSize: 14,
              color: colors.textMuted,
              marginBottom: 24,
            }}>
              可以是一个场景、一句话、或一种感觉
            </p>
          </>
        )}

        {/* 录音模块 */}
        {(step === 'idle' || step === 'recording' || step === 'transcribing') && (
          <div style={{
            background: colors.bgWarm,
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            padding: '32px',
            marginBottom: 24,
          }}>
            {error && (
              <div style={{
                background: '#FEE2E2',
                color: '#DC2626',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {step === 'idle' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{
                  fontSize: 15,
                  color: colors.textMuted,
                  lineHeight: 1.8,
                  marginBottom: 24,
                }}>
                  建议时长：20-30 秒
                  <br />
                  一次讲一个具体的故事片段
                </p>
                <button
                  onClick={startRecording}
                  style={{
                    padding: '16px 40px',
                    background: colors.bgAccent,
                    color: colors.text,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 400,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.accent
                    e.currentTarget.style.color = '#fff'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.bgAccent
                    e.currentTarget.style.color = colors.text
                  }}
                >
                  <span style={{ fontSize: 18 }}>🎙️</span>
                  开始录音
                </button>
              </div>
            )}

            {step === 'recording' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 48,
                  fontFamily: fonts.sans,
                  fontWeight: 300,
                  color: colors.text,
                  marginBottom: 16,
                  letterSpacing: '0.05em',
                }}>
                  {formatTime(recordingTime)}
                </div>

                <p style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  minHeight: 20,
                  marginBottom: 32,
                }}>
                  {recordingPrompt || '正在倾听你的故事...'}
                </p>

                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 40,
                }}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: 30,
                        background: colors.accent,
                        borderRadius: 2,
                        animation: `wave 1.2s ease-in-out ${i * 0.1}s infinite`,
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={stopRecording}
                  style={{
                    padding: '14px 40px',
                    background: colors.text,
                    color: colors.bg,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.accent
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.text
                  }}
                >
                  完成录音
                </button>
              </div>
            )}

            {step === 'transcribing' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 40,
                  height: 40,
                  margin: '0 auto 24px',
                  border: `2px solid ${colors.borderLight}`,
                  borderTopColor: colors.accent,
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <p style={{
                  fontSize: 15,
                  color: colors.textMuted,
                }}>
                  正在整理你说的话...
                </p>
              </div>
            )}
          </div>
        )}

        {/* 文本编辑框 */}
        {(step === 'idle' || step === 'transcribing' || step === 'style') && (
          <>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="比如：每年冬至，奶奶都会包饺子。她总是把馅儿调得很香，皮儿擀得很薄。那时候全家人围坐在一起，厨房里热气腾腾的……"
              style={{
                width: '100%',
                minHeight: 200,
                padding: 24,
                background: colors.bgWarm,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                color: colors.text,
                fontSize: 16,
                lineHeight: 1.9,
                fontFamily: fonts.serif,
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = colors.accent
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = colors.border
              }}
            />

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              marginBottom: 32,
            }}>
              <span style={{
                fontSize: 13,
                color: charCount < 30 ? '#c9a87c' : colors.textMuted,
              }}>
                {charCount < 30 ? `至少需要 30 字` : `${charCount} 字`}
              </span>
              <span style={{
                fontSize: 13,
                color: colors.textMuted,
              }}>
                写你想到的就好
              </span>
            </div>
          </>
        )}

        {/* 文风选择 */}
        {step === 'style' && (
          <div style={{
            background: colors.bgWarm,
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            padding: '32px',
            marginBottom: 24,
          }}>
            <p style={{
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 32,
            }}>
              你想用什么样的文笔写这一页？
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              marginBottom: 24,
            }}>
              {Object.entries(AUTHOR_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  onClick={() => setSelectedStyle(key)}
                  style={{
                    padding: '16px 20px',
                    background: selectedStyle === key ? colors.accent : colors.bgAccent,
                    color: selectedStyle === key ? '#fff' : colors.text,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{style.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{style.description}</div>
                </button>
              ))}
            </div>

            <button
              onClick={generateWithStyle}
              disabled={!isValidAnswer}
              style={{
                width: '100%',
                padding: '16px 32px',
                background: isValidAnswer ? colors.text : colors.bgAccent,
                color: isValidAnswer ? colors.bg : colors.textMuted,
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: isValidAnswer ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
              }}
            >
              生成我的书页
            </button>
          </div>
        )}

        {/* 改写中 */}
        {step === 'rewriting' && (
          <div style={{
            background: colors.bgWarm,
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
            padding: '48px 32px',
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <div style={{
              width: 40,
              height: 40,
              margin: '0 auto 24px',
              border: `2px solid ${colors.borderLight}`,
              borderTopColor: colors.accent,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{
              fontSize: 15,
              color: colors.textSecondary,
              marginBottom: 8,
            }}>
              正在用 {AUTHOR_STYLES[selectedStyle as keyof typeof AUTHOR_STYLES]?.name} 的风格改写...
            </p>
            <p style={{
              fontSize: 13,
              color: colors.textMuted,
            }}>
              这可能需要几秒钟
            </p>
          </div>
        )}

        {/* 书本展示 - 封面 */}
        {step === 'book' && rewrittenContent && (
          <div style={{ marginTop: 40 }}>
            <div style={{
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              padding: '60px 40px',
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* 装饰线 */}
              <div style={{
                position: 'absolute',
                top: 40,
                left: 40,
                right: 40,
                height: 1,
                background: colors.border,
              }} />
              <div style={{
                position: 'absolute',
                bottom: 40,
                left: 40,
                right: 40,
                height: 1,
                background: colors.border,
              }} />

              {/* 书名 */}
              <h1 style={{
                fontFamily: fonts.serif,
                fontSize: 36,
                fontWeight: 400,
                color: colors.text,
                marginBottom: 16,
                letterSpacing: '0.1em',
              }}>
                永恒档案
              </h1>

              {/* 副标题 */}
              <p style={{
                fontSize: 14,
                color: colors.textMuted,
                marginBottom: 40,
                letterSpacing: '0.05em',
              }}>
                {AUTHOR_STYLES[selectedStyle as keyof typeof AUTHOR_STYLES]?.name}
              </p>

              {/* 章节标题 */}
              <div style={{
                fontFamily: fonts.serif,
                fontSize: 24,
                color: colors.textSecondary,
                marginBottom: 60,
              }}>
                {rewrittenContent.title}
              </div>

              {/* 翻页按钮 */}
              <button
                onClick={handleFlipToContent}
                style={{
                  padding: '12px 32px',
                  background: colors.text,
                  color: colors.bg,
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  opacity: isFlipping ? 0.5 : 1,
                }}
              >
                翻开阅读 →
              </button>

              {/* 重置按钮 */}
              <button
                onClick={resetDemo}
                style={{
                  marginTop: 24,
                  padding: '12px 24px',
                  background: 'transparent',
                  color: colors.textMuted,
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                再试一次
              </button>
            </div>
          </div>
        )}

        {/* 书本展示 - 内容页 */}
        {step === 'content_page' && rewrittenContent && (
          <div style={{ marginTop: 40 }}>
            <div style={{
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              padding: '60px 48px',
              minHeight: 500,
              position: 'relative',
            }}>
              {/* 页码 */}
              <div style={{
                position: 'absolute',
                top: 24,
                right: 48,
                fontSize: 11,
                color: colors.textMuted,
                letterSpacing: '0.1em',
              }}>
                — 1 —
              </div>

              {/* 章节标题 */}
              <h2 style={{
                fontFamily: fonts.serif,
                fontSize: 20,
                fontWeight: 400,
                color: colors.text,
                marginBottom: 40,
                textAlign: 'center',
                letterSpacing: '0.05em',
              }}>
                {rewrittenContent.title}
              </h2>

              {/* 正文 */}
              <div style={{
                fontSize: 15,
                lineHeight: 2,
                color: colors.text,
                whiteSpace: 'pre-wrap',
                textIndent: '2em',
                textAlign: 'justify',
              }}>
                {rewrittenContent.content.split('\n\n').map((paragraph, idx) => (
                  <p key={idx} style={{
                    marginBottom: idx < rewrittenContent.content.split('\n\n').length - 1 ? '1.5em' : 0,
                    textIndent: '2em',
                  }}>
                    {paragraph}
                  </p>
                ))}
              </div>

              {/* 返回封面按钮 */}
              <div style={{
                marginTop: 60,
                textAlign: 'center',
              }}>
                <button
                  onClick={handleBackToCover}
                  style={{
                    padding: '12px 32px',
                    background: colors.bgAccent,
                    color: colors.text,
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    opacity: isFlipping ? 0.5 : 1,
                  }}
                >
                  ← 返回封面
                </button>
              </div>
            </div>

            {/* 底部引导 */}
            <div style={{
              marginTop: 40,
              textAlign: 'center',
            }}>
              <p style={{
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 1.8,
                marginBottom: 8,
              }}>
                你刚刚写的，只是一个开始。
              </p>
              <p style={{
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 1.8,
                marginBottom: 24,
              }}>
                很多人，会把这一页，慢慢写成一本书。
              </p>

              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
              }}>
                <Link
                  href="/Buy"
                  style={{
                    padding: '12px 28px',
                    background: colors.bgAccent,
                    color: colors.text,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 400,
                    textDecoration: 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  继续写下去
                </Link>
                <button
                  onClick={resetDemo}
                  style={{
                    padding: '12px 28px',
                    background: 'transparent',
                    color: colors.textMuted,
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 400,
                    cursor: 'pointer',
                  }}
                >
                  再试一次
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 30px; }
          50% { height: 50px; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
