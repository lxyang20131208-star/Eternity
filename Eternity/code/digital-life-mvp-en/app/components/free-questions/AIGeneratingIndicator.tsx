'use client'

export function AIGeneratingIndicator() {
  return (
    <div className="flex items-center gap-2 py-3 px-3 text-sm text-purple-400/70
                    bg-purple-500/5 rounded border border-purple-500/20">
      <span className="relative flex h-4 w-4">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-40"></span>
        <span className="relative inline-flex items-center justify-center h-4 w-4 text-xs">
          ✨
        </span>
      </span>
      <span>Generating a thoughtful question for you...</span>
    </div>
  )
}

