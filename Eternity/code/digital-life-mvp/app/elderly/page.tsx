'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import UnifiedNav from '@/app/components/UnifiedNav'
import ElderQRCode from '@/app/components/ElderQRCode'

export default function ElderlyManagementPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [recentRecordings, setRecentRecordings] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/signin')
        return
      }

      setIsAuthenticated(true)

      // Load recent recordings from elder entry
      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1)

      if (projects && projects.length > 0) {
        const { data: sessions } = await supabase
          .from('answer_sessions')
          .select(`
            id,
            question_id,
            audio_file_path,
            transcript_text,
            duration_seconds,
            created_at,
            recording_method,
            questions (
              id,
              text
            )
          `)
          .eq('project_id', projects[0].id)
          .eq('recording_method', 'elder_entry')
          .order('created_at', { ascending: false })
          .limit(10)

        setRecentRecordings(sessions || [])
      }

      setLoading(false)
    }

    init()
  }, [router])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F8F6F2',
      }}>
        <div style={{ fontSize: 18, color: '#8B7355' }}>加载中...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F8F6F2',
      padding: '24px 16px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <UnifiedNav />

        {/* Page Header */}
        <div style={{
          marginTop: 32,
          marginBottom: 32,
          textAlign: 'center',
        }}>
          <h1 style={{
            margin: '0 0 12px',
            fontSize: 36,
            fontWeight: 700,
            color: '#222',
            letterSpacing: '0.5px',
          }}>
            👴 老人录音管理
          </h1>
          <p style={{
            margin: 0,
            fontSize: 16,
            color: '#5A4F43',
            lineHeight: 1.6,
          }}>
            为老人生成专属录音入口，让他们用手机扫码即可轻松录制回忆
          </p>
        </div>

        {/* Two Column Layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          alignItems: 'start',
        }}>
          {/* Left Column: QR Code */}
          <div>
            <ElderQRCode />
          </div>

          {/* Right Column: Recent Recordings */}
          <div style={{
            padding: 24,
            background: 'white',
            borderRadius: 16,
            border: '2px solid rgba(184,155,114,0.2)',
          }}>
            <h3 style={{
              margin: '0 0 16px',
              fontSize: 20,
              fontWeight: 700,
              color: '#222',
            }}>
              📼 最近录音 ({recentRecordings.length})
            </h3>

            {recentRecordings.length === 0 ? (
              <div style={{
                padding: 40,
                textAlign: 'center',
                color: '#8B7355',
                fontSize: 14,
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎙️</div>
                <div>暂无录音</div>
                <div style={{ fontSize: 12, marginTop: 8, color: '#999' }}>
                  老人扫码后录制的内容会显示在这里
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recentRecordings.map((recording) => (
                  <div
                    key={recording.id}
                    style={{
                      padding: 16,
                      background: 'rgba(184,155,114,0.03)',
                      border: '1px solid rgba(184,155,114,0.15)',
                      borderRadius: 12,
                    }}
                  >
                    <div style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#222',
                      marginBottom: 8,
                    }}>
                      {recording.questions?.text || '未知问题'}
                    </div>

                    <div style={{
                      fontSize: 12,
                      color: '#8B7355',
                      marginBottom: 8,
                    }}>
                      📅 {new Date(recording.created_at).toLocaleString('zh-CN')}
                      {recording.duration_seconds && (
                        <span style={{ marginLeft: 12 }}>
                          ⏱️ {Math.floor(recording.duration_seconds / 60)}:{(recording.duration_seconds % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>

                    {recording.transcript_text && (
                      <div style={{
                        padding: 12,
                        background: 'rgba(255,255,255,0.8)',
                        borderRadius: 8,
                        fontSize: 13,
                        color: '#5A4F43',
                        lineHeight: 1.5,
                        marginTop: 8,
                      }}>
                        {recording.transcript_text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div style={{
          marginTop: 32,
          padding: 24,
          background: 'linear-gradient(135deg, rgba(184,155,114,0.05), rgba(168,136,100,0.03))',
          border: '2px solid rgba(184,155,114,0.15)',
          borderRadius: 16,
        }}>
          <h3 style={{
            margin: '0 0 16px',
            fontSize: 18,
            fontWeight: 700,
            color: '#222',
          }}>
            💡 使用指南
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20,
          }}>
            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>1️⃣</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 4 }}>
                分享二维码
              </div>
              <div style={{ fontSize: 13, color: '#5A4F43', lineHeight: 1.5 }}>
                将二维码发送给老人，或让他们用微信"扫一扫"功能扫描
              </div>
            </div>

            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>2️⃣</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 4 }}>
                老人扫码录音
              </div>
              <div style={{ fontSize: 13, color: '#5A4F43', lineHeight: 1.5 }}>
                自动进入极简录音界面，大字显示、自动朗读题目、一键录音
              </div>
            </div>

            <div>
              <div style={{ fontSize: 32, marginBottom: 8 }}>3️⃣</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#222', marginBottom: 4 }}>
                自动同步整理
              </div>
              <div style={{ fontSize: 13, color: '#5A4F43', lineHeight: 1.5 }}>
                录音自动上传、转写、归档到您的主页，与您的回答合并展示
              </div>
            </div>
          </div>
        </div>

        {/* Back to Main */}
        <div style={{
          marginTop: 32,
          textAlign: 'center',
        }}>
          <button
            onClick={() => router.push('/main')}
            style={{
              padding: '12px 32px',
              background: 'rgba(184,155,114,0.1)',
              border: '2px solid rgba(184,155,114,0.3)',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              color: '#8B7355',
              cursor: 'pointer',
            }}
          >
            ← 返回主页
          </button>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: '1fr 1fr'"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
