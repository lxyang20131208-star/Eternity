'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RichTextEditor } from './RichTextEditor'
import type { OutlineSectionV2, RichTextContent } from '@/lib/types/outline'
import { textToRichContent, createEmptyBullet } from '@/lib/types/outline'

interface SectionCardProps {
  section: OutlineSectionV2
  index: number
  onUpdate: (section: OutlineSectionV2) => void
  onDelete: () => void
}

export function SectionCard({ section, index, onUpdate, onDelete }: SectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleTitleChange = (content: RichTextContent) => {
    onUpdate({
      ...section,
      title_rich: content,
      title: extractPlainText(content)
    })
  }

  const handleBulletChange = (bulletIndex: number, content: RichTextContent) => {
    const newBulletsRich = [...(section.bullets_rich || [])]
    newBulletsRich[bulletIndex] = content

    const newBullets = newBulletsRich.map(b => extractPlainText(b))

    onUpdate({
      ...section,
      bullets_rich: newBulletsRich,
      bullets: newBullets
    })
  }

  const handleAddBullet = () => {
    onUpdate({
      ...section,
      bullets_rich: [...(section.bullets_rich || []), createEmptyBullet()],
      bullets: [...section.bullets, '']
    })
  }

  const handleDeleteBullet = (bulletIndex: number) => {
    const newBulletsRich = (section.bullets_rich || []).filter((_, i) => i !== bulletIndex)
    const newBullets = section.bullets.filter((_, i) => i !== bulletIndex)

    onUpdate({
      ...section,
      bullets_rich: newBulletsRich,
      bullets: newBullets
    })
  }

  const handleQuoteChange = (quoteIndex: number, content: RichTextContent) => {
    const newQuotesRich = [...(section.quotes_rich || [])]
    if (newQuotesRich[quoteIndex]) {
      newQuotesRich[quoteIndex] = {
        ...newQuotesRich[quoteIndex],
        text_rich: content
      }
    }

    const newQuotes = section.quotes?.map((q, i) => {
      if (i === quoteIndex) {
        return { ...q, text: extractPlainText(content) }
      }
      return q
    })

    onUpdate({
      ...section,
      quotes_rich: newQuotesRich,
      quotes: newQuotes
    })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-card section-card"
    >
      {/* Header with drag handle */}
      <div className="section-header">
        <div className="drag-handle" {...attributes} {...listeners}>
          <DragIcon />
        </div>
        <div className="section-number">
          第 {index + 1} 章
        </div>
        <button
          type="button"
          className="expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '收起' : '展开'}
        </button>
        <button
          type="button"
          className="delete-btn"
          onClick={onDelete}
          title="删除章节"
        >
          <DeleteIcon />
        </button>
      </div>

      {isExpanded && (
        <div className="section-content">
          {/* Title */}
          <div className="field-group">
            <label className="field-label">章节标题</label>
            <RichTextEditor
              content={section.title_rich || textToRichContent(section.title)}
              onChange={handleTitleChange}
              placeholder="输入章节标题..."
              singleLine
              showToolbar={false}
            />
          </div>

          {/* Bullets */}
          <div className="field-group">
            <label className="field-label">
              要点内容
              <span className="bullet-count">({section.bullets_rich?.length || section.bullets.length} 条)</span>
            </label>
            <div className="bullets-list">
              {(section.bullets_rich || section.bullets.map(b => textToRichContent(b))).map((bullet, bulletIndex) => (
                <div key={bulletIndex} className="bullet-item">
                  <span className="bullet-marker">•</span>
                  <div className="bullet-editor">
                    <RichTextEditor
                      content={bullet}
                      onChange={(c) => handleBulletChange(bulletIndex, c)}
                      placeholder="输入要点..."
                      showToolbar
                    />
                  </div>
                  <button
                    type="button"
                    className="bullet-delete-btn"
                    onClick={() => handleDeleteBullet(bulletIndex)}
                    title="删除要点"
                  >
                    <DeleteIcon />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="add-bullet-btn"
                onClick={handleAddBullet}
              >
                + 添加要点
              </button>
            </div>
          </div>

          {/* Quotes (if any) */}
          {section.quotes && section.quotes.length > 0 && (
            <div className="field-group">
              <label className="field-label">引用原话</label>
              <div className="quotes-list">
                {(section.quotes_rich || section.quotes.map(q => ({
                  text_rich: textToRichContent(q.text),
                  source_id: q.source_id
                }))).map((quote, quoteIndex) => (
                  <div key={quoteIndex} className="quote-item">
                    <div className="quote-mark">"</div>
                    <div className="quote-editor">
                      <RichTextEditor
                        content={quote.text_rich}
                        onChange={(c) => handleQuoteChange(quoteIndex, c)}
                        placeholder="引用内容..."
                        showToolbar={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .section-card {
          margin-bottom: 16px;
          overflow: hidden;
        }
        .section-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(0, 212, 255, 0.05);
          border-bottom: 1px solid var(--border-color);
        }
        .drag-handle {
          cursor: grab;
          padding: 4px;
          color: var(--text-muted);
          transition: color 0.2s;
        }
        .drag-handle:hover {
          color: var(--accent-cyan);
        }
        .drag-handle:active {
          cursor: grabbing;
        }
        .section-number {
          font-size: 14px;
          font-weight: 600;
          color: var(--accent-cyan);
          flex: 1;
        }
        .expand-btn {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .expand-btn:hover {
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
        }
        .delete-btn {
          padding: 6px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s;
        }
        .delete-btn:hover {
          border-color: var(--accent-danger);
          color: var(--accent-danger);
          background: rgba(255, 68, 102, 0.1);
        }
        .section-content {
          padding: 20px;
        }
        .field-group {
          margin-bottom: 20px;
        }
        .field-group:last-child {
          margin-bottom: 0;
        }
        .field-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bullet-count {
          font-weight: 400;
          color: var(--text-muted);
          margin-left: 8px;
        }
        .bullets-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .bullet-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .bullet-marker {
          color: var(--accent-cyan);
          font-size: 18px;
          line-height: 40px;
          flex-shrink: 0;
        }
        .bullet-editor {
          flex: 1;
        }
        .bullet-delete-btn {
          padding: 8px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s;
          margin-top: 4px;
        }
        .bullet-delete-btn:hover {
          color: var(--accent-danger);
        }
        .add-bullet-btn {
          padding: 12px 16px;
          background: transparent;
          border: 1px dashed var(--border-color);
          border-radius: 6px;
          color: var(--text-muted);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .add-bullet-btn:hover {
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
          background: rgba(0, 212, 255, 0.05);
        }
        .quotes-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .quote-item {
          display: flex;
          gap: 8px;
          padding: 16px;
          background: rgba(0, 212, 255, 0.05);
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }
        .quote-mark {
          font-size: 32px;
          color: var(--accent-cyan);
          opacity: 0.5;
          line-height: 1;
        }
        .quote-editor {
          flex: 1;
        }
      `}</style>
    </div>
  )
}

// Helper function
function extractPlainText(content: RichTextContent): string {
  if (!content?.content) return ''
  return content.content
    .map(node => extractNodeText(node))
    .join('\n')
}

function extractNodeText(node: any): string {
  if (node.type === 'text') return node.text || ''
  if (node.content) return node.content.map(extractNodeText).join('')
  return ''
}

// Icons
function DragIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
      <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
    </svg>
  )
}

export default SectionCard
