'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import UnifiedNav from '../components/UnifiedNav'
import {
  listProjectOutlines,
  outlineToMarkdown,
  type BiographyOutline,
} from '../../lib/biographyOutlineApi'
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

function SortableChapterItem({ 
  section, 
  idx, 
  selectedSection, 
  attachedCount, 
  onClick, 
  onDelete 
}: {
  section: any, 
  idx: number, 
  selectedSection: number | null, 
  attachedCount: number,
  onClick: () => void,
  onDelete: (e: React.MouseEvent) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `section-${idx}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    marginBottom: 16
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="transition-colors group relative"
    >
      <div
        style={{
          padding: 16,
          paddingLeft: 40, // Space for drag handle
          borderRadius: 8,
          border: selectedSection === idx ? '2px solid #2C2C2C' : '1px solid #E5E5E0',
          cursor: 'pointer',
          background: selectedSection === idx ? '#FAFAFA' : 'white',
          position: 'relative'
        }}
        onClick={onClick}
      >
        {/* Drag Handle */}
        <div 
          {...attributes} 
          {...listeners}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'grab',
            padding: 4,
            opacity: 0.3
          }}
          className="hover:opacity-100"
        >
          ⋮⋮
        </div>

        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-red-500 hover:bg-red-50 p-1 rounded"
          style={{ transition: 'opacity 0.2s' }}
          title="删除章节"
        >
          🗑️
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#2C2C2C' }}>{section.title}</h4>
          {attachedCount > 0 && (
            <div className="bg-[#2C2C2C] text-white rounded-full" style={{ padding: '2px 8px', fontSize: 11, marginRight: 20 }}>
              {attachedCount} 张附件
            </div>
          )}
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#666666', lineHeight: 1.6 }}>
          {section.bullets.slice(0, 3).map((bullet: string, bidx: number) => (
            <li key={bidx} style={{ marginBottom: 4 }}>{bullet}</li>
          ))}
          {section.bullets.length > 3 && <li style={{ fontStyle: 'italic', opacity: 0.7 }}>...更多</li>}
        </ul>
        {section.quotes && section.quotes.length > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#F9FAFB', borderLeft: '3px solid #B89B72', borderRadius: '0 4px 4px 0' }}>
            {section.quotes.map((q: { text: string }, i: number) => (
              <div key={i} style={{ fontSize: 12, color: '#5A4F43', fontStyle: 'italic', marginBottom: 4 }}>
                "{q.text}"
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  // Local state for reordering
  const [localSections, setLocalSections] = useState<any[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const hasHydratedAttachments = useRef(false)

  // Sync local sections when selected outline changes
  useEffect(() => {
    if (selected && selected.outline_json?.sections) {
      setLocalSections(selected.outline_json.sections)
      setHasChanges(false)
    } else {
      setLocalSections([])
    }
  }, [selected?.id]) // Only reset when ID changes, not when we update 'selected' locally

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

  async function loadPhotosFromSupabase(uid: string) {
    try {
      const { data: serverPhotos, error } = await supabase
        .from('photo_memories')
        .select('id, file_name, photo_url, place_id, time_taken, caption, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (serverPhotos) {
        const mappedServerPhotos: PhotoItem[] = serverPhotos.map((p) => ({
          id: p.id,
          fileName: p.file_name,
          previewUrl: p.photo_url,
          remoteUrl: p.photo_url,
          people: [],
          scene: {
            location: p.place_id,
            date: p.time_taken,
            notes: p.caption,
            tags: [],
          },
        }));

        setPhotos((prevLocal) => {
          const serverIds = new Set(mappedServerPhotos.map(p => p.id));
          const uniqueLocal = prevLocal.filter(p => !serverIds.has(p.id));
          return [...mappedServerPhotos, ...uniqueLocal];
        });
      }
    } catch (e) {
      console.error('Error loading server photos:', e);
    }
  }

  useEffect(() => {
    initAuthAndProject()
  }, [])

  useEffect(() => {
    if (userId) {
      loadPhotosFromSupabase(userId);
    }
  }, [userId]);

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setLocalSections((items) => {
        const oldIndex = items.findIndex((_, idx) => `section-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `section-${idx}` === over?.id);
        
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  }

  function handleDeleteChapter(index: number) {
    if (!confirm('确定要删除这个章节吗？')) return;
    
    setLocalSections(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
    if (selectedSection === index) setSelectedSection(null);
  }

  async function saveOutlineChanges() {
    if (!selected || !projectId || !selected.outline_json) return;
    
    try {
      // Ensure we preserve all required fields
      const currentJson = selected.outline_json;
      const updatedOutlineJson = {
        ...currentJson,
        sections: localSections,
      };
      
      // Ensure sections is overridden correctly
      updatedOutlineJson.sections = localSections;

      const { error } = await supabase
        .from('biography_outlines')
        .update({ 
          outline_json: updatedOutlineJson,
          updated_at: new Date().toISOString()
        })
        .eq('id', selected.id);

      if (error) throw error;

      // Update local state
      const newSelected = {
        ...selected,
        outline_json: updatedOutlineJson as any
      };
      setSelected(newSelected);
      
      // Also update the list
      setOutlines(prev => prev.map(o => 
        o.id === selected.id 
          ? newSelected
          : o
      ));

      setHasChanges(false);
      showToast('大纲修改已保存');
    } catch (e: any) {
      console.error('Save failed:', e);
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  const sectionAttachments = useMemo(() => {
    if (selectedSection === null || !selected) return []
    return attachments.filter(
      (a) => a.outlineVersion === selected.version && a.sectionIndex === selectedSection
    )
  }, [attachments, selectedSection, selected])

  return (
    <div 
      className="min-h-screen bg-[#F7F5F2]"
      style={{ fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 4px' }}>
        <UnifiedNav />
        
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                大纲视觉标注
              </h1>
              <p className="text-[#666666] mt-1">
                为大纲章节附加照片与备注，为 AI 生成书稿提供丰富上下文。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/export" className="px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium shadow-sm flex items-center gap-2">
                导出电子书 →
              </Link>
              <Link href="/main" className="px-5 py-2.5 bg-white border border-[#E5E5E0] hover:bg-[#F5F5F0] text-[#2C2C2C] rounded-xl transition-all duration-200 font-medium shadow-sm flex items-center gap-2">
                ← 返回主页
              </Link>
            </div>
          </div>
        </div>

        {!userId ? (
          <div className="glass-card" style={{ padding: 24 }}>登录后查看大纲。</div>
        ) : (
          <>
            <style jsx>{`
              .annotate-grid {
                display: grid;
                grid-template-columns: 280px 1fr 380px;
                gap: 16px;
                padding: 0 16px 24px;
              }
              @media (max-width: 1024px) {
                .annotate-grid {
                  grid-template-columns: 240px 1fr;
                }
                .annotate-sidebar-right {
                  display: none; /* Consider moving below or toggling on mobile if critical */
                  grid-column: 1 / -1;
                }
              }
              @media (max-width: 768px) {
                .annotate-grid {
                  display: flex;
                  flex-direction: column;
                  padding: 0 16px 24px;
                }
                .annotate-sidebar-right {
                  display: block;
                }
              }
            `}</style>
            <div className="annotate-grid">
              <aside className="bg-white rounded-xl shadow-lg border border-gray-200" style={{ padding: 16 }}>
              <div 
                style={{ 
                  fontWeight: 700, 
                  marginBottom: 8, 
                  color: '#2C2C2C', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              >
                <span>版本列表</span>
                <span style={{ fontSize: 12, color: '#666666' }}>{sidebarCollapsed ? '▼' : '▲'}</span>
              </div>
              
              {!sidebarCollapsed && (
                <>
                {loading ? (
                  <div style={{ fontSize: 12, color: '#666666' }}>加载中...</div>
                ) : outlines.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#666666' }}>暂无大纲。</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {outlines.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => {
                          setSelected(o)
                          setSelectedSection(null)
                        }}
                        className="w-full text-left transition-colors"
                        style={{
                          padding: '10px 12px',
                          background: selected?.id === o.id ? '#F5F5F0' : 'white',
                          border: selected?.id === o.id ? '1px solid #2C2C2C' : '1px solid #E5E5E0',
                          borderRadius: 8,
                          fontSize: 12,
                          color: '#2C2C2C'
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>版本 {o.version}</div>
                        <div style={{ fontSize: 11, color: '#666666' }}>{new Date(o.created_at).toLocaleString()}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: o.status === 'done' ? '#16a34a' : o.status === 'failed' ? '#dc2626' : '#2563eb' }}>
                          {o.status.toUpperCase()}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </>
              )}
            </aside>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200" style={{ padding: 16, maxHeight: '80vh', overflowY: 'auto' }}>
              {!selected ? (
                <div style={{ fontSize: 12, color: '#666666' }}>选择一个版本查看。</div>
              ) : selected.status !== 'done' || !selected.outline_json ? (
                <div style={{ fontSize: 12, color: '#666666' }}>大纲未就绪。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#2C2C2C' }}>{selected.outline_json.title}</h2>
                    {hasChanges && (
                      <button 
                        onClick={saveOutlineChanges}
                        className="bg-[#2C2C2C] text-white px-4 py-1.5 rounded-lg text-xs hover:bg-[#404040] transition-colors shadow-sm"
                      >
                        保存修改
                      </button>
                    )}
                  </div>
                  
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={localSections.map((_, idx) => `section-${idx}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localSections.map((section, idx) => {
                        const attached = attachments.filter(
                          (a) => a.outlineVersion === selected.version && a.sectionIndex === idx
                        )
                        return (
                          <SortableChapterItem
                            key={`section-${idx}`} // Note: using index as key is risky if items change a lot, but okay for reordering if stable
                            idx={idx}
                            section={section}
                            selectedSection={selectedSection}
                            attachedCount={attached.length}
                            onClick={() => setSelectedSection(idx)}
                            onDelete={(e) => {
                              e.stopPropagation();
                              handleDeleteChapter(idx);
                            }}
                          />
                        )
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>

            <aside className="annotate-sidebar-right" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '80vh', overflowY: 'auto' }}>
              <div className="bg-white rounded-xl shadow-lg border border-gray-200" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#2C2C2C' }}>附件管理</div>
                {selectedSection === null ? (
                  <div style={{ fontSize: 12, color: '#666666' }}>点击左侧节点选择要标注的章节。</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: '#666666', marginBottom: 10 }}>
                      节点：{selected?.outline_json?.sections[selectedSection]?.title}
                    </div>
                    {sectionAttachments.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#666666', marginBottom: 6 }}>已附加</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {sectionAttachments.map((att: AttachmentNote, i: number) => {
                            const photo = photos.find((p) => p.id === att.photoId)
                            const src = photo?.previewUrl || photo?.remoteUrl
                            return (
                              <div key={i} style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 8, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', border: '1px solid #E5E7EB', flexShrink: 0 }}>
                                  {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#F3F4F6' }} />}
                                </div>
                                <div style={{ flex: 1, fontSize: 12 }}>
                                  <div style={{ fontWeight: 600, color: '#374151' }}>{photo?.fileName || '未知'}</div>
                                  {att.note && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{att.note}</div>}
                                </div>
                                <button className="text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50" style={{ padding: '4px 8px', fontSize: 10, borderRadius: 6 }} onClick={() => removeAttachment(attachments.indexOf(att))}>
                                  移除
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#666666', marginBottom: 6 }}>添加照片</div>
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
                              border: selectedPhotoId === photo.id ? '2px solid #2C2C2C' : '1px solid #E5E5E0',
                              background: '#F9FAFB',
                              cursor: 'pointer',
                              padding: 0,
                              boxShadow: selectedPhotoId === photo.id ? '0 0 0 2px rgba(44, 44, 44, 0.2)' : 'none',
                            }}
                          >
                            {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#F3F4F6' }} />}
                          </button>
                        )
                      })}
                    </div>
                    {photos.length > 12 && <div style={{ fontSize: 11, color: '#666666', marginBottom: 10 }}>显示前 12 张，去照片页查看全部。</div>}
                    <label style={{ display: 'block', marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#666666', marginBottom: 6 }}>备注（可选）</div>
                      <textarea className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C2C2C] text-sm" rows={3} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="这张照片的故事、细节..." />
                    </label>
                    <button className="w-full bg-[#2C2C2C] text-white hover:bg-[#404040] disabled:opacity-50 disabled:cursor-not-allowed transition-colors" disabled={!selectedPhotoId} style={{ borderRadius: 6, padding: '10px', fontSize: 12 }} onClick={attachPhoto}>
                      附加到此节点
                    </button>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-200" style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#2C2C2C' }}>统计</div>
                <div style={{ fontSize: 12, color: '#666666', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>照片库：{photos.length} 张</div>
                  <div>附件总数：{attachments.length}</div>
                </div>
              </div>
            </aside>
          </div>
          </>
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
    </div>
  )
}
