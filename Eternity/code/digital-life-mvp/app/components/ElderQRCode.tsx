'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import QRCode from 'qrcode'

export default function ElderQRCode() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserId(user.id)
      await loadOrGenerateToken(user.id)
      setLoading(false)
    }

    init()
  }, [])

  async function loadOrGenerateToken(uid: string) {
    try {
      // Try to get existing token from database
      const { data: existing, error: fetchError } = await supabase
        .from('elder_entry_tokens')
        .select('secret_token')
        .eq('user_id', uid)
        .maybeSingle()

      console.log('[ElderQRCode] Existing token:', existing, 'Error:', fetchError)

      let secretToken = existing?.secret_token

      // If no token exists, generate one
      if (!secretToken) {
        console.log('[ElderQRCode] No existing token, generating new one...')

        const res = await fetch('/api/elder/generate-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: uid }),
        })

        if (!res.ok) {
          const errorData = await res.json()
          console.error('[ElderQRCode] API error:', errorData)
          throw new Error(errorData.error || 'Failed to generate token')
        }

        const data = await res.json()
        secretToken = data.token
        console.log('[ElderQRCode] Token generated successfully')
      }

      setToken(secretToken)
      await generateQRCode(uid, secretToken)
    } catch (err: any) {
      console.error('[ElderQRCode] Load token error:', err)
      alert('生成二维码失败：' + (err.message || '未知错误'))
    }
  }

  async function generateQRCode(uid: string, secretToken: string) {
    const url = `${window.location.origin}/elder?uid=${uid}&k=${secretToken}`

    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#8B7355',
          light: '#FFFFFF',
        },
      })
      setQrCodeUrl(qrDataUrl)
    } catch (err) {
      console.error('QR code generation error:', err)
    }
  }

  async function handleResetToken() {
    if (!userId) return

    if (!confirm('重置后，旧的二维码将立即失效。确定要重置吗？')) {
      return
    }

    setResetting(true)
    try {
      const res = await fetch('/api/elder/reset-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      if (!res.ok) throw new Error('Failed to reset token')

      const data = await res.json()
      setToken(data.token)
      await generateQRCode(userId, data.token)

      alert('二维码已重置！')
    } catch (err) {
      console.error('Reset token error:', err)
      alert('重置失败，请重试')
    } finally {
      setResetting(false)
    }
  }

  function copyLink() {
    if (!userId || !token) return

    const url = `${window.location.origin}/elder?uid=${userId}&k=${token}`
    navigator.clipboard.writeText(url)
    alert('链接已复制！')
  }

  if (loading) {
    return (
      <div style={{
        padding: 24,
        background: 'white',
        borderRadius: 16,
        border: '1px solid rgba(184,155,114,0.2)',
      }}>
        <div style={{ textAlign: 'center', color: '#8B7355' }}>加载中...</div>
      </div>
    )
  }

  return (
    <div style={{
      padding: 24,
      background: 'white',
      borderRadius: 16,
      border: '2px solid rgba(184,155,114,0.2)',
    }}>
      <h3 style={{
        margin: '0 0 8px',
        fontSize: 20,
        fontWeight: 700,
        color: '#222',
      }}>
        👴 老人扫码录音入口
      </h3>
      <p style={{
        margin: '0 0 20px',
        fontSize: 14,
        color: '#5A4F43',
        lineHeight: 1.5,
      }}>
        生成一个永久二维码，让老人扫码后进入极简录音页面，回答问题并上传音频。
      </p>

      {qrCodeUrl && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 20,
        }}>
          <img
            src={qrCodeUrl}
            alt="Elder Entry QR Code"
            style={{
              width: 300,
              height: 300,
              border: '4px solid #8B7355',
              borderRadius: 12,
              marginBottom: 16,
            }}
          />
          <div style={{
            padding: '12px 20px',
            background: 'rgba(255,193,7,0.1)',
            border: '2px solid rgba(255,193,7,0.4)',
            borderRadius: 8,
            fontSize: 13,
            color: '#856404',
            textAlign: 'center',
            maxWidth: 300,
          }}>
            ⚠️ <strong>安全提示</strong><br/>
            此二维码仅供家人使用，请勿对外分享
          </div>
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={copyLink}
          style={{
            flex: 1,
            minWidth: 140,
            padding: '12px 20px',
            background: 'rgba(184,155,114,0.1)',
            border: '2px solid rgba(184,155,114,0.3)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#8B7355',
            cursor: 'pointer',
          }}
        >
          📋 复制链接
        </button>
        <button
          onClick={handleResetToken}
          disabled={resetting}
          style={{
            flex: 1,
            minWidth: 140,
            padding: '12px 20px',
            background: resetting ? '#ccc' : 'rgba(255,68,102,0.1)',
            border: '2px solid rgba(255,68,102,0.3)',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: resetting ? '#666' : '#ff4466',
            cursor: resetting ? 'not-allowed' : 'pointer',
          }}
        >
          {resetting ? '重置中...' : '🔄 重置二维码'}
        </button>
      </div>

      <div style={{
        marginTop: 20,
        padding: 14,
        background: 'rgba(33,150,243,0.05)',
        border: '1px solid rgba(33,150,243,0.2)',
        borderRadius: 8,
        fontSize: 12,
        color: '#1565C0',
        lineHeight: 1.6,
      }}>
        <strong>💡 使用说明：</strong><br/>
        1. 老人扫码或点击链接后，自动登录<br/>
        2. 页面会自动朗读题目，并显示超大录音按钮<br/>
        3. 录音完成自动上传，自动跳到下一题<br/>
        4. 已回答的问题不会再次出现<br/>
        5. 您可以在"主页"或"今日对话"中查看老人上传的录音
      </div>
    </div>
  )
}
