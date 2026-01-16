'use client'

import { useState, useEffect, useRef } from 'react'

type SlotEditModeProps = {
  initialText?: string
  onSave: (text: string) => void
  onCancel: () => void
}

export function SlotEditMode({ initialText = '', onSave, onCancel }: SlotEditModeProps) {
  const [text, setText] = useState(initialText)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 自动聚焦输入框
    inputRef.current?.focus()
  }, [])

  const handleSave = () => {
    const trimmed = text.trim()
    if (trimmed) {
      onSave(trimmed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="写下你想回答的问题..."
        className="w-full px-3 py-2.5 bg-white/5 border border-cyan-900/50
                   rounded text-sm text-white placeholder:text-white/30
                   focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/30
                   transition-colors"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-white/50 hover:text-white
                     transition-colors rounded hover:bg-white/5"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!text.trim()}
          className="px-4 py-1.5 text-xs bg-cyan-600 text-white rounded
                     hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors"
        >
          保存
        </button>
      </div>
    </div>
  )
}
