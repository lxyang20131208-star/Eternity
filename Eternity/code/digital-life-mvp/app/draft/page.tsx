'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'

type DemoStep = 'idle' | 'recording' | 'transcribing' | 'style' | 'rewriting' | 'book' | 'content_page'

// 文风配置
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

  // 清理媒体流
  useEffect(() => {
    return () => {
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        await handleRealTranscription(recorder)
      }

      mediaRecorderRef.current = recorder
      recorder.start(1000)

      const interval = setInterval(() => {
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

      // 直接使用本地 API 进行转写，不需要认证
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      
      console.log('[Draft] Starting transcription, blob size:', blob.size, 'type:', blob.type)

      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')

      const response = await fetch('/api/draft/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[Draft] Transcription API error:', response.status, errorData)
        throw new Error(errorData.error || '转写失败')
      }

      const data = await response.json()
      
      if (data.transcript) {
        console.log('[Draft] Transcription successful, length:', data.transcript.length)
        setTranscribedText(data.transcript)
        setAnswer(data.transcript)
        setStep('style')
      } else {
        throw new Error('转写结果为空')
      }
    } catch (e: any) {
      console.error('[Draft] Transcription failed:', e)
      // 如果 API 失败，回退到模拟转写
      await handleMockTranscription()
    }
  }

  async function handleMockTranscription() {
    setStep('transcribing')
    setTimeout(() => {
      const mockTexts = [
        '我记得那年冬天特别冷，奶奶每天早上五点就起来，在厨房里忙活。她说冬天要多吃点热乎的，身体才能暖和。那时候我还小，总喜欢赖在被窝里，听着厨房传来锅碗瓢盆的声音。有一天我悄悄爬起来，看见奶奶在擀饺子皮，手上的面粉像雪一样。她看见我，笑着说：来，奶奶教你包饺子。那是我第一次学会包饺子，虽然包得歪歪扭扭，但奶奶说那是最好看的。',
        '父亲是个沉默寡言的人，他不太会表达感情。但我记得有一次，我考试没考好，回家的路上一直在哭。他在门口等我，什么都没说，只是牵着我的手去买了一根冰棍。那天的夕阳特别红，我们走了很远的路，他始终握着我的手。后来我才明白，那是他表达爱的方式。',
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
      const response = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: answer, style: selectedStyle }),
      })
      
      if (!response.ok) throw new Error('Rewrite failed')
      
      const data = await response.json()
      setRewrittenContent({
        title: data.title || '第一章',
        content: data.content || answer,
      })
      setStep('book')
    } catch (e: any) {
      simulateStyleRewrite()
    }
  }

  function simulateStyleRewrite() {
    setStep('rewriting')
    setTimeout(() => {
      let rewrittenTitle = '第一章'
      let rewrittenContent = answer
      switch (selectedStyle) {
        case 'hemingway': rewrittenTitle = '那一页'; break;
        case 'capote': rewrittenTitle = '温暖的记忆'; break;
        case 'zweig': rewrittenTitle = '心灵的回响'; rewrittenContent = `我想，这就是记忆。\n\n${answer}\n\n那一刻，在我心中留下了深刻的印记。`; break;
        case 'zhangailing': rewrittenTitle = '旧时光'; rewrittenContent = `${answer}\n\n岁月如流，这些片段终究成了泛黄的旧照片。`; break;
        case 'didion': rewrittenTitle = '记录'; break;
        case 'kundera': rewrittenTitle = '存在的瞬间'; rewrittenContent = `${answer}\n\n或许，这就是生命中那些看似平常却意味深长的时刻。`; break;
        case 'fitzgerald': rewrittenTitle = '追忆'; rewrittenContent = `那是一个特别的时刻。\n\n${answer}\n\n如同梦境一般，永远留在了记忆里。`; break;
        default: rewrittenTitle = '第一章'; rewrittenContent = answer;
      }
      setRewrittenContent({ title: rewrittenTitle, content: rewrittenContent })
      setStep('book')
    }, 2000)
  }

  function handleFlipToContent() {
    setIsFlipping(true)
    // Delay matches CSS transition
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

  // 计算视图状态
  const isBookMode = step === 'book' || step === 'content_page'
  const isExpanded = step === 'content_page'

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

        {/* 录音/编辑流程 (非书籍模式时显示) */}
        {!isBookMode && (
          <>
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
                  写下一件关于家人的事，<br />你不希望它被忘记。
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
                    <p style={{ fontSize: 15, color: colors.textMuted, lineHeight: 1.8, marginBottom: 24 }}>
                      建议时长：20-30 秒<br />一次讲一个具体的故事片段
                    </p>
                    <button onClick={startRecording} style={{
                      padding: '16px 40px', background: colors.bgAccent, color: colors.text,
                      border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 400,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 18 }}>🎙️</span> 开始录音
                    </button>
                  </div>
                )}

                {step === 'recording' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, fontFamily: fonts.sans, fontWeight: 300, color: colors.text, marginBottom: 16 }}>
                      {formatTime(recordingTime)}
                    </div>
                    <p style={{ fontSize: 14, color: colors.textMuted, minHeight: 20, marginBottom: 32 }}>
                      {recordingPrompt || '正在倾听你的故事...'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 40 }}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} style={{
                          width: 4, height: 30, background: colors.accent, borderRadius: 2,
                          animation: `wave 1.2s ease-in-out ${i * 0.1}s infinite`,
                        }} />
                      ))}
                    </div>
                    <button onClick={stopRecording} style={{
                      padding: '14px 40px', background: colors.text, color: colors.bg,
                      border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: 'pointer',
                    }}>
                      完成录音
                    </button>
                  </div>
                )}

                {step === 'transcribing' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: 40, height: 40, margin: '0 auto 24px',
                      border: `2px solid ${colors.borderLight}`, borderTopColor: colors.accent,
                      borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                    <p style={{ fontSize: 15, color: colors.textMuted }}>正在整理你说的话...</p>
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
                  placeholder="比如：每年冬至，奶奶都会包饺子..."
                  style={{
                    width: '100%', minHeight: 200, padding: 24, background: colors.bgWarm,
                    border: `1px solid ${colors.border}`, borderRadius: 12, color: colors.text,
                    fontSize: 16, lineHeight: 1.9, fontFamily: fonts.serif, resize: 'vertical', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, marginBottom: 32 }}>
                  <span style={{ fontSize: 13, color: charCount < 30 ? '#c9a87c' : colors.textMuted }}>
                    {charCount < 30 ? `至少需要 30 字` : `${charCount} 字`}
                  </span>
                  <span style={{ fontSize: 13, color: colors.textMuted }}>写你想到的就好</span>
                </div>
              </>
            )}

            {/* 文风选择 */}
            {step === 'style' && (
              <div style={{
                background: colors.bgWarm, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                padding: '32px', marginBottom: 24,
              }}>
                <p style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 32 }}>
                  你想用什么样的文笔写这一页？
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
                  {Object.entries(AUTHOR_STYLES).map(([key, style]) => (
                    <button key={key} onClick={() => setSelectedStyle(key)} style={{
                      padding: '16px 20px', background: selectedStyle === key ? colors.accent : colors.bgAccent,
                      color: selectedStyle === key ? '#fff' : colors.text, border: 'none', borderRadius: 8,
                      textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s ease',
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{style.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{style.description}</div>
                    </button>
                  ))}
                </div>
                <button onClick={generateWithStyle} disabled={!isValidAnswer} style={{
                  width: '100%', padding: '16px 32px', background: isValidAnswer ? colors.text : colors.bgAccent,
                  color: isValidAnswer ? colors.bg : colors.textMuted, border: 'none', borderRadius: 8,
                  fontSize: 15, fontWeight: 500, cursor: isValidAnswer ? 'pointer' : 'not-allowed',
                }}>
                  生成我的书页
                </button>
              </div>
            )}

            {/* 改写中 */}
            {step === 'rewriting' && (
              <div style={{
                background: colors.bgWarm, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                padding: '48px 32px', marginBottom: 24, textAlign: 'center',
              }}>
                <div style={{
                  width: 40, height: 40, margin: '0 auto 24px',
                  border: `2px solid ${colors.borderLight}`, borderTopColor: colors.accent,
                  borderRadius: '50%', animation: 'spin 1s linear infinite',
                }} />
                <p style={{ fontSize: 15, color: colors.textSecondary }}>
                  正在用 {AUTHOR_STYLES[selectedStyle as keyof typeof AUTHOR_STYLES]?.name} 的风格改写...
                </p>
              </div>
            )}
          </>
        )}

        {/* ================= 书籍展示容器 (核心修改部分) ================= */}
        {isBookMode && rewrittenContent && (
           <div className={`book-wrapper ${isExpanded ? 'expanded' : ''}`}>
             <div className="book-container">
               {/* 封面视图 (Cover View) */}
               <div className={`book-content cover-view ${!isExpanded ? 'active' : ''}`}>
                 <div className="deco-line top" />
                 <div className="deco-line bottom" />
                 
                 <h1 className="book-title">永恒档案</h1>
                 <p className="book-subtitle">{AUTHOR_STYLES[selectedStyle as keyof typeof AUTHOR_STYLES]?.name}</p>
                 <div className="chapter-title">{rewrittenContent.title}</div>
                 
                 <button className="action-btn" onClick={handleFlipToContent}>
                   翻开阅读 →
                 </button>
                 <button className="reset-btn" onClick={resetDemo}>
                   再试一次
                 </button>
               </div>

               {/* 内页视图 (Content Page View) - 茨威格风格 */}
               <div className={`book-content page-view ${isExpanded ? 'active' : ''}`}>
                  <div className="page-number">— 1 —</div>
                  <h2 className="page-chapter">{rewrittenContent.title}</h2>
                  <div className="page-text">
                    {rewrittenContent.content.split('\n\n').map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>
                  
                  <div className="page-footer">
                    <button className="back-btn" onClick={handleBackToCover}>
                      ← 返回封面
                    </button>
                  </div>
               </div>
             </div>

             {/* 底部引导 (仅在内页显示) */}
             <div className={`book-footer ${isExpanded ? 'visible' : ''}`}>
                <p>你刚刚写的，只是一个开始。</p>
                <p>很多人，会把这一页，慢慢写成一本书。</p>
                <div className="footer-btns">
                  <Link href="/Buy" className="continue-btn">继续写下去</Link>
                  <button onClick={resetDemo} className="retry-btn">再试一次</button>
                </div>
             </div>
           </div>
        )}
      </div>

      <style jsx>{`
        @keyframes wave {
          0%, 100% { height: 30px; }
          50% { height: 50px; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* 书籍容器动画 */
        .book-wrapper {
          margin-top: 20px;
          perspective: 1000px;
          transition: all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .book-container {
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          min-height: 400px;
          position: relative;
          overflow: hidden;
          transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
          transform-origin: center top;
        }

        /* 展开状态 */
        .book-wrapper.expanded .book-container {
           min-height: 600px; /* 展开后变长 */
           box-shadow: 0 20px 60px rgba(0,0,0,0.12); /* 阴影加深，浮起感 */
           transform: scale(1.02);
        }

        .book-content {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          opacity: 0;
          pointer-events: none;
          transition: all 0.5s ease;
          transform: translateY(10px);
        }

        .book-content.active {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
          position: relative; /* 激活时占据文档流，撑开高度 */
        }

        /* 封面样式 */
        .cover-view {
           padding: 60px 40px;
           justify-content: center;
           text-align: center;
        }
        .deco-line {
          position: absolute;
          left: 40px; right: 40px; height: 1px;
          background: ${colors.border};
        }
        .deco-line.top { top: 40px; }
        .deco-line.bottom { bottom: 40px; }

        .book-title {
           font-family: ${fonts.serif};
           font-size: 36px;
           font-weight: 400;
           color: ${colors.text};
           margin-bottom: 16px;
           letter-spacing: 0.1em;
        }
        .book-subtitle {
           font-size: 14px;
           color: ${colors.textMuted};
           margin-bottom: 40px;
           letter-spacing: 0.05em;
        }
        .chapter-title {
           font-family: ${fonts.serif};
           font-size: 24px;
           color: ${colors.textSecondary};
           margin-bottom: 60px;
        }

        /* 内页样式 (Stefan Zweig Style) */
        .page-view {
           padding: 60px 48px;
           align-items: stretch;
        }
        .page-number {
           position: absolute;
           top: 24px; right: 48px;
           font-size: 11px;
           color: ${colors.textMuted};
           letter-spacing: 0.1em;
        }
        .page-chapter {
           font-family: ${fonts.serif};
           font-size: 20px;
           font-weight: 400;
           color: ${colors.text};
           margin-bottom: 40px;
           text-align: center;
           letter-spacing: 0.05em;
        }
        .page-text {
           font-size: 15px;
           line-height: 2.0; /* 宽松行高 */
           color: ${colors.text};
           text-align: justify;
           font-family: ${fonts.serif};
        }
        .page-text p {
           text-indent: 2em;
           margin-bottom: 1.5em;
        }
        .page-text p:last-child {
           margin-bottom: 0;
        }
        .page-footer {
           margin-top: 60px;
           text-align: center;
        }
        
        /* 按钮样式 */
        .action-btn {
           padding: 12px 32px;
           background: ${colors.text};
           color: ${colors.bg};
           border: none; border-radius: 4px;
           font-size: 14px; cursor: pointer;
           transition: all 0.3s ease;
        }
        .action-btn:hover {
           opacity: 0.9;
           transform: translateY(-1px);
        }
        .reset-btn {
           margin-top: 24px;
           background: transparent;
           color: ${colors.textMuted};
           border: none; cursor: pointer;
           font-size: 13px;
        }
        .back-btn {
           padding: 12px 32px;
           background: ${colors.bgAccent};
           color: ${colors.text};
           border: none; border-radius: 4px;
           font-size: 14px; cursor: pointer;
           transition: all 0.3s ease;
        }
        .back-btn:hover {
           background: ${colors.accent};
           color: white;
        }

        /* 底部引导栏动画 */
        .book-footer {
           margin-top: 40px;
           text-align: center;
           opacity: 0;
           transform: translateY(20px);
           transition: all 0.6s ease 0.3s; /* 延迟出现 */
        }
        .book-footer.visible {
           opacity: 1;
           transform: translateY(0);
        }
        .book-footer p {
           font-size: 14px;
           color: ${colors.textSecondary};
           line-height: 1.8;
        }
        .footer-btns {
           margin-top: 24px;
           display: flex;
           justify-content: center;
           gap: 16px;
        }
        .continue-btn {
           padding: 12px 28px;
           background: ${colors.bgAccent};
           color: ${colors.text};
           border: none; border-radius: 8px;
           font-size: 14px; text-decoration: none;
           transition: all 0.3s ease;
        }
        .retry-btn {
           padding: 12px 28px;
           background: transparent;
           color: ${colors.textMuted};
           border: none; border-radius: 8px;
           font-size: 14px; cursor: pointer;
        }
      `}</style>
    </div>
  )
}
