'use client'

import { useState } from 'react'

type SlotFilledDisplayProps = {
  text: string
  source: 'user' | 'ai'
  questionId?: string
  onEdit: () => void
  onDelete: () => void
  onClick?: (questionId: string) => void
  onRetry?: () => void  // 保存失败时重试
}

export function SlotFilledDisplay({
  text,
  source,
  questionId,
  onEdit,
  onDelete,
  onClick,
  onRetry
}: SlotFilledDisplayProps) {
  const [showActions, setShowActions] = useState(false)

  const canClick = !!questionId && !!onClick
  const needsRetry = !questionId  // 没有 questionId 说明保存失败了

  const handleClick = () => {
    if (canClick) {
      onClick(questionId)
    }
  }

  return (
    <div
      className={`group flex items-start gap-2 py-3 px-3 rounded mb-2
                 border border-[var(--border)]
                 bg-white hover:bg-[rgba(184,155,114,0.05)]
                 transition-colors
                 ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        borderColor: 'rgba(184,155,114,0.2)'
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={handleClick}
    >
      {/* 问题图标 */}
      <div 
        className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded mt-0.5"
        style={{
          background: 'rgba(184,155,114,0.1)',
          border: '1px solid rgba(184,155,114,0.3)',
          color: '#8B7355',
          fontSize: '10px'
        }}
      >
        ◇
      </div>

      {/* 问题文本 */}
      <span className={`flex-1 text-sm leading-relaxed ${canClick ? 'text-[#5A4F43] group-hover:text-[#8B7355]' : 'text-slate-600'}`}>
        {text}
      </span>

      {/* 来源标识 */}
      <span
        className="text-xs text-[#8C8377] flex-shrink-0 opacity-50"
        title={source === 'ai' ? 'AI 生成' : '自己写的'}
      >
        {source === 'ai' ? '✨' : ''}
      </span>

      {/* 保存失败提示 */}
      {needsRetry && (
        <span className="text-xs text-yellow-500 flex-shrink-0">
          未保存
        </span>
      )}

      {/* 操作按钮 - hover 时显示，但始终保留占位 */}
      <div
        className={`flex items-center gap-1 flex-shrink-0 transition-opacity duration-150
                    ${showActions ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {needsRetry && onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            className="px-2 py-0.5 text-xs text-yellow-400 hover:text-yellow-300
                       hover:bg-yellow-500/10 rounded transition-colors"
          >
            重试
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="px-2 py-0.5 text-xs text-slate-400 hover:text-amber-600
                     hover:bg-amber-100 rounded transition-colors"
        >
          编辑
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="px-2 py-0.5 text-xs text-slate-400 hover:text-red-600
                     hover:bg-red-50 rounded transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  )
}
