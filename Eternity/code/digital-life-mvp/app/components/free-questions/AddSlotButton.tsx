'use client'

type AddSlotButtonProps = {
  remainingCount: number
  onClick: () => void
}

export function AddSlotButton({ remainingCount, onClick }: AddSlotButtonProps) {
  if (remainingCount <= 0) return null

  return (
    <button
      onClick={onClick}
      className="w-full py-2 text-sm text-white/30
                 hover:text-cyan-400/70 transition-colors text-left
                 flex items-center gap-1"
    >
      <span className="text-base leading-none">+</span>
      <span>再添加一个</span>
      <span className="text-xs ml-1 text-white/20">
        (还可添加 {remainingCount} 个)
      </span>
    </button>
  )
}
