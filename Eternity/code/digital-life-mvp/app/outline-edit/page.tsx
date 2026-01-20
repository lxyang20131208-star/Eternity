'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { supabase } from '@/lib/supabaseClient'
import {
  listProjectOutlines,
  getOutlineById,
  updateOutlineContent,
  saveAsNewVersion,
  migrateToRichText,
  BiographyOutline,
} from '@/lib/biographyOutlineApi'
import type { OutlineJSONV2, OutlineSectionV2 } from '@/lib/types/outline'
import { textToRichContent, createEmptySection } from '@/lib/types/outline'
import { RichTextEditor, SectionCard, SaveControls } from '@/app/components/outline-editor'

export default function OutlineEditPage() {
  // Auth & Project
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Outlines
  const [outlines, setOutlines] = useState<BiographyOutline[]>([])
  const [selectedOutlineId, setSelectedOutlineId] = useState<string | null>(null)
  const [selectedOutline, setSelectedOutline] = useState<BiographyOutline | null>(null)

  // Editing state
  const [editedContent, setEditedContent] = useState<OutlineJSONV2 | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Initialize auth and project
  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: list } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)

        const pid = list?.[0]?.id
        if (pid) {
          setProjectId(pid)
        }
      } catch (err) {
        console.error('Auth init failed:', err)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Load outlines
  useEffect(() => {
    if (!projectId) return

    listProjectOutlines(projectId).then((data) => {
      setOutlines(data)
      if (data.length > 0 && !selectedOutlineId) {
        setSelectedOutlineId(data[0].id)
      }
    })
  }, [projectId, selectedOutlineId])

  // Load selected outline
  useEffect(() => {
    if (!selectedOutlineId) return

    getOutlineById(selectedOutlineId).then((outline) => {
      if (outline) {
        setSelectedOutline(outline)
        // Migrate to V2 format if needed
        if (outline.outline_json) {
          const v2Content = migrateToRichText(outline.outline_json)
          setEditedContent(v2Content)
        }
        setIsDirty(false)
      }
    })
  }, [selectedOutlineId])

  // Handle version change
  const handleVersionChange = (outlineId: string) => {
    if (isDirty) {
      if (!confirm('有未保存的更改，确定要切换版本吗？')) {
        return
      }
    }
    setSelectedOutlineId(outlineId)
  }

  // Handle content changes
  const handleTitleChange = (content: any) => {
    if (!editedContent) return
    setEditedContent({
      ...editedContent,
      title_rich: content,
      title: extractPlainText(content)
    })
    setIsDirty(true)
  }

  const handleSectionUpdate = (index: number, section: OutlineSectionV2) => {
    if (!editedContent) return
    const newSections = [...editedContent.sections]
    newSections[index] = section
    setEditedContent({ ...editedContent, sections: newSections })
    setIsDirty(true)
  }

  const handleSectionDelete = (index: number) => {
    if (!editedContent) return
    if (!confirm('确定要删除这个章节吗？')) return

    const newSections = editedContent.sections.filter((_, i) => i !== index)
    setEditedContent({ ...editedContent, sections: newSections })
    setIsDirty(true)
  }

  const handleAddSection = () => {
    if (!editedContent) return
    const newSection = createEmptySection(editedContent.sections.length)
    setEditedContent({
      ...editedContent,
      sections: [...editedContent.sections, newSection]
    })
    setIsDirty(true)
  }

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || !editedContent) return

    if (active.id !== over.id) {
      const oldIndex = editedContent.sections.findIndex(
        (_, i) => `section-${i}` === active.id
      )
      const newIndex = editedContent.sections.findIndex(
        (_, i) => `section-${i}` === over.id
      )

      const newSections = arrayMove(editedContent.sections, oldIndex, newIndex)
      setEditedContent({ ...editedContent, sections: newSections })
      setIsDirty(true)
    }
  }

  // Save (overwrite)
  const handleSave = async () => {
    if (!selectedOutlineId || !editedContent) return

    setSaving(true)
    const result = await updateOutlineContent(selectedOutlineId, editedContent)
    setSaving(false)

    if (result.success) {
      setIsDirty(false)
      showToast('保存成功', 'success')
    } else {
      showToast(result.error || '保存失败', 'error')
    }
  }

  // Save as new version
  const handleSaveAsNew = async () => {
    if (!projectId || !editedContent) return

    setSaving(true)
    const result = await saveAsNewVersion(projectId, editedContent)
    setSaving(false)

    if (result.success) {
      setIsDirty(false)
      showToast(`已保存为新版本 v${result.version}`, 'success')
      // Refresh outlines and select new version
      const updatedOutlines = await listProjectOutlines(projectId)
      setOutlines(updatedOutlines)
      if (result.outlineId) {
        setSelectedOutlineId(result.outlineId)
      }
    } else {
      showToast(result.error || '保存失败', 'error')
    }
  }

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  if (loading) {
    return (
      <div className="detroit-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--accent-cyan)' }}>加载中...</div>
      </div>
    )
  }

  if (!projectId) {
    return (
      <div className="detroit-bg" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>请先登录</p>
          <Link href="/main" className="cyber-btn">返回首页</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="detroit-bg" style={{ minHeight: '100vh', padding: 20 }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 4 }}>
            大纲编辑器
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            编辑、调整和润色你的传记大纲
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/outline" className="cyber-btn" style={{ padding: '10px 16px', fontSize: 13 }}>
            返回浏览
          </Link>
          <Link href="/export" className="cyber-btn cyber-btn-primary" style={{ padding: '10px 16px', fontSize: 13 }}>
            导出PDF
          </Link>
        </div>
      </header>

      {/* Main Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>
        {/* Left: Version Selector */}
        <div className="glass-card" style={{ padding: 16, height: 'fit-content', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--accent-cyan)' }}>
            选择版本
          </h3>
          {outlines.map((o) => (
            <button
              key={o.id}
              onClick={() => handleVersionChange(o.id)}
              style={{
                width: '100%',
                padding: '12px 14px',
                marginBottom: 8,
                background: selectedOutlineId === o.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: selectedOutlineId === o.id ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 6,
                color: selectedOutlineId === o.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600 }}>版本 {o.version}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                {o.outline_json?.sections?.length || 0} 章节
              </div>
              <div style={{ fontSize: 10, opacity: 0.5, marginTop: 2 }}>
                {new Date(o.updated_at).toLocaleDateString('zh-CN')}
              </div>
            </button>
          ))}
          {outlines.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              暂无大纲数据
            </p>
          )}
        </div>

        {/* Right: Editor */}
        <div>
          {editedContent ? (
            <>
              {/* Save Controls */}
              <SaveControls
                isDirty={isDirty}
                saving={saving}
                onSave={handleSave}
                onSaveAsNew={handleSaveAsNew}
                currentVersion={selectedOutline?.version || 1}
              />

              {/* Title Editor */}
              <div className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  大纲标题
                </label>
                <RichTextEditor
                  content={editedContent.title_rich || textToRichContent(editedContent.title)}
                  onChange={handleTitleChange}
                  placeholder="输入大纲标题..."
                  singleLine
                  showToolbar={false}
                />
              </div>

              {/* Sections */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={editedContent.sections.map((_, i) => `section-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {editedContent.sections.map((section, index) => (
                    <SectionCard
                      key={`section-${index}`}
                      section={section}
                      index={index}
                      onUpdate={(s) => handleSectionUpdate(index, s)}
                      onDelete={() => handleSectionDelete(index)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add Section Button */}
              <button
                type="button"
                onClick={handleAddSection}
                className="cyber-btn"
                style={{
                  width: '100%',
                  padding: 16,
                  marginTop: 8,
                  borderStyle: 'dashed',
                }}
              >
                + 添加新章节
              </button>
            </>
          ) : (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>
                {outlines.length > 0 ? '选择一个版本开始编辑' : '暂无大纲数据'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '14px 24px',
            background: toast.type === 'success' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 68, 102, 0.15)',
            border: `1px solid ${toast.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
            borderRadius: 8,
            color: toast.type === 'success' ? 'var(--accent-success)' : 'var(--accent-danger)',
            fontSize: 14,
            zIndex: 1000,
            animation: 'slideIn 0.3s ease',
          }}
        >
          {toast.message}
        </div>
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

// Helper
function extractPlainText(content: any): string {
  if (!content?.content) return ''
  return content.content
    .map((node: any) => {
      if (node.type === 'text') return node.text || ''
      if (node.content) return node.content.map((n: any) => n.text || '').join('')
      return ''
    })
    .join('\n')
}
