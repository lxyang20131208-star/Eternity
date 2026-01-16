'use client'

type SlotEmptyStateProps = {
  onStartEdit: () => void
  onStartAI: () => void
}

export function SlotEmptyState({ onStartEdit, onStartAI }: SlotEmptyStateProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onStartEdit}
        className="flex-1 py-2.5 px-3 text-sm text-white/50
                   border border-dashed border-white/20 rounded
                   hover:border-cyan-500/50 hover:text-cyan-400
                   hover:bg-cyan-500/5 transition-all duration-200
                   flex items-center justify-center gap-2"
      >
        <span className="text-base">✎</span>
        <span>Write my own</span>
      </button>
      <button
        onClick={onStartAI}
        className="flex-1 py-2.5 px-3 text-sm text-white/50
                   border border-dashed border-white/20 rounded
                   hover:border-purple-500/50 hover:text-purple-400
                   hover:bg-purple-500/5 transition-all duration-200
                   flex items-center justify-center gap-2"
      >
        <span className="text-base">✨</span>
        <span>Let AI suggest</span>
      </button>
    </div>
  )
}

