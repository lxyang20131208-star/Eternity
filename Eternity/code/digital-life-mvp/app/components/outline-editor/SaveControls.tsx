'use client'

interface SaveControlsProps {
  isDirty: boolean
  saving: boolean
  onSave: () => void
  onSaveAsNew: () => void
  currentVersion: number
}

export function SaveControls({
  isDirty,
  saving,
  onSave,
  onSaveAsNew,
  currentVersion
}: SaveControlsProps) {
  return (
    <div className="save-controls">
      <div className="save-status">
        {isDirty ? (
          <span className="status-unsaved">
            <span className="status-dot" />
            未保存的更改
          </span>
        ) : (
          <span className="status-saved">
            <CheckIcon />
            已保存
          </span>
        )}
        <span className="version-badge">v{currentVersion}</span>
      </div>

      <div className="save-buttons">
        <button
          type="button"
          className="cyber-btn"
          onClick={onSave}
          disabled={!isDirty || saving}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          type="button"
          className="cyber-btn cyber-btn-primary"
          onClick={onSaveAsNew}
          disabled={saving}
        >
          另存为新版本
        </button>
      </div>

      <style jsx>{`
        .save-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 8px;
          margin-bottom: 20px;
        }
        .save-status {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .status-unsaved {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--accent-warning);
          font-size: 13px;
        }
        .status-unsaved .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--accent-warning);
          animation: pulse 1.5s ease-in-out infinite;
        }
        .status-saved {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--accent-success);
          font-size: 13px;
        }
        .version-badge {
          padding: 4px 10px;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          font-size: 12px;
          color: var(--accent-cyan);
          font-weight: 600;
        }
        .save-buttons {
          display: flex;
          gap: 12px;
        }
        .save-buttons .cyber-btn {
          padding: 10px 20px;
          font-size: 13px;
        }
        .save-buttons .cyber-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
    </svg>
  )
}

export default SaveControls
