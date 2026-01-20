'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type DemoStep = 'intro' | 'writing' | 'generating' | 'book' | 'register' | 'complete'

// ===== 漂浮文字艺术层组件 =====
function FloatingTextLayer() {
  // 核心格言（偏大字号）
  const coreQuotes = [
    '你的一生，值得被认真对待。',
    '不是所有重要的事，都会被记住。',
    '写下来，是一种对自己的尊重。',
    '有些瞬间，不写下来就会消失。',
    '你不是在记录过去，你是在理解它。',
    '这是一本还没有写完的书。',
    '你可以慢慢来。',
    '不是为了别人，是为了你自己。',
    '有些故事，只属于你。',
    '这不是回忆录，这是正在发生的人生。',
    '如果现在不写，以后可能就忘了为什么重要。',
    '你值得拥有一页，属于自己的文字。',
  ]

  // 人生场景文字（字号略小）
  const sceneTexts = [
    '"我小时候，一直觉得自己会成为作家。"',
    '"那时候我以为，长大以后会有很多时间。"',
    '"我曾经对未来，非常确定。"',
    '"小时候的我，可能会想知道现在的我过得好不好。"',
    '"我的人生没有那么戏剧化，但它是真的。"',
    '"我不知道自己算不算成功，但我走了很远。"',
    '"有一段时间，我甚至不知道自己在忙什么。"',
    '"我不是没有故事，只是从来没人问过。"',
    '"我刚刚离婚，我需要重新认识自己。"',
    '"有些关系结束了，但它们塑造了我。"',
    '"我想留下些什么，不是因为结束，而是因为继续。"',
    '"我不是想回到过去，我只是想和它好好说再见。"',
    '"这不是送给别人的礼物。"',
    '"这是我为自己做的一件事。"',
    '"我允许自己，花时间回顾我的人生。"',
    '"我不需要一个理由，才能珍惜自己走过的路。"',
    '"这是一本，只要我愿意，就可以继续写下去的书。"',
    '"这可能不是一本伟大的书，但它是我的。"',
    '"如果我的人生是一本书，我想至少读过它。"',
    '"有些章节，现在终于可以写清楚了。"',
    '"这只是第一章。"',
    '"今年我过生日，我突然想留下些什么给未来的自己。"',
    '"这是我三十岁的第一天，我想认真看一眼走到这里的自己。"',
    '"我不需要一场派对，我更想写下这一年发生了什么。"',
    '"年龄只是一个数字，但这一年不是。"',
    '"我来到了一个新的国家，也开始了一个新版本的人生。"',
    '"这是我第一次离家这么远，我想记住现在的心情。"',
    '"我搬到了新的城市，想把旧生活好好收起来。"',
    '"我站在陌生的街道上，突然意识到：我真的走到这里了。"',
    '"我换了工作，但其实是在重新定义自己。"',
    '"这是我第一次觉得，工作不只是为了生活。"',
    '"我开始承担更多责任，也想知道自己是怎么走到这一步的。"',
    '"我成为了父母，想记住这一切开始的样子。"',
    '"我们刚刚结婚，我不想让这一刻只存在于照片里。"',
    '"有些关系变了，我也跟着变了。"',
    '"我开始更在意自己在想什么，而不是别人怎么看我。"',
    '"我不确定未来会怎样，但我想把现在说清楚。"',
    '"我终于有时间，好好回顾这些年发生的事。"',
    '"这段经历不一定惊天动地，但它值得被写成一页。"',
    '"我不想只是经历它，我想把它变成一本可以读的东西。"',
    '"这不是为了纪念什么结束，而是标记一个新的开始。"',
  ]

  // ===== 重新设计：每行是一个整体容器，所有文字固定间距排列，一起移动 =====
  
  // 定义行配置：避开中央40%-60%区域（主标题）
  const rowConfigs = [
    { top: '8%', opacity: 0.35, duration: 120 },   // 第1行，最慢
    { top: '18%', opacity: 0.45, duration: 100 },  // 第2行
    { top: '28%', opacity: 0.5, duration: 90 },    // 第3行
    { top: '68%', opacity: 0.5, duration: 95 },    // 第4行（跳过中央）
    { top: '78%', opacity: 0.45, duration: 105 },  // 第5行
    { top: '88%', opacity: 0.35, duration: 115 },  // 第6行
  ]

  // 合并所有文字
  const allTextPool = [...coreQuotes, ...sceneTexts]
  
  // 把文字分配到各行
  const textsByRow: string[][] = rowConfigs.map(() => [])
  allTextPool.forEach((text, index) => {
    const rowIndex = index % rowConfigs.length
    textsByRow[rowIndex].push(text)
  })
  
  // 固定间距（像素）
  const GAP = 120

  return (
    <>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '70vh', // 只覆盖第一屏 Hero 区域
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 1,
      }}>
        {/* 每行是一个整体容器，内部文字用 flex 排列，固定间距 */}
        {rowConfigs.map((rowConfig, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              position: 'absolute',
              top: rowConfig.top,
              left: 0,
              display: 'flex',
              gap: GAP,
              whiteSpace: 'nowrap',
              fontFamily: '"Source Serif 4", "Noto Serif SC", "Songti SC", Georgia, serif',
              fontSize: 'clamp(13px, 1.5vw, 17px)',
              fontWeight: 300,
              color: '#5a5a5a',
              opacity: rowConfig.opacity,
              animation: `floatRow-${rowIndex} ${rowConfig.duration}s linear infinite`,
            }}
          >
            {/* 文字列表重复两次，形成无缝循环 */}
            {[...textsByRow[rowIndex], ...textsByRow[rowIndex]].map((text, textIndex) => (
              <span key={textIndex}>{text}</span>
            ))}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes floatRow-0 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes floatRow-1 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes floatRow-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes floatRow-3 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes floatRow-4 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes floatRow-5 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

// ===== 双图片交互选择组件 - 放在Hero两侧 =====
function RoleSplitImages({ onHoverChange }: { onHoverChange?: (hovered: 'left' | 'right' | null) => void }) {
  const router = useRouter()
  const [hovered, setHovered] = useState<'left' | 'right' | null>(null)

  const handleHover = (side: 'left' | 'right' | null) => {
    setHovered(side)
    onHoverChange?.(side)
  }

  return (
    <>
      {/* 左侧 - 留给自己 */}
      <div
        onClick={() => router.push('/draft')}
        onMouseEnter={() => handleHover('left')}
        onMouseLeave={() => handleHover(null)}
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          height: '260px', // 窄条高度，足够覆盖下方文字
          width: hovered === 'left' ? '65%' : '35%', // 默认35%，展开时覆盖中央
          backgroundImage: 'url(https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1200&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'width 0.5s ease-in-out',
          clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 0 100%)',
          zIndex: hovered === 'left' ? 10 : 5,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* 遮罩层 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: hovered === 'left' 
            ? 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)'
            : 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
          transition: 'background 0.4s ease',
        }} />
        
        {/* 文案 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: hovered === 'left' ? 40 : 24,
          transform: 'translateY(-50%)',
          color: '#fff',
          zIndex: 3,
          opacity: 1,
          transition: 'all 0.4s ease',
        }}>
          <h3 style={{
            fontFamily: '"Source Serif 4", "Noto Serif SC", Georgia, serif',
            fontSize: hovered === 'left' ? 28 : 20,
            fontWeight: 400,
            marginBottom: hovered === 'left' ? 8 : 4,
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            transition: 'all 0.4s ease',
          }}>
            留给自己
          </h3>
          <p style={{
            fontSize: 14,
            opacity: hovered === 'left' ? 0.9 : 0,
            fontWeight: 400,
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            transition: 'opacity 0.3s ease',
            whiteSpace: 'nowrap',
          }}>
            这是一份送给自己的礼物
          </p>
        </div>

        {/* 箭头指示 */}
        <div style={{
          position: 'absolute',
          top: hovered === 'left' ? '65%' : '65%',
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#fff',
          opacity: hovered === 'left' ? 1 : 0,
          transition: 'all 0.3s ease',
          fontSize: 20,
        }}>
          ↓
        </div>
      </div>

      {/* 右侧 - 送给家人 */}
      <div
        onClick={() => router.push('/gift')}
        onMouseEnter={() => handleHover('right')}
        onMouseLeave={() => handleHover(null)}
        style={{
          position: 'absolute',
          top: '50%',
          right: 0,
          transform: 'translateY(-50%)',
          height: '260px', // 窄条高度，足够覆盖下方文字
          width: hovered === 'right' ? '65%' : '35%', // 默认35%，展开时覆盖中央
          backgroundImage: 'url(https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transition: 'width 0.5s ease-in-out',
          clipPath: 'polygon(30px 0, 100% 0, 100% 100%, 0 100%)',
          zIndex: hovered === 'right' ? 10 : 5,
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* 遮罩层 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: hovered === 'right' 
            ? 'linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)'
            : 'linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
          transition: 'background 0.4s ease',
        }} />
        
        {/* 文案 */}
        <div style={{
          position: 'absolute',
          top: '50%',
          right: hovered === 'right' ? 40 : 24,
          transform: 'translateY(-50%)',
          color: '#fff',
          textAlign: 'right',
          zIndex: 3,
          opacity: 1,
          transition: 'all 0.4s ease',
        }}>
          <h3 style={{
            fontFamily: '"Source Serif 4", "Noto Serif SC", Georgia, serif',
            fontSize: hovered === 'right' ? 28 : 20,
            fontWeight: 400,
            marginBottom: hovered === 'right' ? 8 : 4,
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            transition: 'all 0.4s ease',
          }}>
            送给家人
          </h3>
          <p style={{
            fontSize: 14,
            opacity: hovered === 'right' ? 0.9 : 0,
            fontWeight: 400,
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            transition: 'opacity 0.3s ease',
            whiteSpace: 'nowrap',
          }}>
            让他们留下自己的故事
          </p>
        </div>

        {/* 箭头指示 */}
        <div style={{
          position: 'absolute',
          top: hovered === 'right' ? '65%' : '65%',
          right: '50%',
          transform: 'translateX(50%)',
          color: '#fff',
          opacity: hovered === 'right' ? 1 : 0,
          transition: 'all 0.3s ease',
          fontSize: 20,
        }}>
          ↓
        </div>
      </div>
    </>
  )
}

interface GeneratedContent {
  title: string
  body: string
  date: string
}

export default function LandingPage() {
  const [step, setStep] = useState<DemoStep>('intro')
  const [answer, setAnswer] = useState('')
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [fadeIn, setFadeIn] = useState(false)
  const [sideHovered, setSideHovered] = useState<'left' | 'right' | null>(null)

  // ===== Mini Book Demo 状态 =====
  const [miniDemoStep, setMiniDemoStep] = useState<'idle' | 'recording' | 'transcribing' | 'style' | 'generating' | 'result'>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null)
  const [transcribedText, setTranscribedText] = useState('')
  const [selectedStyle, setSelectedStyle] = useState<string>('温柔纪实')
  const [generatedPage, setGeneratedPage] = useState<{ title: string; content: string } | null>(null)
  const [recordingPrompt, setRecordingPrompt] = useState('')

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100)
  }, [])

  const charCount = answer.length
  const isValidAnswer = charCount >= 30 && charCount <= 500

  async function handleSubmitAnswer() {
    if (!isValidAnswer) return
    
    setStep('generating')
    
    await new Promise(resolve => setTimeout(resolve, 2500))
    
    const content: GeneratedContent = {
      title: extractTitle(answer),
      body: formatStory(answer),
      date: new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    
    setGeneratedContent(content)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('demoMemory', JSON.stringify({
        answer,
        content,
        timestamp: Date.now()
      }))
    }
    
    setStep('book')
    setTimeout(() => setBookOpen(true), 600)
  }

  function extractTitle(text: string): string {
    const sentences = text.split(/[。！？,，]/)
    const firstSentence = sentences[0] || text
    if (firstSentence.length <= 15) return firstSentence
    return firstSentence.substring(0, 12) + '…'
  }

  function formatStory(text: string): string {
    return text.replace(/([。！？])/g, '$1\n\n').trim()
  }

  async function handleRegister() {
    if (!email || !password) {
      alert('请填写完整信息')
      return
    }

    setIsRegistering(true)
    
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      setStep('complete')
    } catch (error) {
      console.error('注册失败:', error)
      alert('注册失败，请重试')
    } finally {
      setIsRegistering(false)
    }
  }

  // ===== Mini Book Demo 函数 =====
  function startRecording() {
    setMiniDemoStep('recording')
    setRecordingTime(0)
    setRecordingPrompt('')
    const interval = setInterval(() => {
      setRecordingTime(prev => {
        const newTime = prev + 1
        // 温柔诱导提示
        if (newTime === 30) {
          setRecordingPrompt('你可以继续，这里不着急。')
        } else if (newTime === 90) {
          setRecordingPrompt('已经很好了，再讲一点也没关系。')
        }
        return newTime
      })
    }, 1000)
    setRecordingInterval(interval)
  }

  function stopRecording() {
    if (recordingInterval) {
      clearInterval(recordingInterval)
      setRecordingInterval(null)
    }
    setMiniDemoStep('transcribing')
    
    // 模拟转写过程
    setTimeout(() => {
      // Mock 转写文本
      const mockTexts = [
        '我记得那年冬天特别冷，奶奶每天早上五点就起来，在厨房里忙活。她说冬天要多吃点热乎的，身体才能暖和。那时候我还小，总喜欢赖在被窝里，听着厨房传来锅碗瓢盆的声音。有一天我悄悄爬起来，看见奶奶在擀饺子皮，手上的面粉像雪一样。她看见我，笑着说：来，奶奶教你包饺子。那是我第一次学会包饺子，虽然包得歪歪扭扭，但奶奶说那是最好看的。',
        '父亲是个沉默寡言的人，他不太会表达感情。但我记得有一次，我考试没考好，回家的路上一直在哭。他在门口等我，什么都没说，只是牵着我的手去买了一根冰棍。那天的夕阳特别红，我们走了很远的路，他始终握着我的手。后来我才明白，那是他表达爱的方式。',
        '搬来这个城市已经十年了，有时候会想起老家的样子。门前有一棵老槐树，夏天的时候，全村的人都喜欢在树下乘凉。我小时候总爱爬上去，坐在最高的枝丫上看远方。那时候觉得远方很神秘，充满了可能性。现在我到了远方，却常常梦见那棵老槐树。',
      ]
      setTranscribedText(mockTexts[Math.floor(Math.random() * mockTexts.length)])
      setMiniDemoStep('style')
    }, 2500)
  }

  function generateMiniPage() {
    setMiniDemoStep('generating')
    
    setTimeout(() => {
      // 根据风格生成不同的内容
      const styleFormats: Record<string, { title: string; format: (text: string) => string }> = {
        '温柔纪实': {
          title: '那些温暖的碎片',
          format: (text) => text,
        },
        '更像一本书': {
          title: '第一章：记忆的重量',
          format: (text) => `那一年的记忆，如今想来，依然清晰如昨。\n\n${text}\n\n这样的时刻，构成了我生命中最珍贵的篇章。`,
        },
        '克制、冷静': {
          title: '记录',
          format: (text) => text.replace(/[。！]/g, '。'),
        },
        '更私人一些': {
          title: '写给自己的信',
          format: (text) => `亲爱的自己，\n\n还记得吗？\n\n${text}\n\n这些，都是只属于你的故事。`,
        },
      }
      
      const style = styleFormats[selectedStyle] || styleFormats['温柔纪实']
      setGeneratedPage({
        title: style.title,
        content: style.format(transcribedText),
      })
      setMiniDemoStep('result')
    }, 2000)
  }

  function resetMiniDemo() {
    setMiniDemoStep('idle')
    setRecordingTime(0)
    setTranscribedText('')
    setSelectedStyle('温柔纪实')
    setGeneratedPage(null)
    setRecordingPrompt('')
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

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

  // ===== 首页/介绍页 =====
  if (step === 'intro') {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: fonts.sans,
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity 0.8s ease',
        position: 'relative',
      }}>
        {/* 漂浮文字艺术层 */}
        <FloatingTextLayer />

        {/* 顶部导航 - Remento 风格 */}
        <nav style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '16px 40px',
          background: colors.bgAccent,
        }}>
          <div style={{ 
            maxWidth: 1200, 
            margin: '0 auto', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            {/* 左侧 Logo */}
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 20 }}>📖</span>
              <span style={{ 
                fontFamily: fonts.serif,
                fontSize: 20, 
                fontWeight: 500, 
                color: colors.text,
                letterSpacing: '-0.02em',
              }}>
                永恒档案
              </span>
            </div>

            {/* 中间导航链接 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 32,
            }}>
              {[
                { label: '如何使用', href: '#how-it-works' },
                { label: '用户评价', href: '#reviews' },
                { label: '常见问题', href: '#faq' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    textDecoration: 'none',
                    fontWeight: 400,
                    transition: 'color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = colors.accent
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = colors.text
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>

            {/* 右侧按钮 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
            }}>
              <Link
                href="/signin?source=login"
                style={{
                  color: colors.text,
                  fontSize: 14,
                  textDecoration: 'none',
                  fontWeight: 400,
                }}
              >
                登录
              </Link>
              <Link
                href="/signin?source=buy"
                style={{
                  padding: '10px 20px',
                  background: colors.text,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: 'none',
                  borderRadius: 6,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.text
                }}
              >
                Buy Now
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero - 邀请式的开场，包含两侧图片 */}
        <section style={{
          minHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '120px 24px 60px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* 两侧图片交互 */}
          <RoleSplitImages onHoverChange={setSideHovered} />
          
          {/* 中央文字 */}
          <div style={{ 
            maxWidth: 640, 
            position: 'relative', 
            zIndex: 12,
            transition: 'all 0.4s ease',
            marginTop: '-30px',
          }}>
            <h1 style={{
              fontFamily: fonts.serif,
              fontSize: 'clamp(28px, 5vw, 42px)',
              fontWeight: 400,
              lineHeight: 1.4,
              color: sideHovered ? '#fff' : colors.text,
              marginBottom: 28,
              letterSpacing: '-0.01em',
              transition: 'color 0.4s ease',
              textShadow: sideHovered ? '0 2px 20px rgba(0,0,0,0.5)' : 'none',
            }}>
              有些记忆，
              <br />
              值得被温柔地写下来
            </h1>

            <p style={{
              fontSize: 17,
              color: sideHovered ? 'rgba(255,255,255,0.9)' : colors.textSecondary,
              lineHeight: 1.8,
              marginBottom: 32,
              fontWeight: 400,
              transition: 'color 0.4s ease',
              textShadow: sideHovered ? '0 1px 10px rgba(0,0,0,0.4)' : 'none',
            }}>
              这里是一个安静的地方。
              <br />
              你可以慢慢地，把自己的故事留下来。
            </p>
          </div>
        </section>

        {/* 原有的按钮区域 - 作为备选入口 */}
        <section style={{
          padding: '0 24px 60px',
          textAlign: 'center',
          background: colors.bg,
        }}>
          <p style={{
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 20,
          }}>
            或者，直接开始体验
          </p>
          <Link
            href="/signin?source=draft"
            style={{
              padding: '14px 36px',
              background: colors.text,
              color: colors.bg,
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              letterSpacing: '0.02em',
              textDecoration: 'none',
              display: 'inline-block',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.accent
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.text
            }}
          >
            写下第一段记忆
          </Link>
          <p style={{
            marginTop: 12,
            fontSize: 13,
            color: colors.textMuted,
          }}>
            无需注册，立即开始
          </p>
        </section>

        {/* 简洁的功能介绍 */}
        <section style={{
          padding: '100px 24px',
          background: colors.bgWarm,
        }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 60,
            }}>
              用最简单的方式，守护珍贵的记忆
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 40,
            }}>
              {[
                {
                  title: '讲述',
                  desc: '用语音或文字，回答关于人生的问题。不需要写作技巧，只需要真诚。',
                },
                {
                  title: '整理',
                  desc: 'AI会帮你把零散的回忆，整理成流畅的文字。保留你的声音和情感。',
                },
                {
                  title: '珍藏',
                  desc: '生成精美的电子书或印刷版。送给家人，或留给未来的孩子们。',
                },
              ].map((item, idx) => (
                <div key={idx} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: fonts.serif,
                    fontSize: 22,
                    color: colors.text,
                    marginBottom: 12,
                  }}>
                    {item.title}
                  </div>
                  <p style={{
                    fontSize: 15,
                    color: colors.textSecondary,
                    lineHeight: 1.7,
                  }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 如何使用 - 4步流程 */}
        <section id="how-it-works" style={{
          padding: '100px 24px',
          background: colors.bg,
        }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 60,
            }}>
              如何使用
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 40,
            }}>
              {[
                {
                  step: '1',
                  title: '选择问题',
                  desc: '我们提供了精心设计的问题，帮你梳理人生重要的时刻',
                },
                {
                  step: '2',
                  title: '讲述故事',
                  desc: '用语音或文字回答，自然地表达你的想法和感受',
                },
                {
                  step: '3',
                  title: '生成书籍',
                  desc: 'AI 将你的回答整理成流畅的故事，形成完整的人生记录',
                },
                {
                  step: '4',
                  title: '分享珍藏',
                  desc: '生成精美的电子书或印刷版，分享给家人或永久保存',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  style={{
                    textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      margin: '0 auto 20px',
                      background: colors.bgAccent,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: fonts.serif,
                      fontSize: 24,
                      fontWeight: 600,
                      color: colors.accent,
                    }}
                  >
                    {item.step}
                  </div>
                  <h3
                    style={{
                      fontFamily: fonts.serif,
                      fontSize: 18,
                      fontWeight: 400,
                      color: colors.text,
                      marginBottom: 12,
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: colors.textSecondary,
                      lineHeight: 1.7,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Mini Book Demo - 嵌入式体验模块 ===== */}
        <section style={{
          padding: '80px 24px',
          background: colors.bg,
          borderTop: `1px solid ${colors.bgAccent}`,
        }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {/* 小标题 */}
            <p style={{
              fontFamily: fonts.serif,
              fontSize: 16,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 40,
            }}>
              试着讲一段，看看它会变成什么样
            </p>

            {/* 根据步骤显示不同内容 */}
            {miniDemoStep === 'idle' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{
                  fontSize: 15,
                  color: colors.textMuted,
                  lineHeight: 1.8,
                  marginBottom: 32,
                }}>
                  你可以慢慢讲。
                  <br />
                  两分钟，刚好够一个重要片段。
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

            {miniDemoStep === 'recording' && (
              <div style={{ textAlign: 'center' }}>
                {/* 录音时长显示 */}
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
                
                {/* 录音状态指示 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginBottom: 24,
                }}>
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#E57373',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                  <span style={{ fontSize: 14, color: colors.textSecondary }}>
                    正在录音…
                  </span>
                </div>

                {/* 温柔诱导提示 */}
                {recordingPrompt && (
                  <p style={{
                    fontSize: 14,
                    color: colors.accent,
                    marginBottom: 24,
                    fontStyle: 'italic',
                    transition: 'opacity 0.5s ease',
                  }}>
                    {recordingPrompt}
                  </p>
                )}

                {/* 控制按钮 */}
                <button
                  onClick={stopRecording}
                  style={{
                    padding: '14px 36px',
                    background: colors.text,
                    color: '#fff',
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
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.text
                  }}
                >
                  <span style={{ fontSize: 16 }}>⏹️</span>
                  结束录音
                </button>
              </div>
            )}

            {miniDemoStep === 'transcribing' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{
                  width: 40,
                  height: 40,
                  border: `2px solid ${colors.bgAccent}`,
                  borderTopColor: colors.accent,
                  borderRadius: '50%',
                  margin: '0 auto 24px',
                  animation: 'spin 1s linear infinite',
                }} />
                <p style={{
                  fontSize: 15,
                  color: colors.textSecondary,
                  lineHeight: 1.8,
                }}>
                  正在把你的讲述，整理成文字…
                </p>
              </div>
            )}

            {miniDemoStep === 'style' && (
              <div>
                {/* 转写结果预览 */}
                <div style={{
                  padding: 24,
                  background: colors.bgWarm,
                  borderRadius: 8,
                  marginBottom: 32,
                }}>
                  <p style={{
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginBottom: 12,
                  }}>
                    你刚刚讲的：
                  </p>
                  <p style={{
                    fontSize: 15,
                    color: colors.text,
                    lineHeight: 1.8,
                  }}>
                    {transcribedText.length > 150 
                      ? transcribedText.substring(0, 150) + '…' 
                      : transcribedText}
                  </p>
                </div>

                {/* 风格选择 */}
                <p style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  textAlign: 'center',
                  marginBottom: 20,
                }}>
                  同一段经历，不同写法，会变成完全不同的一页。
                </p>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 12,
                  marginBottom: 32,
                }}>
                  {['温柔纪实', '更像一本书', '克制、冷静', '更私人一些'].map((style) => (
                    <button
                      key={style}
                      onClick={() => setSelectedStyle(style)}
                      style={{
                        padding: '14px 16px',
                        background: selectedStyle === style ? colors.text : colors.bgAccent,
                        color: selectedStyle === style ? '#fff' : colors.text,
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 400,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {style}
                      {style === '温柔纪实' && selectedStyle !== style && (
                        <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 6 }}>默认</span>
                      )}
                    </button>
                  ))}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={generateMiniPage}
                    style={{
                      padding: '14px 36px',
                      background: colors.text,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 15,
                      fontWeight: 400,
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
                    生成一页文字
                  </button>
                </div>
              </div>
            )}

            {miniDemoStep === 'generating' && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{
                  width: 40,
                  height: 40,
                  border: `2px solid ${colors.bgAccent}`,
                  borderTopColor: colors.accent,
                  borderRadius: '50%',
                  margin: '0 auto 24px',
                  animation: 'spin 1s linear infinite',
                }} />
                <p style={{
                  fontSize: 15,
                  color: colors.textSecondary,
                  lineHeight: 1.8,
                }}>
                  正在生成你书中的一页…
                </p>
              </div>
            )}

            {miniDemoStep === 'result' && generatedPage && (
              <div>
                {/* 书页展示 */}
                <div style={{
                  background: '#fff',
                  borderRadius: 4,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
                  padding: '48px 40px',
                  marginBottom: 32,
                  position: 'relative',
                }}>
                  {/* 页码标注 */}
                  <p style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    marginBottom: 8,
                    letterSpacing: '0.05em',
                  }}>
                    第一章 · 一页
                  </p>
                  
                  {/* 标题 */}
                  <h3 style={{
                    fontFamily: fonts.serif,
                    fontSize: 22,
                    fontWeight: 400,
                    color: colors.text,
                    marginBottom: 24,
                    lineHeight: 1.4,
                  }}>
                    {generatedPage.title}
                  </h3>
                  
                  {/* 正文 */}
                  <div style={{
                    fontSize: 15,
                    color: colors.text,
                    lineHeight: 2,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {generatedPage.content}
                  </div>
                  
                  {/* 底部装饰线 */}
                  <div style={{
                    width: 40,
                    height: 1,
                    background: colors.bgAccent,
                    margin: '32px auto 0',
                  }} />
                  
                  <p style={{
                    fontSize: 12,
                    color: colors.textMuted,
                    textAlign: 'center',
                    marginTop: 16,
                    fontStyle: 'italic',
                  }}>
                    这是你书中的第一页
                  </p>
                </div>

                {/* 轻转化引导 */}
                <div style={{ textAlign: 'center' }}>
                  <p style={{
                    fontSize: 14,
                    color: colors.textSecondary,
                    lineHeight: 1.8,
                    marginBottom: 8,
                  }}>
                    你刚刚讲的，只是一个开始。
                  </p>
                  <p style={{
                    fontSize: 14,
                    color: colors.textSecondary,
                    lineHeight: 1.8,
                    marginBottom: 28,
                  }}>
                    很多人，会把这一页，慢慢写成一本书。
                  </p>
                  
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 16,
                  }}>
                    <Link
                      href="/demo"
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
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.accent
                        e.currentTarget.style.color = '#fff'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colors.bgAccent
                        e.currentTarget.style.color = colors.text
                      }}
                    >
                      继续写下去
                    </Link>
                    <button
                      onClick={resetMiniDemo}
                      style={{
                        padding: '12px 28px',
                        background: 'transparent',
                        color: colors.textMuted,
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 400,
                        cursor: 'pointer',
                        transition: 'color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = colors.text
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = colors.textMuted
                      }}
                    >
                      稍后再说
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 媒体徽标 - 作为见证 */}
        <section style={{
          padding: '60px 24px',
          background: colors.bgWarm,
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 13,
            color: colors.textMuted,
            marginBottom: 32,
            letterSpacing: '0.1em',
          }}>
            获得广泛认可
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '30px 40px',
          }}>
            {['CNN', 'USA Today', 'Shark Tank', 'Forbes', 'TechCrunch', 'New York Post'].map((media) => (
              <div
                key={media}
                style={{
                  fontSize: 13,
                  color: colors.textMuted,
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                }}
              >
                {media}
              </div>
            ))}
          </div>
        </section>

        {/* 一句引言 */}
        <section style={{
          padding: '80px 24px',
          background: colors.bg,
          textAlign: 'center',
        }}>
          <blockquote style={{
            fontFamily: fonts.serif,
            fontSize: 'clamp(18px, 3vw, 24px)',
            fontStyle: 'italic',
            color: colors.textSecondary,
            maxWidth: 600,
            margin: '0 auto',
            lineHeight: 1.6,
          }}>
            "每一个普通人的故事，
            <br />
            都值得被认真地记录下来。"
          </blockquote>
        </section>

        {/* 容易使用 - 特性列表 */}
        <section style={{
          padding: '100px 24px',
          background: colors.bgAccent,
        }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              简单易用
            </h2>
            <p style={{
              fontSize: 16,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: 60,
            }}>
              为祖父母设计的工具，被全家人喜爱
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 40,
            }}>
              {[
                {
                  title: '无需写作',
                  desc: '你不需要写得漂亮，AI 会帮你润色',
                },
                {
                  title: '无需注册',
                  desc: '直接开始，创建账户也非常简单',
                },
                {
                  title: '无需下载',
                  desc: '在浏览器中工作，随时随地都能使用',
                },
              ].map((item) => (
                <div key={item.title} style={{ textAlign: 'center' }}>
                  <h3
                    style={{
                      fontFamily: fonts.serif,
                      fontSize: 20,
                      fontWeight: 400,
                      color: colors.text,
                      marginBottom: 12,
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: colors.textSecondary,
                      lineHeight: 1.7,
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 客户推荐 */}
        <section id="reviews" style={{
          padding: '100px 24px',
          background: colors.bg,
        }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 60,
            }}>
              用户说
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 32,
            }}>
              {[
                {
                  quote: '这是我为爸爸做的最好的礼物。现在我有机会真正地倾听他的故事，而不仅仅是看着他老去。',
                  role: '女儿',
                },
                {
                  quote: '我从未想过自己会把人生的故事写下来。这个工具让整个过程变得简单而有意义。',
                  role: '讲述者',
                },
                {
                  quote: '看到我妈妈的故事被整理成一本书，我眼泪都出来了。这是永恒的礼物。',
                  role: '儿子',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 32,
                    background: colors.bgWarm,
                    borderRadius: 8,
                    border: `1px solid ${colors.borderLight}`,
                  }}
                >
                  <p style={{
                    fontFamily: fonts.serif,
                    fontSize: 16,
                    color: colors.text,
                    lineHeight: 1.8,
                    marginBottom: 20,
                  }}>
                    "{item.quote}"
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: colors.textMuted,
                      fontWeight: 500,
                    }}
                  >
                    — {item.role}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 我们的故事 */}
        <section style={{
          padding: '100px 24px',
          background: colors.bgAccent,
        }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              marginBottom: 32,
            }}>
              我们的故事
            </h2>

            <div style={{
              fontFamily: fonts.serif,
              fontSize: 16,
              color: colors.text,
              lineHeight: 2,
            }}>
              <p style={{ marginBottom: 20 }}>
                2019 年，我的妈妈被诊断出患有癌症。在陪伴她治疗的过程中，我开始认识到一件事：我从未真正听过她完整的故事。
              </p>
              <p style={{ marginBottom: 20 }}>
                当时的我，忙于工作和生活，没有意识到这些故事会有多珍贵。后来妈妈康复了，但那段经历改变了我的人生方向。
              </p>
              <p style={{ marginBottom: 20 }}>
                我开始思考：如何让每一个人，无论年纪多大，都有机会把自己的故事记录下来？不是为了成为名人，而只是为了存在。
              </p>
              <p>
                永恒档案的诞生，源于这样一个信念：每一个普通人的故事，都值得被温柔地对待。这不仅是一个产品，更是一份让人生被认真看待的承诺。
              </p>
            </div>
          </div>
        </section>

        {/* 常见问题 */}
        <section id="faq" style={{
          padding: '100px 24px',
          background: colors.bg,
        }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 60,
            }}>
              常见问题
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                {
                  q: '数据会被保存多久？',
                  a: '永久保存。我们把你的故事视为珍贵资产，承诺在你需要的任何时候都可以访问。',
                },
                {
                  q: '可以分享给家人吗？',
                  a: '可以。你可以邀请家人查看，或生成可分享的链接。隐私设置完全由你掌控。',
                },
                {
                  q: '生成的书籍可以印刷吗？',
                  a: '可以。我们支持高质量的印刷版生成，你可以把它当作真正的书籍收藏。',
                },
                {
                  q: '使用过程中需要付费吗？',
                  a: '基础功能永远免费。高级功能（如印刷版）会有相关费用，但基础的讲述和整理是完全免费的。',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: 24,
                    background: colors.bgWarm,
                    borderRadius: 8,
                    border: `1px solid ${colors.borderLight}`,
                  }}
                >
                  <h3
                    style={{
                      fontFamily: fonts.serif,
                      fontSize: 16,
                      fontWeight: 600,
                      color: colors.text,
                      marginBottom: 12,
                    }}
                  >
                    {item.q}
                  </h3>
                  <p
                    style={{
                      fontSize: 14,
                      color: colors.textSecondary,
                      lineHeight: 1.8,
                    }}
                  >
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 时事通讯 */}
        <section style={{
          padding: '100px 24px',
          background: colors.bgAccent,
        }}>
          <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{
              fontFamily: fonts.serif,
              fontSize: 28,
              fontWeight: 400,
              color: colors.text,
              marginBottom: 12,
            }}>
              加入我们
            </h2>
            <p style={{
              fontSize: 15,
              color: colors.textSecondary,
              marginBottom: 32,
            }}>
              订阅时事通讯，获得 $10 优惠码并了解最新功能
            </p>

            <div style={{
              display: 'flex',
              gap: 12,
              marginBottom: 12,
            }}>
              <input
                type="email"
                placeholder="输入你的邮箱"
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  fontSize: 14,
                  color: colors.text,
                  outline: 'none',
                }}
              />
              <button
                style={{
                  padding: '12px 24px',
                  background: colors.text,
                  color: colors.bg,
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.text
                }}
              >
                订阅
              </button>
            </div>

            <p style={{
              fontSize: 12,
              color: colors.textMuted,
            }}>
              我们不会分享你的邮箱，承诺少量且有价值的邮件
            </p>
          </div>
        </section>

        {/* 开始行动 */}
        <section style={{
          padding: '80px 24px 100px',
          background: colors.bgAccent,
          textAlign: 'center',
        }}>
          <h3 style={{
            fontFamily: fonts.serif,
            fontSize: 24,
            fontWeight: 400,
            color: colors.text,
            marginBottom: 16,
          }}>
            准备好了吗？
          </h3>
          <p style={{
            fontSize: 15,
            color: colors.textSecondary,
            marginBottom: 32,
          }}>
            从一个小小的记忆开始
          </p>
          <button
            onClick={() => setStep('writing')}
            style={{
              padding: '14px 36px',
              background: colors.text,
              color: colors.bg,
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            开始书写
          </button>
        </section>

        {/* 简洁的页脚 */}
        <footer style={{
          padding: '32px 24px',
          background: colors.bg,
          textAlign: 'center',
          borderTop: `1px solid ${colors.borderLight}`,
        }}>
          <div style={{ 
            fontSize: 13, 
            color: colors.textMuted,
          }}>
            © 2024 永恒档案
          </div>
        </footer>
      </div>
    )
  }

  // ===== 写作页面 =====
  if (step === 'writing') {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: fonts.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ 
          maxWidth: 560, 
          width: '100%',
          animation: 'fadeUp 0.6s ease',
        }}>
          <button
            onClick={() => setStep('intro')}
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
            }}
          >
            ← 返回
          </button>

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
            marginBottom: 32,
          }}>
            可以是一个场景、一句话、或一种感觉
          </p>

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
              {charCount < 30 ? `还需要 ${30 - charCount} 字` : `${charCount} / 500`}
            </span>
            <span style={{
              fontSize: 13,
              color: colors.textMuted,
            }}>
              写你想到的就好
            </span>
          </div>

          <button
            onClick={handleSubmitAnswer}
            disabled={!isValidAnswer}
            style={{
              width: '100%',
              padding: '16px 32px',
              background: isValidAnswer ? colors.text : colors.bgAccent,
              color: isValidAnswer ? colors.bg : colors.textMuted,
              border: 'none',
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 500,
              cursor: isValidAnswer ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
            }}
          >
            生成我的第一页
          </button>
        </div>

        {/* ===== Mini Book Demo - 嵌入式体验模块（写作弹窗专用） ===== */}
        <div style={{
          margin: '64px auto 0',
          maxWidth: 560,
          background: colors.bgWarm,
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          padding: '48px 32px',
        }}>
          <p style={{
            fontFamily: fonts.serif,
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: 40,
          }}>
            试着讲一段，看看它会变成什么样
          </p>

          {/* 根据步骤显示不同内容 */}
          {miniDemoStep === 'idle' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: 15,
                color: colors.textMuted,
                lineHeight: 1.8,
                marginBottom: 32,
              }}>
                你可以慢慢讲。
                <br />
                两分钟，刚好够一个重要片段。
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

          {miniDemoStep === 'recording' && (
            <div style={{ textAlign: 'center' }}>
              {/* 录音时长显示 */}
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
              
              {/* 录音状态指示 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 24,
              }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#E57373',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 14, color: colors.textSecondary }}>
                  正在录音…
                </span>
              </div>

              {/* 温柔诱导提示 */}
              {recordingPrompt && (
                <p style={{
                  fontSize: 14,
                  color: colors.accent,
                  marginBottom: 24,
                  fontStyle: 'italic',
                  transition: 'opacity 0.5s ease',
                }}>
                  {recordingPrompt}
                </p>
              )}

              {/* 控制按钮 */}
              <button
                onClick={stopRecording}
                style={{
                  padding: '14px 36px',
                  background: colors.text,
                  color: '#fff',
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
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.text
                }}
              >
                <span style={{ fontSize: 16 }}>⏹️</span>
                结束录音
              </button>
            </div>
          )}

          {miniDemoStep === 'transcribing' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{
                width: 40,
                height: 40,
                border: `2px solid ${colors.bgAccent}`,
                borderTopColor: colors.accent,
                borderRadius: '50%',
                margin: '0 auto 24px',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{
                fontSize: 15,
                color: colors.textSecondary,
                lineHeight: 1.8,
              }}>
                正在把你的讲述，整理成文字…
              </p>
            </div>
          )}

          {miniDemoStep === 'style' && (
            <div>
              {/* 转写结果预览 */}
              <div style={{
                padding: 24,
                background: colors.bg,
                borderRadius: 8,
                marginBottom: 32,
              }}>
                <p style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  marginBottom: 12,
                }}>
                  你刚刚讲的：
                </p>
                <p style={{
                  fontSize: 15,
                  color: colors.text,
                  lineHeight: 1.8,
                }}>
                  {transcribedText.length > 150 
                    ? transcribedText.substring(0, 150) + '…' 
                    : transcribedText}
                </p>
              </div>

              {/* 风格选择 */}
              <p style={{
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: 20,
              }}>
                同一段经历，不同写法，会变成完全不同的一页。
              </p>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                marginBottom: 32,
              }}>
                {['温柔纪实', '更像一本书', '克制、冷静', '更私人一些'].map((style) => (
                  <button
                    key={style}
                    onClick={() => setSelectedStyle(style)}
                    style={{
                      padding: '14px 16px',
                      background: selectedStyle === style ? colors.text : colors.bgAccent,
                      color: selectedStyle === style ? '#fff' : colors.text,
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 400,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {style}
                    {style === '温柔纪实' && selectedStyle !== style && (
                      <span style={{ fontSize: 12, color: colors.textMuted, marginLeft: 6 }}>默认</span>
                    )}
                  </button>
                ))}
              </div>

              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={generateMiniPage}
                  style={{
                    padding: '14px 36px',
                    background: colors.text,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 15,
                    fontWeight: 400,
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
                  生成一页文字
                </button>
              </div>
            </div>
          )}

          {miniDemoStep === 'generating' && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{
                width: 40,
                height: 40,
                border: `2px solid ${colors.bgAccent}`,
                borderTopColor: colors.accent,
                borderRadius: '50%',
                margin: '0 auto 24px',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{
                fontSize: 15,
                color: colors.textSecondary,
                lineHeight: 1.8,
              }}>
                正在生成你书中的一页…
              </p>
            </div>
          )}

          {miniDemoStep === 'result' && generatedPage && (
            <div>
              {/* 书页展示 */}
              <div style={{
                background: '#fff',
                borderRadius: 4,
                boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
                padding: '48px 40px',
                marginBottom: 32,
                position: 'relative',
              }}>
                {/* 页码标注 */}
                <p style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  marginBottom: 8,
                  letterSpacing: '0.05em',
                }}>
                  第一章 · 一页
                </p>
                
                {/* 标题 */}
                <h3 style={{
                  fontFamily: fonts.serif,
                  fontSize: 22,
                  fontWeight: 400,
                  color: colors.text,
                  marginBottom: 24,
                  lineHeight: 1.4,
                }}>
                  {generatedPage.title}
                </h3>
                
                {/* 正文 */}
                <div style={{
                  fontSize: 15,
                  color: colors.text,
                  lineHeight: 2,
                  whiteSpace: 'pre-wrap',
                }}>
                  {generatedPage.content}
                </div>
                
                {/* 底部装饰线 */}
                <div style={{
                  width: 40,
                  height: 1,
                  background: colors.bgAccent,
                  margin: '32px auto 0',
                }} />
                
                <p style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginTop: 16,
                  fontStyle: 'italic',
                }}>
                  这是你书中的第一页
                </p>
              </div>

              {/* 轻转化引导 */}
              <div style={{ textAlign: 'center' }}>
                <p style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  lineHeight: 1.8,
                  marginBottom: 8,
                }}>
                  你刚刚讲的，只是一个开始。
                </p>
                <p style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  lineHeight: 1.8,
                  marginBottom: 28,
                }}>
                  很多人，会把这一页，慢慢写成一本书。
                </p>
                
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 16,
                }}>
                  <Link
                    href="/demo"
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.accent
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = colors.bgAccent
                      e.currentTarget.style.color = colors.text
                    }}
                  >
                    继续写下去
                  </Link>
                  <button
                    onClick={resetMiniDemo}
                    style={{
                      padding: '12px 28px',
                      background: 'transparent',
                      color: colors.textMuted,
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 400,
                      cursor: 'pointer',
                      transition: 'color 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = colors.text
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = colors.textMuted
                    }}
                  >
                    稍后再说
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  // ===== 生成中 =====
  if (step === 'generating') {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: fonts.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 48,
            height: 48,
            margin: '0 auto 32px',
            border: `2px solid ${colors.borderLight}`,
            borderTopColor: colors.accent,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />

          <p style={{
            fontFamily: fonts.serif,
            fontSize: 18,
            color: colors.text,
            marginBottom: 8,
          }}>
            正在为你排版…
          </p>

          <p style={{
            fontSize: 14,
            color: colors.textMuted,
          }}>
            把你的故事变成书页
          </p>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // ===== 书页展示 =====
  if (step === 'book' && generatedContent) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#F5F2ED',
        fontFamily: fonts.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{
          maxWidth: 480,
          width: '100%',
          background: '#FFFEFB',
          borderRadius: 4,
          boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
          padding: 'clamp(32px, 6vw, 56px)',
          opacity: bookOpen ? 1 : 0,
          transform: bookOpen ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 0.8s ease',
          position: 'relative',
        }}>
          <h3 style={{
            fontFamily: fonts.serif,
            fontSize: 'clamp(20px, 4vw, 26px)',
            fontWeight: 400,
            color: colors.text,
            marginBottom: 24,
            lineHeight: 1.4,
            position: 'relative',
          }}>
            {generatedContent.title}
          </h3>

          <div style={{
            width: 40,
            height: 1,
            background: colors.border,
            marginBottom: 24,
          }} />

          <div style={{
            fontFamily: fonts.serif,
            fontSize: 16,
            color: colors.text,
            lineHeight: 2,
            whiteSpace: 'pre-wrap',
            position: 'relative',
          }}>
            {generatedContent.body}
          </div>

          <div style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: `1px solid ${colors.borderLight}`,
            fontSize: 13,
            color: colors.textMuted,
            textAlign: 'right',
          }}>
            {generatedContent.date}
          </div>
        </div>

        {bookOpen && (
          <div style={{
            marginTop: 40,
            textAlign: 'center',
            animation: 'fadeUp 0.6s ease 0.4s both',
          }}>
            <p style={{
              fontSize: 15,
              color: colors.textSecondary,
              marginBottom: 20,
              lineHeight: 1.6,
            }}>
              这是属于你的第一页
              <br />
              创建账户，继续书写更多记忆
            </p>

            <button
              onClick={() => setStep('register')}
              style={{
                padding: '14px 36px',
                background: colors.text,
                color: colors.bg,
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              保存并继续
            </button>

            <button
              onClick={() => setStep('writing')}
              style={{
                display: 'block',
                margin: '16px auto 0',
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                color: colors.textMuted,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              重新写一段
            </button>
          </div>
        )}

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  // ===== 注册页面 =====
  if (step === 'register') {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: fonts.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ 
          maxWidth: 400, 
          width: '100%',
          animation: 'fadeUp 0.6s ease',
        }}>
          <h2 style={{
            fontFamily: fonts.serif,
            fontSize: 26,
            fontWeight: 400,
            color: colors.text,
            marginBottom: 8,
            textAlign: 'center',
          }}>
            保存你的故事
          </h2>

          <p style={{
            fontSize: 15,
            color: colors.textSecondary,
            marginBottom: 40,
            textAlign: 'center',
          }}>
            创建账户，开始你的记忆之旅
          </p>

          <div style={{
            background: colors.bgWarm,
            padding: 32,
            borderRadius: 12,
            border: `1px solid ${colors.borderLight}`,
          }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                fontSize: 14,
                color: colors.text,
                marginBottom: 8,
                fontWeight: 500,
              }}>
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  color: colors.text,
                  fontSize: 15,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{
                display: 'block',
                fontSize: 14,
                color: colors.text,
                marginBottom: 8,
                fontWeight: 500,
              }}>
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  color: colors.text,
                  fontSize: 15,
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={isRegistering}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: colors.text,
                color: colors.bg,
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                cursor: isRegistering ? 'not-allowed' : 'pointer',
                opacity: isRegistering ? 0.7 : 1,
              }}
            >
              {isRegistering ? '创建中…' : '创建账户'}
            </button>
          </div>

          <p style={{
            fontSize: 14,
            color: colors.textMuted,
            textAlign: 'center',
            marginTop: 24,
          }}>
            已有账户？
            <Link href="/signin?source=login" style={{
              color: colors.accent,
              textDecoration: 'none',
              marginLeft: 4,
            }}>
              登录
            </Link>
          </p>
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  // ===== 完成页面 =====
  if (step === 'complete') {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        fontFamily: fonts.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{ 
          maxWidth: 400,
          animation: 'fadeUp 0.6s ease',
        }}>
          <div style={{
            width: 64,
            height: 64,
            margin: '0 auto 28px',
            background: colors.bgAccent,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            color: colors.accent,
          }}>
            ✓
          </div>

          <h2 style={{
            fontFamily: fonts.serif,
            fontSize: 28,
            fontWeight: 400,
            color: colors.text,
            marginBottom: 12,
          }}>
            欢迎你
          </h2>

          <p style={{
            fontSize: 15,
            color: colors.textSecondary,
            marginBottom: 40,
            lineHeight: 1.7,
          }}>
            你的第一段记忆已经保存
            <br />
            现在，继续书写更多故事吧
          </p>

          <Link
            href="/today"
            style={{
              display: 'inline-block',
              padding: '14px 40px',
              background: colors.text,
              color: colors.bg,
              border: 'none',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            开始今天的记录
          </Link>
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    )
  }

  return null
}
