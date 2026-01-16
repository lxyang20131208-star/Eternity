'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listProjectOutlines, type BiographyOutline } from '../../lib/biographyOutlineApi'
import { supabase } from '../../lib/supabaseClient'
import { getPeople } from '../../lib/knowledgeGraphApi'
import type { PersonWithRelations } from '../../lib/types/knowledge-graph'

const LOCAL_NETWORK_KEY = 'familyNetwork.data'
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

export type FamilyMember = {
  id: string
  name: string
  birthYear?: number
  avatarUrl?: string
  notes?: string
  generation?: number
  x?: number
  y?: number
}

export type Relationship = {
  id: string
  from: string
  to: string
  type: 'parent' | 'spouse' | 'sibling' | 'custom'
  label?: string
}

type FamilyNetwork = {
  members: FamilyMember[]
  relationships: Relationship[]
}

const DEMO_NETWORK: FamilyNetwork = {
  members: [
    { id: 'm1', name: '祖父', generation: 0, x: 400, y: 100 },
    { id: 'm2', name: '祖母', generation: 0, x: 520, y: 100 },
    { id: 'm3', name: '父亲', generation: 1, x: 300, y: 240 },
    { id: 'm4', name: '母亲', generation: 1, x: 420, y: 240 },
    { id: 'm5', name: '叔叔', generation: 1, x: 580, y: 240 },
    { id: 'm6', name: '我', generation: 2, x: 360, y: 380 },
  ],
  relationships: [
    { id: 'r1', from: 'm1', to: 'm3', type: 'parent' },
    { id: 'r2', from: 'm1', to: 'm5', type: 'parent' },
    { id: 'r3', from: 'm2', to: 'm3', type: 'parent' },
    { id: 'r4', from: 'm2', to: 'm5', type: 'parent' },
    { id: 'r5', from: 'm1', to: 'm2', type: 'spouse' },
    { id: 'r6', from: 'm3', to: 'm4', type: 'spouse' },
    { id: 'r7', from: 'm3', to: 'm6', type: 'parent' },
    { id: 'r8', from: 'm4', to: 'm6', type: 'parent' },
  ],
}

export default function FamilyNetworkPage() {
  const [network, setNetwork] = useState<FamilyNetwork>(DEMO_NETWORK)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentNote[]>([])
  const [outlines, setOutlines] = useState<BiographyOutline[]>([])
  const [outlinesLoading, setOutlinesLoading] = useState(false)
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const hasHydrated = useRef(false)

  const selectedMember = useMemo(
    () => network.members.find((m) => m.id === selectedMemberId),
    [network.members, selectedMemberId]
  )

  const relatedRelationships = useMemo(() => {
    if (!selectedMemberId) return []
    return network.relationships.filter((r) => r.from === selectedMemberId || r.to === selectedMemberId)
  }, [network.relationships, selectedMemberId])

  const taggedPhotos = useMemo(() => {
    if (!selectedMember) return []
    return photos.filter((photo) => photo.people.some((p) => p.name === selectedMember.name))
  }, [photos, selectedMember])

  const memberSections = useMemo(() => {
    if (!selectedMember || outlines.length === 0 || attachments.length === 0) return []
    const map = new Map<string, { version: number; title: string; bullets: string[]; noteSnippets: string[]; photoCount: number }>()
    const memberName = selectedMember.name

    attachments.forEach((att) => {
      const photo = photos.find((p) => p.id === att.photoId)
      if (!photo) return
      const hasPerson = photo.people.some((p) => p.name === memberName)
      if (!hasPerson) return
      const outline = outlines.find((o) => o.version === att.outlineVersion && o.outline_json)
      const section = outline?.outline_json?.sections?.[att.sectionIndex]
      if (!outline || !section) return
      const key = `${outline.version}-${att.sectionIndex}`
      const existing = map.get(key) || {
        version: outline.version,
        title: section.title,
        bullets: section.bullets,
        noteSnippets: [],
        photoCount: 0,
      }
      existing.photoCount += 1
      if (att.note) existing.noteSnippets.push(att.note)
      map.set(key, existing)
    })

    return Array.from(map.values()).sort((a, b) => b.photoCount - a.photoCount)
  }, [attachments, outlines, photos, selectedMember])

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2000)
  }

  useEffect(() => {
    if (hasHydrated.current || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(LOCAL_NETWORK_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as FamilyNetwork
        if (parsed.members && parsed.relationships) {
          setNetwork(parsed)
        }
      }
      // Load photos for tagging integration
      const photosRaw = window.localStorage.getItem(LOCAL_PHOTOS_KEY)
      if (photosRaw) {
        const parsedPhotos = JSON.parse(photosRaw) as PhotoItem[]
        if (Array.isArray(parsedPhotos)) {
          setPhotos(parsedPhotos.filter((p) => {
            const preview = p.previewUrl || p.remoteUrl
            return preview && !preview.startsWith('blob:')
          }))
        }
      }
        const attachRaw = window.localStorage.getItem(LOCAL_OUTLINE_ATTACHMENTS_KEY)
        if (attachRaw) {
          const parsed = JSON.parse(attachRaw) as AttachmentNote[]
          if (Array.isArray(parsed)) {
            setAttachments(parsed)
          }
        }
    } catch (e) {
      console.warn('Network restore failed', e)
    } finally {
      hasHydrated.current = true
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated.current || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LOCAL_NETWORK_KEY, JSON.stringify(network))
    } catch (e) {
      console.warn('Network persist failed', e)
    }
  }, [network])

  useEffect(() => {
    let canceled = false
    async function loadOutlines() {
      setOutlinesLoading(true)
      setOutlineError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || canceled) return

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)

        if (selErr) throw selErr
        let projectId = list?.[0]?.id as string | undefined

        if (!projectId) {
          const { data: created, error: insErr } = await supabase
            .from('projects')
            .insert({ owner_id: user.id, name: 'My Vault' })
            .select('id')
            .maybeSingle()
          if (insErr) throw insErr
          projectId = created?.id
        }

        if (!projectId || canceled) return
        const data = await listProjectOutlines(projectId)
        if (!canceled) {
          setOutlines(data.filter((o) => o.status === 'done' && o.outline_json))
        }
      } catch (err: any) {
        if (!canceled) setOutlineError(err?.message || '无法加载大纲')
      } finally {
        if (!canceled) setOutlinesLoading(false)
      }
    }

    loadOutlines()
    return () => {
      canceled = true
    }
  }, [])

  function addMember(member: Omit<FamilyMember, 'id'>) {
    const newMember: FamilyMember = {
      ...member,
      id: crypto.randomUUID(),
      x: member.x ?? 400,
      y: member.y ?? 300,
    }
    setNetwork((prev) => ({ ...prev, members: [...prev.members, newMember] }))
    showToast(`已添加成员：${newMember.name}`)
    setShowAddMember(false)
  }

  function updateMember(id: string, updates: Partial<FamilyMember>) {
    setNetwork((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }))
  }

  function deleteMember(id: string) {
    setNetwork((prev) => ({
      members: prev.members.filter((m) => m.id !== id),
      relationships: prev.relationships.filter((r) => r.from !== id && r.to !== id),
    }))
    showToast('已删除成员')
    setSelectedMemberId(null)
  }

  function addRelationship(from: string, to: string, type: Relationship['type'], label?: string) {
    const rel: Relationship = { id: crypto.randomUUID(), from, to, type, label }
    setNetwork((prev) => ({ ...prev, relationships: [...prev.relationships, rel] }))
    showToast('关系已添加')
    setShowAddRelation(false)
  }

  function deleteRelationship(id: string) {
    setNetwork((prev) => ({
      ...prev,
      relationships: prev.relationships.filter((r) => r.id !== id),
    }))
    showToast('关系已删除')
  }

  function clearNetwork() {
    if (!confirm('确认清空整个家族网络？')) return
    setNetwork({ members: [], relationships: [] })
    setSelectedMemberId(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LOCAL_NETWORK_KEY)
    }
    showToast('网络已清空')
  }

  function getRelationshipLabel(rel: Relationship): string {
    if (rel.label) return rel.label
    switch (rel.type) {
      case 'parent':
        return '父母'
      case 'spouse':
        return '配偶'
      case 'sibling':
        return '兄弟姐妹'
      default:
        return '自定义'
    }
  }

  return (
    <main className="detroit-bg" style={{ minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
          <div>
            <div className="story-pill" style={{ marginBottom: 8 }}>FAMILY NETWORK</div>
            <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '1px' }}>动态家族关系网</h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>管理成员、定义关系、与照片库联动查询。</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="cyber-btn cyber-btn-primary" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13 }} onClick={() => setShowAddMember(true)}>
              + 添加成员
            </button>
            <button className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13 }} onClick={() => setShowAddRelation(true)}>
              + 添加关系
            </button>
            <button className="cyber-btn cyber-btn-danger" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13 }} onClick={clearNetwork}>
              清空网络
            </button>
            <Link href="/" className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}>
              ← 返回主页
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
          <div className="glass-card" style={{ padding: 24, minHeight: 600, position: 'relative', overflow: 'hidden' }}>
            <div ref={canvasRef} style={{ position: 'relative', width: '100%', height: 560 }}>
              <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {network.relationships.map((rel) => {
                  const from = network.members.find((m) => m.id === rel.from)
                  const to = network.members.find((m) => m.id === rel.to)
                  if (!from || !to) return null
                  const x1 = from.x ?? 0
                  const y1 = from.y ?? 0
                  const x2 = to.x ?? 0
                  const y2 = to.y ?? 0
                  const color = rel.type === 'spouse' ? '#7c3aed' : rel.type === 'parent' ? '#00d4ff' : '#94a3b8'
                  return (
                    <line
                      key={rel.id}
                      x1={x1 + 30}
                      y1={y1 + 30}
                      x2={x2 + 30}
                      y2={y2 + 30}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray={rel.type === 'custom' ? '5,5' : undefined}
                      opacity={0.6}
                    />
                  )
                })}
              </svg>
              {network.members.map((member) => (
                <div
                  key={member.id}
                  draggable
                  onDragEnd={(e) => {
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (!rect) return
                    const x = e.clientX - rect.left - 30
                    const y = e.clientY - rect.top - 30
                    updateMember(member.id, { x: Math.max(0, Math.min(rect.width - 60, x)), y: Math.max(0, Math.min(rect.height - 60, y)) })
                  }}
                  onClick={() => setSelectedMemberId(member.id)}
                  style={{
                    position: 'absolute',
                    left: member.x ?? 0,
                    top: member.y ?? 0,
                    width: 60,
                    height: 60,
                    borderRadius: 14,
                    background: selectedMemberId === member.id ? 'linear-gradient(135deg, #35f2ff, #7c3aed)' : 'linear-gradient(135deg, rgba(53,242,255,0.2), rgba(124,58,237,0.2))',
                    border: selectedMemberId === member.id ? '2px solid #35f2ff' : '1px solid rgba(255,255,255,0.2)',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'move',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#e5ecf5',
                    textAlign: 'center',
                    padding: 4,
                    boxShadow: selectedMemberId === member.id ? '0 0 0 4px rgba(53,242,255,0.2)' : '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s',
                  }}
                >
                  {member.name}
                </div>
              ))}
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>已选成员</div>
              {selectedMember ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>姓名</div>
                    <div style={{ fontWeight: 600 }}>{selectedMember.name}</div>
                  </div>
                  {selectedMember.birthYear && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>出生年份</div>
                      <div style={{ fontWeight: 600 }}>{selectedMember.birthYear}</div>
                    </div>
                  )}
                  {selectedMember.generation !== undefined && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>世代</div>
                      <div style={{ fontWeight: 600 }}>第 {selectedMember.generation} 代</div>
                    </div>
                  )}
                  {selectedMember.notes && (
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>备注</div>
                      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{selectedMember.notes}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button className="cyber-btn" style={{ flex: 1, borderRadius: 6, padding: '8px', fontSize: 12 }} onClick={() => alert('编辑功能即将推出')}>
                      编辑
                    </button>
                    <button className="cyber-btn cyber-btn-danger" style={{ flex: 1, borderRadius: 6, padding: '8px', fontSize: 12 }} onClick={() => deleteMember(selectedMember.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>点击画布中的节点查看详情</div>
              )}
            </div>

            {selectedMember && relatedRelationships.length > 0 && (
              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>关联关系</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relatedRelationships.map((rel) => {
                    const other = network.members.find((m) => m.id === (rel.from === selectedMemberId ? rel.to : rel.from))
                    return (
                      <div key={rel.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: '#67e8f9' }}>{other?.name || '未知'}</span>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>· {getRelationshipLabel(rel)}</span>
                        </div>
                        <button className="cyber-btn cyber-btn-danger" style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6 }} onClick={() => deleteRelationship(rel.id)}>
                          删除
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedMember && taggedPhotos.length > 0 && (
              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>关联照片 ({taggedPhotos.length})</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {taggedPhotos.map((photo) => {
                    const src = photo.previewUrl || photo.remoteUrl
                    return (
                      <div
                        key={photo.id}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 8,
                          overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.1)',
                          background: 'rgba(255,255,255,0.02)',
                          cursor: 'pointer',
                        }}
                        title={photo.fileName}
                      >
                        {src ? (
                          <img src={src} alt={photo.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 10, color: '#94a3b8' }}>无预览</div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <a href="/photos/new" className="cyber-btn" style={{ width: '100%', marginTop: 10, borderRadius: 6, padding: '8px', fontSize: 12, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
                  去标记更多照片
                </a>
              </div>
            )}

            {selectedMember && (
              <div className="glass-card" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>核心段落链接</div>
                {outlinesLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>大纲加载中...</div>
                ) : outlineError ? (
                  <div style={{ fontSize: 12, color: '#ff9aa2' }}>{outlineError}</div>
                ) : memberSections.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>暂无与该成员相关的大纲段落。</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {memberSections.map((section) => (
                      <div
                        key={`${section.version}-${section.title}`}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600 }}>{section.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>版本 {section.version} · {section.photoCount} 张关联照片</div>
                          </div>
                          <a
                            href="/outline-annotate"
                            className="cyber-btn"
                            style={{ padding: '6px 10px', fontSize: 11, borderRadius: 6, textDecoration: 'none' }}
                          >
                            前往大纲
                          </a>
                        </div>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {section.bullets.slice(0, 2).map((b, idx) => (
                            <li key={idx}>{b}</li>
                          ))}
                          {section.bullets.length > 2 && <li style={{ opacity: 0.7 }}>...更多</li>}
                        </ul>
                        {section.noteSnippets.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                            {section.noteSnippets.slice(0, 2).map((note, idx) => (
                              <div key={idx} style={{ marginBottom: 2 }}>“{note}”</div>
                            ))}
                            {section.noteSnippets.length > 2 && <div style={{ opacity: 0.7 }}>...更多备注</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="glass-card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>统计</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                <div>成员：{network.members.length} 人</div>
                <div>关系：{network.relationships.length} 条</div>
                <div>照片：{photos.length} 张</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showAddMember && <AddMemberModal onClose={() => setShowAddMember(false)} onAdd={addMember} />}
      {showAddRelation && <AddRelationModal network={network} onClose={() => setShowAddRelation(false)} onAdd={addRelationship} />}

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
    </main>
  )
}

function AddMemberModal({ onClose, onAdd }: { onClose: () => void; onAdd: (member: Omit<FamilyMember, 'id'>) => void }) {
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [generation, setGeneration] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass-card" style={{ padding: 24, minWidth: 400, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>添加成员</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>姓名 *</div>
            <input className="cyber-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：祖父" />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>出生年份</div>
            <input className="cyber-input" type="number" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="如：1950" />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>世代</div>
            <input className="cyber-input" type="number" value={generation} onChange={(e) => setGeneration(e.target.value)} placeholder="如：0（最长辈）" />
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>备注</div>
            <textarea className="cyber-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="补充信息..." />
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="cyber-btn" style={{ flex: 1, borderRadius: 6, padding: '10px' }} onClick={onClose}>
              取消
            </button>
            <button
              className="cyber-btn cyber-btn-primary"
              style={{ flex: 1, borderRadius: 6, padding: '10px' }}
              disabled={!name.trim()}
              onClick={() => {
                onAdd({
                  name: name.trim(),
                  birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
                  generation: generation ? parseInt(generation, 10) : undefined,
                  notes: notes.trim() || undefined,
                })
              }}
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddRelationModal({ network, onClose, onAdd }: { network: FamilyNetwork; onClose: () => void; onAdd: (from: string, to: string, type: Relationship['type'], label?: string) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [type, setType] = useState<Relationship['type']>('parent')
  const [label, setLabel] = useState('')

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass-card" style={{ padding: 24, minWidth: 400, maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>添加关系</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>从</div>
            <select className="cyber-input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">选择成员...</option>
              {network.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>到</div>
            <select className="cyber-input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">选择成员...</option>
              {network.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>关系类型</div>
            <select className="cyber-input" value={type} onChange={(e) => setType(e.target.value as Relationship['type'])}>
              <option value="parent">父母</option>
              <option value="spouse">配偶</option>
              <option value="sibling">兄弟姐妹</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          {type === 'custom' && (
            <label>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>自定义标签</div>
              <input className="cyber-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如：表兄弟、养父母" />
            </label>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="cyber-btn" style={{ flex: 1, borderRadius: 6, padding: '10px' }} onClick={onClose}>
              取消
            </button>
            <button className="cyber-btn cyber-btn-primary" style={{ flex: 1, borderRadius: 6, padding: '10px' }} disabled={!from || !to || from === to} onClick={() => onAdd(from, to, type, label.trim() || undefined)}>
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
