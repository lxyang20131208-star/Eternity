'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import {
  listProjectOutlines,
  outlineToMarkdown,
  type BiographyOutline,
} from '../../lib/biographyOutlineApi'

const LOCAL_PHOTOS_KEY = 'photoFlow.photos'
const LOCAL_OUTLINE_ATTACHMENTS_KEY = 'outlineAttachments'

type PhotoItem = {
  id: string
  fileName: string
  previewUrl: string
  remoteUrl?: string
  people: Array<{ id: string; name: string; relation?: string }>
  scene: {
    location?: string
    date?: string
    event?: string
    tags: string[]
    notes?: string
  }
}

type AttachmentNote = {
  outlineVersion: number
  sectionIndex: number
  photoId: string
  note: string
  addedAt: string
}

export default function OutlineAnnotationPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [outlines, setOutlines] = useState<BiographyOutline[]>([])
  const [selected, setSelected] = useState<BiographyOutline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentNote[]>([])
  const [selectedSection, setSelectedSection] = useState<number | null>(null)
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const hasHydratedAttachments = useRef(false)

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2000)
  }

  async function initAuthAndProject() {
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUserId(null)
        setUserEmail(null)
        setProjectId(null)
        return
      }
      setUserId(user.id)
      setUserEmail(user.email ?? null)

      const { data: list, error: selErr } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', 'My Vault')
        .limit(1)

      if (selErr) throw selErr
      const existingId = list?.[0]?.id
      if (existingId) {
        setProjectId(existingId)
        return
      }

      const { data: created, error: insErr } = await supabase
        .from('projects')
        .insert({ owner_id: user.id, name: 'My Vault' })
        .select('id')
        .maybeSingle()
      if (insErr) throw insErr
      setProjectId(created?.id || null)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  async function loadOutlines(pid: string) {
    setLoading(true)
    try {
      const data = await listProjectOutlines(pid)
      setOutlines(data)
      if (data.length > 0) setSelected(data[0])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    initAuthAndProject()
  }, [])

  useEffect(() => {
    if (projectId) {
      loadOutlines(projectId)
    }
  }, [projectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const photosRaw = window.localStorage.getItem(LOCAL_PHOTOS_KEY)
      if (photosRaw) {
        const parsed = JSON.parse(photosRaw) as PhotoItem[]
        if (Array.isArray(parsed)) {
          setPhotos(
            parsed.filter((p) => {
              const preview = p.previewUrl || p.remoteUrl
              return preview && !preview.startsWith('blob:')
            })
          )
        }
      }
      const attachRaw = window.localStorage.getItem(LOCAL_OUTLINE_ATTACHMENTS_KEY)
      if (attachRaw) {
        const parsed = JSON.parse(attachRaw) as AttachmentNote[]
        if (Array.isArray(parsed)) {
          setAttachments(parsed)
        }
      }
      hasHydratedAttachments.current = true
    } catch (e) {
      console.warn('Annotation restore failed', e)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedAttachments.current) return
    try {
      window.localStorage.setItem(LOCAL_OUTLINE_ATTACHMENTS_KEY, JSON.stringify(attachments))
    } catch (e) {
      console.warn('Attachment persist failed', e)
    }
  }, [attachments])

  function attachPhoto() {
    if (selectedSection === null || !selectedPhotoId || !selected) return
    const exists = attachments.some(
      (a) => 
        a.outlineVersion === selected.version && 
        a.sectionIndex === selectedSection && 
        a.photoId === selectedPhotoId
    )
    if (exists) {
      showToast('已经附加过此照片', 'error')
      return
    }
    const newAttachment: AttachmentNote = {
      outlineVersion: selected.version,
      sectionIndex: selectedSection,
      photoId: selectedPhotoId,
      note: noteInput.trim(),
      addedAt: new Date().toISOString(),
    }
    setAttachments((prev) => [...prev, newAttachment])
    setNoteInput('')
    setSelectedPhotoId(null)
    showToast('照片已附加到大纲节点')
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    showToast('已移除附件')
  }

  const sectionAttachments = useMemo(() => {
    if (selectedSection === null || !selected) return []
    return attachments.filter(
      (a) => a.outlineVersion === selected.version && a.sectionIndex === selectedSection
    )
  }, [attachments, selectedSection, selected])

  return (
    <main className="detroit-bg" style={{ minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <div className="story-pill" style={{ marginBottom: 8 }}>VISUAL OUTLINING</div>
            <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '1px' }}>大纲视觉标注</h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>为大纲章节附加照片与备注，为 AI 生成书稿提供丰富上下文。</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/export" className="cyber-btn cyber-btn-primary" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}>
              导出电子书 →
            </Link>
            <Link href="/" className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}>
              ← 返回主页
            </Link>
          </div>
        </div>

        {!userId ? (
          <div className="glass-card" style={{ padding: 24 }}>登录后查看大纲。</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr 380px', gap: 16 }}>
            <aside className="glass-card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>版本列表</div>
              {loading ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>加载中...</div>
              ) : outlines.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>暂无大纲。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {outlines.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setSelected(o)
                        setSelectedSection(null)
                      }}
                      className="cyber-btn"
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        background: selected?.id === o.id ? 'linear-gradient(135deg, rgba(53,242,255,0.15), rgba(124,58,237,0.15))' : 'rgba(255,255,255,0.02)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>版本 {o.version}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: o.status === 'done' ? '#00ff88' : o.status === 'failed' ? '#ff4466' : '#00d4ff' }}>
                        {o.status.toUpperCase()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <div className="glass-card" style={{ padding: 16, maxHeight: '80vh', overflowY: 'auto' }}>
              {!selected ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>选择一个版本查看。</div>
              ) : selected.status !== 'done' || !selected.outline_json ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>大纲未就绪。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{selected.outline_json.title}</h2>
                  {selected.outline_json.sections.map((section, idx) => {
                    const attached = attachments.filter(
                      (a) => a.outlineVersion === selected.version && a.sectionIndex === idx
                    )
                    return (
                      <div
                        key={idx}
                        className="glass-card"
                        style={{
                          padding: 16,
                          borderColor: selectedSection === idx ? 'var(--accent-cyan)' : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedSection(idx)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{section.title}</h4>
                          {attached.length > 0 && (
                            <div className="story-pill" style={{ padding: '4px 8px', fontSize: 11 }}>
                              {attached.length} 张附件
                            </div>
                          )}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          {section.bullets.slice(0, 3).map((bullet, bidx) => (
                            <li key={bidx} style={{ marginBottom: 4 }}>{bullet}</li>
                          ))}
                          {section.bullets.length > 3 && <li style={{ fontStyle: 'italic', opacity: 0.7 }}>...更多</li>}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>附件管理</div>
                {selectedSection === null ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>点击左侧节点选择要标注的章节。</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      节点：{selected?.outline_json?.sections[selectedSection]?.title}
                    </div>
                    {sectionAttachments.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>已附加</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {sectionAttachments.map((att: AttachmentNote, i: number) => {
                            const photo = photos.find((p) => p.id === att.photoId)
                            const src = photo?.previewUrl || photo?.remoteUrl
                            return (
                              <div key={i} style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                                  {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#1a1f2e' }} />}
                                </div>
                                <div style={{ flex: 1, fontSize: 12 }}>
                                  <div style={{ fontWeight: 600 }}>{photo?.fileName || '未知'}</div>
                                  {att.note && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{att.note}</div>}
                                </div>
                                <button className="cyber-btn cyber-btn-danger" style={{ padding: '4px 8px', fontSize: 10, borderRadius: 6 }} onClick={() => removeAttachment(attachments.indexOf(att))}>
                                  移除
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>添加照片</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                      {photos.slice(0, 12).map((photo) => {
                        const src = photo.previewUrl || photo.remoteUrl
                        return (
                          <button
                            key={photo.id}
                            onClick={() => setSelectedPhotoId(photo.id)}
                            style={{
                              aspectRatio: '1',
                              borderRadius: 6,
                              overflow: 'hidden',
                              border: selectedPhotoId === photo.id ? '2px solid #35f2ff' : '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,255,255,0.02)',
                              cursor: 'pointer',
                              padding: 0,
                              boxShadow: selectedPhotoId === photo.id ? '0 0 0 4px rgba(53,242,255,0.2)' : 'none',
                            }}
                          >
                            {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#1a1f2e' }} />}
                          </button>
                        )
                      })}
                    </div>
                    {photos.length > 12 && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>显示前 12 张，去照片页查看全部。</div>}
                    <label style={{ display: 'block', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>备注（可选）</div>
                      <textarea className="cyber-input" rows={3} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="这张照片的故事、细节..." />
                    </label>
                    <button className="cyber-btn cyber-btn-primary" disabled={!selectedPhotoId} style={{ width: '100%', borderRadius: 6, padding: '10px', fontSize: 12 }} onClick={attachPhoto}>
                      附加到此节点
                    </button>
                  </>
                )}
              </div>

              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>统计</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>照片库：{photos.length} 张</div>
                  <div>附件总数：{attachments.length}</div>
                </div>
              </div>
            </aside>
          </div>
        )}

        {toast && (
          <div
            style={{
              position: 'fixed',
              right: 16,
              bottom: 16,
              padding: '12px 14px',
              borderRadius: 12,
              background: toast.type === 'success' ? 'rgba(53,242,255,0.12)' : 'rgba(255,68,102,0.12)',
              border: toast.type === 'success' ? '1px solid rgba(53,242,255,0.4)' : '1px solid rgba(255,68,102,0.4)',
              color: '#e5ecf5',
              boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
              zIndex: 20,
            }}
          >
            {toast.text}
          </div>
        )}
      </div>
    </main>
  )
}
