'use client'

import { useState, useEffect } from 'react'

interface NameCorrection {
  id: string
  person_id: string
  old_name: string
  new_name: string
  applied_at: string
}

interface GlobalNameReplacerProps {
  projectId: string
  content: string
  onReplace: (newContent: string) => void
}

export default function GlobalNameReplacer({
  projectId,
  content,
  onReplace,
}: GlobalNameReplacerProps) {
  const [corrections, setCorrections] = useState<NameCorrection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReplacing, setIsReplacing] = useState(false)
  const [selectedCorrections, setSelectedCorrections] = useState<string[]>([])

  useEffect(() => {
    async function loadCorrections() {
      try {
        const res = await fetch(`/api/people/name-corrections?projectId=${projectId}`)
        const data = await res.json()

        if (data.error) throw new Error(data.error)

        setCorrections(data.corrections || [])
      } catch (error: any) {
        console.error('加载人名修正记录失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (projectId) {
      loadCorrections()
    }
  }, [projectId])

  const handleApplyAll = async () => {
    if (corrections.length === 0) return

    setIsReplacing(true)

    try {
      let newContent = content

      // 按时间顺序应用所有修正
      for (const correction of corrections) {
        const regex = new RegExp(escapeRegExp(correction.old_name), 'g')
        newContent = newContent.replace(regex, correction.new_name)
      }

      onReplace(newContent)
      alert(`已应用 ${corrections.length} 个人名修正`)
    } catch (error: any) {
      console.error('应用修正失败:', error)
      alert('应用修正失败: ' + error.message)
    } finally {
      setIsReplacing(false)
    }
  }

  const handleApplySelected = async () => {
    if (selectedCorrections.length === 0) return

    setIsReplacing(true)

    try {
      let newContent = content

      // 只应用选中的修正
      for (const correctionId of selectedCorrections) {
        const correction = corrections.find((c) => c.id === correctionId)
        if (correction) {
          const regex = new RegExp(escapeRegExp(correction.old_name), 'g')
          newContent = newContent.replace(regex, correction.new_name)
        }
      }

      onReplace(newContent)
      alert(`已应用 ${selectedCorrections.length} 个人名修正`)
      setSelectedCorrections([])
    } catch (error: any) {
      console.error('应用修正失败:', error)
      alert('应用修正失败: ' + error.message)
    } finally {
      setIsReplacing(false)
    }
  }

  const previewReplacement = (correction: NameCorrection) => {
    const regex = new RegExp(escapeRegExp(correction.old_name), 'g')
    const matches = content.match(regex)
    return matches ? matches.length : 0
  }

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div className="text-sm text-gray-600 dark:text-gray-400">加载人名修正记录...</div>
      </div>
    )
  }

  if (corrections.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-yellow-200 dark:border-yellow-800">
      <div className="flex items-center gap-3 mb-4">
        <svg
          className="w-6 h-6 text-yellow-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            人名修正提醒
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            您在 Family 页面修改了 {corrections.length} 个人物的姓名，建议应用全局替换
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {corrections.map((correction) => (
          <div
            key={correction.id}
            className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
          >
            <input
              type="checkbox"
              checked={selectedCorrections.includes(correction.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedCorrections([...selectedCorrections, correction.id])
                } else {
                  setSelectedCorrections(selectedCorrections.filter((id) => id !== correction.id))
                }
              }}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                <span className="text-red-600 line-through">{correction.old_name}</span>
                {' → '}
                <span className="text-green-600">{correction.new_name}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                在当前内容中找到 {previewReplacement(correction)} 处 "{correction.old_name}"
              </div>
            </div>
            <div className="text-xs text-gray-400">
              {new Date(correction.applied_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => {
            setSelectedCorrections(corrections.map((c) => c.id))
          }}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          全选
        </button>
        <button
          onClick={() => setSelectedCorrections([])}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          取消全选
        </button>
        <div className="flex-1"></div>
        <button
          onClick={handleApplySelected}
          disabled={isReplacing || selectedCorrections.length === 0}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isReplacing ? '应用中...' : `应用选中 (${selectedCorrections.length})`}
        </button>
        <button
          onClick={handleApplyAll}
          disabled={isReplacing}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isReplacing ? '应用中...' : '应用全部'}
        </button>
      </div>
    </div>
  )
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
