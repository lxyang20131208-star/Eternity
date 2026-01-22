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
        className="flex-1 py-2.5 px-3 text-sm text-slate-500
                   border border-dashed border-slate-300 rounded
                   hover:border-amber-500/50 hover:text-amber-600
                   hover:bg-amber-50 transition-all duration-200
                   flex items-center justify-center gap-2"
      >
        <span className="text-base">✎</span>
        <span>自己写一个</span>
      </button>
      <button
        onClick={onStartAI}
        className="flex-1 py-2.5 px-3 text-sm text-slate-500
                   border border-dashed border-slate-300 rounded
                   hover:border-[#B89B72]/50 hover:text-[#8B7355]
                   hover:bg-[#F8F6F2] transition-all duration-200
                   flex items-center justify-center gap-2"
      >
        <span className="text-base">✨</span>
        <span>让 AI 帮我想</span>
      </button>
    </div>
  )
}
