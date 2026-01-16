'use client'

import Link from 'next/link'
import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type DemoStep = 'question' | 'generating' | 'book' | 'register' | 'complete'

interface GeneratedContent {
  title: string
  body: string
  date: string
}

export default function LandingPage() {
  const [step, setStep] = useState<DemoStep>('question')
  const [answer, setAnswer] = useState('')
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)

  const charCount = answer.length
  const isValidAnswer = charCount >= 30 && charCount <= 500

  async function handleSubmitAnswer() {
    if (!isValidAnswer) return
    
    setStep('generating')
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
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
    setTimeout(() => setBookOpen(true), 500)
  }

  function extractTitle(text: string): string {
    const sentences = text.split(/[。！？]/)
    const firstSentence = sentences[0] || text
    if (firstSentence.length <= 20) return firstSentence
    return firstSentence.substring(0, 17) + '...'
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

  const containerStyle: React.CSSProperties = {
    background: 'linear-gradient(to bottom, #FFF8F0 0%, #F7F5F2 100%)',
    minHeight: '100vh',
    fontFamily: 'var(--font-serif)',
    position: 'relative',
    overflow: 'hidden'
  }

  const textureStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
    pointerEvents: 'none',
    opacity: 0.5
  }

  const contentStyle: React.CSSProperties = {
    maxWidth: 800,
    margin: '0 auto',
    padding: '60px 24px',
    position: 'relative',
    zIndex: 1
  }

  return (
    <div style={containerStyle}>
      <div style={textureStyle} />

      <div style={contentStyle}>
        {step === 'question' && (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 500,
              lineHeight: 1.4,
              marginBottom: 16,
              color: '#1F1F1F',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '-0.01em'
            }}>
              写下一件关于家人的、<br/>你不希望被忘记的事情
            </h1>

            <p style={{
              fontSize: 15,
              color: '#6F6F6F',
              marginBottom: 48,
              fontFamily: 'var(--font-sans)'
            }}>
              30秒体验 · 无需注册 · 即刻生成精美电子书
            </p>

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="比如：小时候每个周末，奶奶都会做她拿手的红烧肉……"
              style={{
                width: '100%',
                minHeight: 200,
                padding: 24,
                background: 'white',
                border: '2px solid #E5E3DF',
                borderRadius: 16,
                color: '#1F1F1F',
                fontSize: 16,
                lineHeight: 1.8,
                fontFamily: 'var(--font-serif)',
                resize: 'vertical',
                outline: 'none',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(0,0,0,.04)'
              }}
            />

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 12,
              marginBottom: 32,
              fontSize: 13,
              fontFamily: 'var(--font-sans)'
            }}>
              <span style={{
                color: charCount < 30 || charCount > 500 ? '#ef4444' : '#6F6F6F'
              }}>
                {charCount}/500 字 {charCount < 30 && '（至少 30 字）'}
              </span>
              <span style={{ color: '#6F6F6F' }}>
                真诚地写，AI会帮你排版
              </span>
            </div>

            <button
              onClick={handleSubmitAnswer}
              disabled={!isValidAnswer}
              style={{
                width: '100%',
                padding: '16px 32px',
                background: isValidAnswer ? '#2F3E5C' : '#E5E3DF',
                color: isValidAnswer ? 'white' : '#9CA3AF',
                border: 'none',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 600,
                cursor: isValidAnswer ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
                fontFamily: 'var(--font-sans)',
                boxShadow: isValidAnswer ? '0 4px 16px rgba(47,62,92,.2)' : 'none'
              }}
            >
              生成我的电子书
            </button>
          </div>
        )}

        {step === 'generating' && (
          <div style={{ textAlign: 'center', padding: '120px 0' }}>
            <div style={{
              width: 60,
              height: 60,
              margin: '0 auto 32px',
              border: '3px solid #E5E3DF',
              borderTopColor: '#2F3E5C',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ fontSize: 18, color: '#6F6F6F', fontFamily: 'var(--font-sans)' }}>
              AI 正在为你生成精美排版...
            </p>
            <p style={{ fontSize: 14, color: '#9CA3AF', marginTop: 12, fontFamily: 'var(--font-sans)' }}>
              提取关键信息 · 优化段落结构 · 调整排版格式
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'book' && generatedContent && (
          <div style={{
            perspective: '2000px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '70vh',
            flexDirection: 'column'
          }}>
            <div style={{
              width: 'min(500px, 90vw)',
              height: 'min(650px, 80vh)',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transition: 'transform 1s ease',
              transform: bookOpen ? 'rotateY(-15deg)' : 'rotateY(0deg)'
            }}>
              <div style={{
                position: 'absolute',
                left: bookOpen ? -20 : 0,
                top: 0,
                width: 20,
                height: '100%',
                background: 'linear-gradient(to right, #D4C5B9, #E5DDD5)',
                borderRadius: '4px 0 0 4px',
                transition: 'all 1s ease'
              }} />

              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '50%',
                height: '100%',
                background: 'linear-gradient(135deg, #F5EEE6 0%, #E8DED3 100%)',
                borderRadius: '0 8px 8px 0',
                boxShadow: bookOpen ? '12px 0 40px rgba(0,0,0,.15)' : '8px 8px 32px rgba(0,0,0,.15)',
                transform: bookOpen ? 'rotateY(-140deg)' : 'rotateY(0deg)',
                transformOrigin: 'left center',
                transition: 'all 1s ease',
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                backfaceVisibility: 'hidden'
              }}>
                <div style={{
                  fontSize: 'clamp(18px, 3vw, 24px)',
                  fontWeight: 600,
                  color: '#2F3E5C',
                  textAlign: 'center',
                  fontFamily: 'var(--font-serif)',
                  marginBottom: 16,
                  lineHeight: 1.4
                }}>
                  {generatedContent.title}
                </div>
                <div style={{
                  width: 40,
                  height: 2,
                  background: '#2F3E5C',
                  margin: '16px 0',
                  opacity: 0.3
                }} />
                <div style={{
                  fontSize: 12,
                  color: '#6F6F6F',
                  fontFamily: 'var(--font-sans)'
                }}>
                  {generatedContent.date}
                </div>
              </div>

              <div style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: '50%',
                height: '100%',
                background: '#FFFEFB',
                borderRadius: '8px 0 0 8px',
                boxShadow: '-4px 0 16px rgba(0,0,0,.08)',
                padding: 32,
                opacity: bookOpen ? 1 : 0,
                transition: 'opacity 0.8s ease 0.3s',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <div style={{
                  fontSize: 'clamp(16px, 2.5vw, 18px)',
                  fontWeight: 600,
                  color: '#1F1F1F',
                  marginBottom: 20,
                  fontFamily: 'var(--font-serif)'
                }}>
                  {generatedContent.title}
                </div>
                <div style={{
                  fontSize: 'clamp(13px, 2vw, 15px)',
                  lineHeight: 2,
                  color: '#1F1F1F',
                  fontFamily: 'var(--font-serif)',
                  whiteSpace: 'pre-wrap',
                  flex: 1
                }}>
                  {generatedContent.body}
                </div>
                <div style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid #E5E3DF',
                  fontSize: 11,
                  color: '#6F6F6F',
                  fontFamily: 'var(--font-sans)',
                  textAlign: 'center'
                }}>
                  第 1 页 · 共 1 页
                </div>
              </div>
            </div>

            {bookOpen && (
              <div style={{
                marginTop: 48,
                textAlign: 'center',
                animation: 'fadeUp 0.8s ease 0.8s both'
              }}>
                <p style={{
                  fontSize: 16,
                  color: '#6F6F6F',
                  marginBottom: 20,
                  fontFamily: 'var(--font-sans)',
                  lineHeight: 1.6
                }}>
                  这只是你人生故事的第一页<br/>
                  创建账户，继续书写
                </p>
                <button
                  onClick={() => setStep('register')}
                  style={{
                    padding: '14px 40px',
                    background: '#2F3E5C',
                    color: 'white',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    boxShadow: '0 4px 16px rgba(47,62,92,.2)'
                  }}
                >
                  创建我的传记账户
                </button>
              </div>
            )}

            <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          </div>
        )}

        {step === 'register' && (
          <div style={{ maxWidth: 440, margin: '80px auto' }}>
            <h2 style={{
              fontSize: 32,
              fontWeight: 600,
              marginBottom: 12,
              textAlign: 'center',
              color: '#1F1F1F',
              fontFamily: 'var(--font-serif)'
            }}>
              为你的故事集创建账户
            </h2>
            <p style={{
              fontSize: 15,
              color: '#6F6F6F',
              marginBottom: 40,
              textAlign: 'center',
              fontFamily: 'var(--font-sans)'
            }}>
              第一个故事已准备好保存
            </p>

            <div style={{
              background: 'white',
              padding: 40,
              borderRadius: 16,
              border: '1px solid #E5E3DF',
              boxShadow: '0 4px 16px rgba(0,0,0,.06)'
            }}>
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  color: '#1F1F1F',
                  marginBottom: 8,
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)'
                }}>
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: '#FAFAFA',
                    border: '1px solid #E5E3DF',
                    borderRadius: 8,
                    color: '#1F1F1F',
                    fontSize: 15,
                    outline: 'none',
                    fontFamily: 'var(--font-sans)'
                  }}
                />
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  color: '#1F1F1F',
                  marginBottom: 8,
                  fontWeight: 500,
                  fontFamily: 'var(--font-sans)'
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
                    background: '#FAFAFA',
                    border: '1px solid #E5E3DF',
                    borderRadius: 8,
                    color: '#1F1F1F',
                    fontSize: 15,
                    outline: 'none',
                    fontFamily: 'var(--font-sans)'
                  }}
                />
              </div>

              <button
                onClick={handleRegister}
                disabled={isRegistering}
                style={{
                  width: '100%',
                  padding: '14px 32px',
                  background: '#2F3E5C',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: isRegistering ? 'not-allowed' : 'pointer',
                  opacity: isRegistering ? 0.7 : 1,
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {isRegistering ? '创建中...' : '创建账户'}
              </button>

              <p style={{
                fontSize: 13,
                color: '#6F6F6F',
                textAlign: 'center',
                marginTop: 24,
                fontFamily: 'var(--font-sans)'
              }}>
                已有账户？<Link href="/" style={{ color: '#2F3E5C', textDecoration: 'none', fontWeight: 500 }}>登录</Link>
              </p>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{
              width: 80,
              height: 80,
              margin: '0 auto 32px',
              background: 'rgba(47,62,92,.1)',
              border: '2px solid #2F3E5C',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              color: '#2F3E5C'
            }}>
              ✓
            </div>

            <h2 style={{
              fontSize: 36,
              fontWeight: 600,
              marginBottom: 16,
              color: '#1F1F1F',
              fontFamily: 'var(--font-serif)'
            }}>
              欢迎开始你的传记之旅
            </h2>

            <p style={{
              fontSize: 16,
              color: '#6F6F6F',
              marginBottom: 48,
              lineHeight: 1.7,
              fontFamily: 'var(--font-sans)'
            }}>
              你的第一个故事已保存<br/>
              继续书写，每一段记忆都将成为永恒
            </p>

            <Link
              href="/"
              style={{
                display: 'inline-block',
                padding: '16px 48px',
                background: '#2F3E5C',
                color: 'white',
                border: 'none',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)'
              }}
            >
              进入我的传记工作台
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
