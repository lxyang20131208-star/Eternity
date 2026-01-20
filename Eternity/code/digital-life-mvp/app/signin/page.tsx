'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

function SignInPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const source = searchParams.get('source') || 'login'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // 检查是否已登录
  useEffect(() => {
    checkAuthAndRedirect()
  }, [])

  async function checkAuthAndRedirect() {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // 已登录，检查付费状态并跳转
        await redirectBasedOnStatus(user.id)
      } else {
        setIsCheckingAuth(false)
      }
    } catch (err) {
      console.error('Auth check error:', err)
      setIsCheckingAuth(false)
    }
  }

  async function redirectBasedOnStatus(userId: string) {
    try {
      // TODO: 检查用户付费状态
      // 这里需要查询数据库中的用户付费状态
      // 示例：const { data: profile } = await supabase.from('profiles').select('is_paid').eq('id', userId).single()

      const isPaid = false // 临时硬编码，后续需要从数据库查询

      if (isPaid) {
        // 已付费用户直接跳转到 main
        router.push('/main')
      } else {
        // 未付费用户根据 source 跳转
        if (source === 'draft') {
          router.push('/draft')
        } else if (source === 'buy') {
          router.push('/buy')
        } else {
          // source === 'login' 或其他情况
          router.push('/main')
        }
      }
    } catch (err) {
      console.error('Redirect error:', err)
      setIsCheckingAuth(false)
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      if (data.user) {
        // 登录成功，检查付费状态并跳转
        await redirectBasedOnStatus(data.user.id)
      }
    } catch (err: any) {
      console.error('Sign in error:', err)
      setError(err.message || '登录失败，请重试')
      setIsLoading(false)
    }
  }

  // ===== 设计系统 =====
  const colors = {
    // 暖色 / 纸张式配色
    bg: '#F8F6F2',
    bgCard: '#FFFFFF',
    text: '#3B2F23',
    textMuted: '#8C8377',
    border: '#E3D6C6',
    borderLight: '#F4EFE8',
    accent: '#B89B72',
    error: '#C97A63',
  }

  const fonts = {
    sans: '"Inter", "Noto Sans SC", -apple-system, sans-serif',
  }

  if (isCheckingAuth) {
    return (
      <div style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: fonts.sans,
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: `2px solid ${colors.border}`,
          borderTopColor: colors.accent,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
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

        {/* 登录卡片 */}
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
              Sign In
            </h1>
            <p style={{
              margin: '8px 0 0',
              fontSize: 14,
              color: colors.textMuted,
            }}>
              {source === 'draft' && '登录后开始体验'}
              {source === 'buy' && '登录后继续购买'}
              {source === 'login' && '登录到您的账户'}
            </p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSignIn}>
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
              }}
            >
              {isLoading ? 'SIGNING IN...' : '▸ SIGN IN'}
            </button>
          </form>

          {/* 注册提示 */}
          <p style={{
            textAlign: 'center',
            fontSize: 13,
            color: colors.textMuted,
            marginTop: 24,
          }}>
            还没有账户？{' '}
            <Link
              href="/signup"
              style={{
                color: colors.accent,
                textDecoration: 'none',
              }}
            >
              注册
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default function SignInPage() {
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
      <SignInPageContent />
    </Suspense>
  )
}
