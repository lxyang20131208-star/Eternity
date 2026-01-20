'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

export default function BuyPage() {
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'plus' | 'pro'>('pro')

  // 检查登录状态
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // 未登录，重定向到登录页
      router.push('/signin?source=buy')
    } else {
      setUserId(user.id)
    }
  }

  async function handlePurchase(plan: 'plus' | 'pro') {
    if (!userId) return

    setIsProcessing(true)
    setError('')

    try {
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data?.error?.message || data?.error || '创建支付会话失败')
      }

      if (data.url) {
        // 直接跳转到 Stripe 托管的结账页面
        window.location.href = data.url
      } else {
        throw new Error('未能获取结账链接')
      }
    } catch (err: any) {
      console.error('Purchase error:', err)
      setError(err.message || '支付失败，请重试')
      setIsProcessing(false)
    }
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
    accent: '#8B7355',
    error: '#dc2626',
  }

  const fonts = {
    serif: '"Source Serif 4", "Noto Serif SC", "Songti SC", Georgia, serif',
    sans: '"Inter", "Noto Sans SC", -apple-system, sans-serif',
  }

  if (!userId) {
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
      fontFamily: fonts.sans,
      padding: '40px 24px',
    }}>
      <div style={{
        maxWidth: 1000,
        margin: '0 auto',
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
            marginBottom: 48,
          }}
        >
          ← 返回首页
        </Link>

        {/* 页面标题 */}
        <div style={{
          textAlign: 'center',
          marginBottom: 48,
        }}>
          <h1 style={{
            fontFamily: fonts.serif,
            fontSize: 36,
            fontWeight: 400,
            color: colors.text,
            marginBottom: 12,
          }}>
            永恒档案
          </h1>
          <p style={{
            fontSize: 18,
            color: colors.textSecondary,
            lineHeight: 1.6,
          }}>
            将你的记忆，写成一本书
          </p>
        </div>

        {/* 定价卡片组 */}
        <div className="pricing-cards" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 24,
          marginBottom: 32,
        }}>
          {/* Plus 方案 */}
          <div
            onClick={() => setSelectedPlan('plus')}
            style={{
              background: '#fff',
              border: `2px solid ${selectedPlan === 'plus' ? colors.accent : colors.border}`,
              borderRadius: 16,
              padding: 40,
              boxShadow: selectedPlan === 'plus' ? '0 4px 24px rgba(139, 115, 85, 0.15)' : '0 2px 16px rgba(0,0,0,0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {/* 方案名称 */}
            <div style={{
              marginBottom: 24,
            }}>
              <h2 style={{
                fontFamily: fonts.serif,
                fontSize: 24,
                fontWeight: 500,
                color: colors.text,
                marginBottom: 8,
              }}>
                EverArchive Plus
              </h2>
              <p style={{
                fontSize: 14,
                color: colors.textMuted,
                fontStyle: 'italic',
              }}>
                持续记录 / 轻量陪伴
              </p>
            </div>

            {/* 价格 */}
            <div style={{
              marginBottom: 32,
            }}>
              <div style={{
                fontSize: 40,
                fontWeight: 600,
                color: colors.text,
                marginBottom: 4,
              }}>
                $9.9<span style={{ fontSize: 18, fontWeight: 400, color: colors.textMuted }}>/月</span>
              </div>
              <p style={{
                fontSize: 13,
                color: colors.textMuted,
              }}>
                月度计划
              </p>
            </div>

            {/* 功能列表 */}
            <div style={{
              marginBottom: 32,
            }}>
              {[
                '每月 10 个问题额度',
                '可生成电子版内容',
                '实体书打印：$19.9 / 本',
              ].map((feature, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 0',
                    fontSize: 15,
                    color: colors.text,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ color: colors.accent, fontSize: 16, marginTop: 2 }}>✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* 选择指示 */}
            {selectedPlan === 'plus' && (
              <div style={{
                padding: '8px 16px',
                background: `${colors.accent}15`,
                borderRadius: 8,
                textAlign: 'center',
                fontSize: 13,
                color: colors.accent,
                fontWeight: 500,
              }}>
                已选择此方案
              </div>
            )}
          </div>

          {/* Pro 方案 */}
          <div
            onClick={() => setSelectedPlan('pro')}
            style={{
              background: '#fff',
              border: `2px solid ${selectedPlan === 'pro' ? colors.accent : colors.border}`,
              borderRadius: 16,
              padding: 40,
              boxShadow: selectedPlan === 'pro' ? '0 4px 24px rgba(139, 115, 85, 0.15)' : '0 2px 16px rgba(0,0,0,0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              position: 'relative',
            }}
          >
            {/* 推荐标签 */}
            <div style={{
              position: 'absolute',
              top: -12,
              right: 24,
              padding: '4px 12px',
              background: colors.accent,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 12,
            }}>
              推荐
            </div>

            {/* 方案名称 */}
            <div style={{
              marginBottom: 24,
            }}>
              <h2 style={{
                fontFamily: fonts.serif,
                fontSize: 24,
                fontWeight: 500,
                color: colors.text,
                marginBottom: 8,
              }}>
                EverArchive Pro
              </h2>
              <p style={{
                fontSize: 14,
                color: colors.textMuted,
                fontStyle: 'italic',
              }}>
                完整保存 / 一次到位
              </p>
            </div>

            {/* 价格 */}
            <div style={{
              marginBottom: 32,
            }}>
              <div style={{
                fontSize: 40,
                fontWeight: 600,
                color: colors.text,
                marginBottom: 4,
              }}>
                $99.9
              </div>
              <p style={{
                fontSize: 13,
                color: colors.textMuted,
              }}>
                一次性付费
              </p>
            </div>

            {/* 功能列表 */}
            <div style={{
              marginBottom: 32,
            }}>
              {[
                '完整功能解锁',
                '不受问题额度限制',
                '包含 2 本实体书打印权',
              ].map((feature, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 0',
                    fontSize: 15,
                    color: colors.text,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ color: colors.accent, fontSize: 16, marginTop: 2 }}>✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {/* 选择指示 */}
            {selectedPlan === 'pro' && (
              <div style={{
                padding: '8px 16px',
                background: `${colors.accent}15`,
                borderRadius: 8,
                textAlign: 'center',
                fontSize: 13,
                color: colors.accent,
                fontWeight: 500,
              }}>
                已选择此方案
              </div>
            )}
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: `1px solid ${colors.error}`,
            borderRadius: 8,
            color: colors.error,
            fontSize: 14,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* 购买按钮 */}
        <button
          onClick={() => handlePurchase(selectedPlan)}
          disabled={isProcessing}
          style={{
            width: '100%',
            maxWidth: 400,
            margin: '0 auto',
            display: 'block',
            padding: '16px 32px',
            background: isProcessing ? colors.bgAccent : colors.accent,
            color: isProcessing ? colors.textMuted : '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 16,
            fontWeight: 500,
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isProcessing ? '处理中...' : `购买 ${selectedPlan === 'plus' ? 'Plus' : 'Pro'} 方案`}
        </button>

        {/* 说明 */}
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          color: colors.textMuted,
          marginTop: 24,
          lineHeight: 1.6,
        }}>
          购买即表示您同意我们的服务条款和隐私政策
          <br />
          支付由安全支付网关处理
        </p>

        {/* 底部信息 */}
        <div style={{
          textAlign: 'center',
          marginTop: 48,
          fontSize: 14,
          color: colors.textMuted,
        }}>
          <p>需要帮助？ <a href="mailto:support@everarchive.com" style={{ color: colors.accent, textDecoration: 'none' }}>联系我们</a></p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .pricing-cards {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
