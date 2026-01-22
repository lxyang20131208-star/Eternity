'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

function SignUpPageContent() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // 邮箱注册
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/signin`,
        },
      })

      if (error) throw error

      setMessage('注册成功，请前往邮箱验证后登录。')
      // Optional: Redirect to signin after a delay? 
      // For now, just showing the message is fine as per original logic.
    } catch (err: any) {
      setError(err.message || '注册失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  // Google 授权注册
  async function handleGoogleSignUp() {
    setIsLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/signin`,
        },
      })
      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Google 登录失败')
      setIsLoading(false)
    }
  }

  // ===== 设计系统 =====
  const colors = {
    bg: '#F8F6F2',
    bgCard: '#FFFFFF',
    text: '#3B2F23',
    textMuted: '#8C8377',
    border: '#E3D6C6',
    borderLight: '#F4EFE8',
    accent: '#B89B72',
    error: '#C97A63',
    success: '#4CAF50',
  }

  const fonts = {
    sans: '"Inter", "Noto Sans SC", -apple-system, sans-serif',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: colors.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      fontFamily: fonts.sans,
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
      }}>
        {/* 返回首页 */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: colors.textMuted,
            fontSize: 14,
            textDecoration: 'none',
            marginBottom: 32,
          }}
        >
          ← 返回首页
        </Link>

        {/* 注册卡片 */}
        <div style={{
          background: colors.bgCard,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 48,
          backdropFilter: 'blur(20px)',
        }}>
          {/* Logo 和标题 */}
          <div style={{
            textAlign: 'center',
            marginBottom: 40,
          }}>
            <div style={{
              width: 60,
              height: 60,
              margin: '0 auto 20px',
              background: 'linear-gradient(135deg, rgba(184,155,114,0.06), rgba(227,214,198,0.06))',
              border: '2px solid rgba(184,155,114,0.12)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: colors.accent,
            }}>
              ◈
            </div>
            <h1 style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              color: colors.text,
              letterSpacing: '0.5px',
            }}>
              Sign Up
            </h1>
            <p style={{
              margin: '8px 0 0',
              fontSize: 14,
              color: colors.textMuted,
            }}>
              注册新账号以开始使用
            </p>
          </div>

          {/* 注册表单 */}
          <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: colors.textMuted,
                marginBottom: 8,
                letterSpacing: '0.3px',
              }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="请输入邮箱"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.03)',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  color: colors.text,
                  fontSize: 14,
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
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: colors.textMuted,
                marginBottom: 8,
                letterSpacing: '0.3px',
              }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="设置密码（至少6位）"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'rgba(0, 0, 0, 0.03)',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 6,
                  color: colors.text,
                  fontSize: 14,
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
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(255, 107, 107, 0.1)',
                border: `1px solid ${colors.error}`,
                borderRadius: 6,
                color: colors.error,
                fontSize: 13,
                marginBottom: 24,
              }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(76, 175, 80, 0.1)',
                border: `1px solid ${colors.success}`,
                borderRadius: 6,
                color: colors.success,
                fontSize: 13,
                marginBottom: 24,
              }}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: isLoading ? colors.borderLight : colors.accent,
                color: isLoading ? colors.textMuted : '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                letterSpacing: '0.5px',
                marginBottom: 16,
              }}
            >
              {isLoading ? '注册中...' : '▸ 注册'}
            </button>
          </form>

          {/* Google 注册按钮 */}
          <button
            onClick={handleGoogleSignUp}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: '#FFFFFF',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <img src="/google.svg" alt="Google" style={{ width: 18, height: 18 }} />
            使用 Google 注册
          </button>

          {/* 登录链接 */}
          <p style={{
            textAlign: 'center',
            fontSize: 13,
            color: colors.textMuted,
            marginTop: 24,
          }}>
            已有账户？{' '}
            <Link
              href="/signin"
              style={{
                color: colors.accent,
                textDecoration: 'none',
              }}
            >
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#F8F6F2'
      }}>
        <div style={{ color: '#8C8377', fontSize: 16 }}>Loading...</div>
      </div>
    }>
      <SignUpPageContent />
    </Suspense>
  )
}
