import React from 'react'

type CompletionMilestonesProps = {
  answeredCount: number
}

const MILESTONES = [
  { count: 10, label: 'Photos', icon: '📸' },
  { count: 20, label: 'Tree', icon: '🌳' },
  { count: 30, label: 'Outline', icon: '📑' },
  { count: 40, label: 'Places', icon: '📍' },
  { count: 50, label: 'Timeline', icon: '⏳' },
  { count: 60, label: 'Export', icon: '📤' },
  { count: 70, label: 'Round 2', icon: '🔄' },
  { count: 80, label: 'Collab', icon: '🤝' },
  { count: 90, label: 'Bio Edit', icon: '✍️' },
  { count: 100, label: 'Delivery', icon: '📦' },
]

export function CompletionMilestones({ answeredCount }: CompletionMilestonesProps) {
  // Calculate progress percentage (max 100 for visual simplicity, though milestones go to 90)
  // We'll use 100 as the full width of the bar.
  const progressPercent = Math.min(100, Math.max(0, answeredCount))

  return (
    <div style={{ 
      marginTop: 24, 
      padding: '16px 0',
      borderTop: '1px solid rgba(184,155,114,0.2)' 
    }}>
      <h3 style={{
        margin: '0 0 24px',
        fontSize: 12,
        fontWeight: 600,
        color: '#5A4F43',
        letterSpacing: '1px',
        textTransform: 'uppercase'
      }}>
        Milestone Progress
      </h3>
      
      <div style={{ position: 'relative', height: 80, margin: '0 20px' }}>
        {/* Background Line */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: -10,
          right: -10,
          height: 4,
          background: 'rgba(184,155,114,0.1)',
          borderRadius: 2,
          zIndex: 0
        }} />

        {/* Progress Line */}
        <div style={{
          position: 'absolute',
          top: 20,
          left: -10,
          width: `calc(${progressPercent}% + 10px)`,
          maxWidth: 'calc(100% + 20px)',
          height: 4,
          background: '#B89B72',
          borderRadius: 2,
          transition: 'width 0.5s ease-out',
          zIndex: 0
        }} />

        {/* Milestones */}
        {MILESTONES.map((m) => {
          const unlocked = answeredCount >= m.count
          // Position calculation: 
          // We want milestones to be slightly shifted left relative to their pure percentage
          // but still distributed along the line.
          // Let's use a scale from 0 to 100, but map 10 to ~5% and 100 to ~95%
          // Formula: (count / 100) * 90 + 5
          // Or just standard percentage if we want them evenly distributed within the container
          // To "shift left" as requested, we can adjust the calculation.
          
          // Original: const position = m.count
          // Shifted left slightly: map 10-100 to range 5-95 to leave room on ends
          const position = ((m.count - 10) / 90) * 90 + 5
          
          return (
            <div
              key={m.count}
              className="milestone-node"
              style={{
                position: 'absolute',
                left: `${position}%`,
                top: 0,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 1,
                opacity: unlocked ? 1 : 0.6,
                transition: 'opacity 0.3s',
                cursor: 'pointer'
              }}
            >
              {/* Tooltip */}
              <div className="milestone-tooltip" style={{
                position: 'absolute',
                bottom: '100%',
                marginBottom: 8,
                background: 'rgba(60, 50, 40, 0.9)',
                color: 'white',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 10,
                whiteSpace: 'nowrap',
                opacity: 0,
                pointerEvents: 'none',
                transition: 'opacity 0.2s',
                zIndex: 10
              }}>
                Unlock {m.label} at {m.count} answers
              </div>

              {/* Node Dot */}
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: unlocked ? '#B89B72' : '#E3D6C6',
                border: '2px solid white',
                boxShadow: '0 0 0 1px rgba(184,155,114,0.3)',
                marginBottom: 6,
                marginTop: 16, // align with line
                transition: 'background 0.3s'
              }} />
              
              {/* Icon */}
              <div style={{
                fontSize: 14,
                marginBottom: 4,
                filter: unlocked ? 'none' : 'grayscale(100%)',
              }}>
                {m.icon}
              </div>
              
              {/* Label */}
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: '#5A4F43',
                marginBottom: 2,
                whiteSpace: 'nowrap',
                transform: 'scale(0.9)',
              }}>
                {m.label}
              </div>

              {/* Count */}
              <div style={{
                fontSize: 8,
                color: '#8C8377',
                transform: 'scale(0.85)',
              }}>
                {m.count}
              </div>
            </div>
          )
        })}
      </div>
      
      <div style={{ 
        textAlign: 'center', 
        fontSize: 11, 
        color: '#8C8377', 
        fontStyle: 'italic',
        marginTop: 12
      }}>
        {answeredCount < 100 
          ? `Answer ${100 - answeredCount} more to unlock all features!` 
          : 'All milestones unlocked! 🎉'}
      </div>

      <style jsx>{`
        .milestone-node:hover .milestone-tooltip {
          opacity: 1 !important;
        }
        .milestone-node:hover {
          opacity: 1 !important;
          transform: translateX(-50%) scale(1.1) !important;
        }
      `}</style>
    </div>
  )
}
