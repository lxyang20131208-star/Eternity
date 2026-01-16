'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useEffect, useCallback } from 'react'
import type { RichTextContent } from '@/lib/types/outline'

interface RichTextEditorProps {
  content: RichTextContent | undefined
  onChange: (content: RichTextContent) => void
  placeholder?: string
  singleLine?: boolean
  showToolbar?: boolean
  className?: string
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Enter content...',
  singleLine = false,
  showToolbar = true,
  className = ''
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: singleLine ? false : undefined,
        bulletList: singleLine ? false : undefined,
        orderedList: singleLine ? false : undefined,
        blockquote: singleLine ? false : undefined,
        codeBlock: singleLine ? false : undefined,
        horizontalRule: singleLine ? false : undefined,
        hardBreak: singleLine ? false : undefined,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: content || { type: 'doc', content: [] },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON() as RichTextContent
      onChange(json)
    },
    editorProps: {
      attributes: {
        class: `cyber-editor-content ${singleLine ? 'single-line' : ''}`,
      },
      handleKeyDown: singleLine
        ? (view, event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              return true
            }
            return false
          }
        : undefined,
    },
  })

  // Sync content from props
  useEffect(() => {
    if (editor && content) {
      const currentContent = JSON.stringify(editor.getJSON())
      const newContent = JSON.stringify(content)
      if (currentContent !== newContent) {
        editor.commands.setContent(content)
      }
    }
  }, [editor, content])

  if (!editor) return null

  return (
    <div className={`cyber-editor ${className}`}>
      {showToolbar && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
      <style jsx global>{`
        .cyber-editor {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }
        .cyber-editor:focus-within {
          border-color: var(--accent-cyan);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
        }
        .cyber-editor-content {
          padding: 12px 16px;
          color: var(--text-primary);
          min-height: 60px;
          outline: none;
        }
        .cyber-editor-content.single-line {
          min-height: auto;
        }
        .cyber-editor-content p {
          margin: 0;
        }
        .cyber-editor-content p + p {
          margin-top: 8px;
        }
        .cyber-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--text-muted);
          pointer-events: none;
          float: left;
          height: 0;
        }
        .cyber-editor-content strong {
          color: var(--accent-cyan);
        }
        .cyber-editor-content em {
          color: var(--text-secondary);
        }
        .cyber-editor-content u {
          text-decoration-color: var(--accent-cyan);
        }
      `}</style>
    </div>
  )
}

// AI Polish actions
const aiActions = [
  { id: 'fix_grammar', label: 'Fix Grammar', icon: '✓' },
  { id: 'improve_style', label: 'Polish Style', icon: '✨' },
  { id: 'expand', label: 'Expand', icon: '📝' },
  { id: 'shorten', label: 'Shorten', icon: '📋' },
  { id: 'remove_fillers', label: 'Remove Fillers', icon: '🧹' },
  { id: 'translate_en', label: 'Translate to English', icon: '🇬🇧' },
  { id: 'translate_zh', label: 'Translate to Chinese', icon: '🇨🇳' },
]

// Toolbar Component
function Toolbar({ editor }: { editor: Editor }) {
  const [showAiMenu, setShowAiMenu] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const toggleBold = useCallback(() => {
    editor.chain().focus().toggleBold().run()
  }, [editor])

  const toggleItalic = useCallback(() => {
    editor.chain().focus().toggleItalic().run()
  }, [editor])

  const toggleUnderline = useCallback(() => {
    editor.chain().focus().toggleUnderline().run()
  }, [editor])

  const setAlignLeft = useCallback(() => {
    editor.chain().focus().setTextAlign('left').run()
  }, [editor])

  const setAlignCenter = useCallback(() => {
    editor.chain().focus().setTextAlign('center').run()
  }, [editor])

  const setAlignRight = useCallback(() => {
    editor.chain().focus().setTextAlign('right').run()
  }, [editor])

  const handleAiPolish = useCallback(async (action: string) => {
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, ' ')

    if (!selectedText.trim()) {
      alert('Please select text to process first')
      return
    }

    setAiLoading(true)
    setShowAiMenu(false)

    try {
      const res = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedText, action }),
      })

      const data = await res.json()
      if (data.result) {
        editor.chain().focus().deleteSelection().insertContent(data.result).run()
      } else {
        alert(data.error || 'AI processing failed')
      }
    } catch (err) {
      console.error('AI polish error:', err)
      alert('AI processing failed, please try again')
    } finally {
      setAiLoading(false)
    }
  }, [editor])

  return (
    <div className="cyber-toolbar">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={toggleBold}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={toggleItalic}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={toggleUnderline}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </ToolbarButton>
      <div className="toolbar-divider" />
      <ToolbarButton
        active={editor.isActive({ textAlign: 'left' })}
        onClick={setAlignLeft}
        title="Align Left"
      >
        <AlignLeftIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'center' })}
        onClick={setAlignCenter}
        title="Center"
      >
        <AlignCenterIcon />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive({ textAlign: 'right' })}
        onClick={setAlignRight}
        title="Right align"
      >
        <AlignRightIcon />
      </ToolbarButton>
      <div className="toolbar-divider" />

      {/* AI Polish Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setShowAiMenu(!showAiMenu)}
          disabled={aiLoading}
          title="AI Polish Tool"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            background: aiLoading ? 'rgba(0, 212, 255, 0.2)' : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(0, 212, 255, 0.2))',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: 4,
            color: '#c084fc',
            fontSize: 12,
            fontWeight: 600,
            cursor: aiLoading ? 'wait' : 'pointer',
          }}
        >
          {aiLoading ? 'Processing...' : 'AI Polish'}
        </button>

        {showAiMenu && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'rgba(10, 22, 40, 0.98)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            borderRadius: 8,
            padding: 4,
            zIndex: 100,
            minWidth: 140,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}>
            {aiActions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleAiPolish(action.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: '#c8d4e0',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .cyber-toolbar {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 8px 12px;
          background: rgba(0, 212, 255, 0.05);
          border-bottom: 1px solid var(--border-color);
        }
        .toolbar-divider {
          width: 1px;
          height: 20px;
          background: var(--border-color);
          margin: 0 8px;
        }
      `}</style>
    </div>
  )
}

function ToolbarButton({
  active,
  onClick,
  title,
  children
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`toolbar-btn ${active ? 'active' : ''}`}
      >
        {children}
      </button>
      <style jsx>{`
        .toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
        }
        .toolbar-btn:hover {
          background: rgba(0, 212, 255, 0.1);
          color: var(--accent-cyan);
        }
        .toolbar-btn.active {
          background: rgba(0, 212, 255, 0.15);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
        }
      `}</style>
    </>
  )
}

// Icons
function AlignLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="3" width="14" height="2" rx="0.5" />
      <rect x="1" y="7" width="10" height="2" rx="0.5" />
      <rect x="1" y="11" width="12" height="2" rx="0.5" />
    </svg>
  )
}

function AlignCenterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="3" width="14" height="2" rx="0.5" />
      <rect x="3" y="7" width="10" height="2" rx="0.5" />
      <rect x="2" y="11" width="12" height="2" rx="0.5" />
    </svg>
  )
}

function AlignRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="3" width="14" height="2" rx="0.5" />
      <rect x="5" y="7" width="10" height="2" rx="0.5" />
      <rect x="3" y="11" width="12" height="2" rx="0.5" />
    </svg>
  )
}

export default RichTextEditor



