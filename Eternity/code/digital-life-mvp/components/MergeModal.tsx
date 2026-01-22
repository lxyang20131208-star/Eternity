'use client'

import { useState, useEffect } from 'react'
import { Person, MergeRequest } from '@/lib/types/knowledge-graph'

interface MergeModalProps {
  isOpen: boolean
  onClose: () => void
  sourcePerson: Person // 要合并的源人物（可以是primary或secondary）
  allPeople: Person[] // 所有人物列表（用于选择目标）
  projectId: string
  onMergeSuccess: () => void // 合并成功后的回调
}

type Step = 'select' | 'preview' | 'confirm'
type MergeStrategy = 'keep_primary' | 'keep_secondary' | 'custom'

export default function MergeModal({
  isOpen,
  onClose,
  sourcePerson,
  allPeople,
  projectId,
  onMergeSuccess
}: MergeModalProps) {
  const [step, setStep] = useState<Step>('select')
  const [targetPerson, setTargetPerson] = useState<Person | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('keep_primary')
  const [customName, setCustomName] = useState('')
  const [isMerging, setIsMerging] = useState(false)

  // 过滤可选择的人物（排除自己和已合并的）
  const availablePeople = allPeople.filter(
    p => p.id !== sourcePerson.id &&
    p.metadata?.extraction_status !== 'merged' &&
    (!searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())))
  )

  // 重置状态
  const handleClose = () => {
    setStep('select')
    setTargetPerson(null)
    setSearchQuery('')
    setMergeStrategy('keep_primary')
    setCustomName('')
    setIsMerging(false)
    onClose()
  }

  // 执行合并
  const handleMerge = async () => {
    if (!targetPerson) return

    setIsMerging(true)

    try {
      // 确定primary和secondary
      const primaryPersonId = sourcePerson.id
      const secondaryPersonId = targetPerson.id

      const mergeRequest: MergeRequest = {
        projectId,
        primaryPersonId,
        secondaryPersonId,
        mergeStrategy,
        customData: mergeStrategy === 'custom' ? {
          name: customName || sourcePerson.name
        } : undefined
      }

      const response = await fetch('/api/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mergeRequest)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Merge failed')
      }

      console.log('[MergeModal] Merge successful')

      // 成功后回调
      onMergeSuccess()
      handleClose()

    } catch (error: any) {
      console.error('[MergeModal] Error:', error)
      alert(`合并失败: ${error.message}`)
    } finally {
      setIsMerging(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-500 to-pink-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">
              {step === 'select' && '选择合并目标'}
              {step === 'preview' && '预览合并结果'}
              {step === 'confirm' && '确认合并'}
            </h2>
            <button
              onClick={handleClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Progress Bar */}
          <div className="flex gap-2 mt-4">
            <div className={`h-1 flex-1 rounded-full ${step === 'select' ? 'bg-white' : 'bg-white/30'}`} />
            <div className={`h-1 flex-1 rounded-full ${step === 'preview' ? 'bg-white' : 'bg-white/30'}`} />
            <div className={`h-1 flex-1 rounded-full ${step === 'confirm' ? 'bg-white' : 'bg-white/30'}`} />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {/* Step 1: 选择目标 */}
          {step === 'select' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  将合并 <span className="font-semibold">{sourcePerson.name}</span> 的所有数据到目标人物。
                  被合并的人物将被标记为"已合并"，但数据会保留以便撤销。
                </p>
              </div>

              {/* 搜索框 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  搜索目标人物
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="输入姓名或别称..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-white"
                  autoFocus
                />
              </div>

              {/* 人物列表 */}
              <div className="max-h-96 overflow-y-auto space-y-2">
                {availablePeople.length === 0 ? (
                  <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                    {searchQuery ? '未找到匹配的人物' : '没有可合并的人物'}
                  </p>
                ) : (
                  availablePeople.map(person => (
                    <button
                      key={person.id}
                      onClick={() => {
                        setTargetPerson(person)
                        setStep('preview')
                      }}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                        targetPerson?.id === person.id
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{person.name}</h3>
                          {person.aliases && person.aliases.length > 0 && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              别名: {person.aliases.join(', ')}
                            </p>
                          )}
                          <div className="flex gap-2 mt-1">
                            {person.importance_score && person.importance_score > 0 && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                提到 {person.importance_score} 次
                              </span>
                            )}
                            {person.relationship_to_user && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {person.relationship_to_user}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* 按钮 */}
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 预览合并 */}
          {step === 'preview' && targetPerson && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {/* 主人物 (保留) */}
                <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
                  <h3 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-2">
                    主人物 (保留)
                  </h3>
                  <p className="font-semibold text-gray-900 dark:text-white">{sourcePerson.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    别名: {sourcePerson.aliases?.join(', ') || '无'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    提到: {sourcePerson.importance_score || 0} 次
                  </p>
                </div>

                {/* 次要人物 (移除) */}
                <div className="border-2 border-red-500 rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
                  <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">
                    次要人物 (移除)
                  </h3>
                  <p className="font-semibold text-gray-900 dark:text-white">{targetPerson.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    别名: {targetPerson.aliases?.join(', ') || '无'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    提到: {targetPerson.importance_score || 0} 次
                  </p>
                </div>
              </div>

              {/* 合并策略 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  选择合并策略
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => setMergeStrategy('keep_primary')}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      mergeStrategy === 'keep_primary'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">保留主人物的信息</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      保留 {sourcePerson.name} 的姓名、别名和描述，合并提及次数
                    </p>
                  </button>

                  <button
                    onClick={() => setMergeStrategy('keep_secondary')}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      mergeStrategy === 'keep_secondary'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">保留次要人物的信息</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      保留 {targetPerson.name} 的姓名、别名和描述，合并提及次数
                    </p>
                  </button>

                  <button
                    onClick={() => setMergeStrategy('custom')}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      mergeStrategy === 'custom'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white">自定义合并</div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      自己指定合并后的姓名
                    </p>
                  </button>

                  {mergeStrategy === 'custom' && (
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="输入合并后的姓名"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-white mt-2"
                    />
                  )}
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex justify-between gap-2 mt-6">
                <button
                  onClick={() => setStep('select')}
                  className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
                >
                  上一步
                </button>
                <button
                  onClick={() => setStep('confirm')}
                  className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  下一步
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 确认执行 */}
          {step === 'confirm' && targetPerson && (
            <div className="space-y-6">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                      确认合并操作
                    </h3>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-4">
                      将要合并 <span className="font-semibold">{targetPerson.name}</span> 到 <span className="font-semibold">{sourcePerson.name}</span>
                    </p>
                    <ul className="space-y-2 text-sm text-yellow-800 dark:text-yellow-200">
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400">•</span>
                        <span>描述会合并：两个人物的描述会用 | 连接</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400">•</span>
                        <span>提及次数会增加: +{targetPerson.importance_score || 0}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400">•</span>
                        <span>{targetPerson.name} 将被标记为"已合并"</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-yellow-600 dark:text-yellow-400">•</span>
                        <span className="font-semibold">此操作可以撤销</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex justify-between gap-2 mt-6">
                <button
                  onClick={() => setStep('preview')}
                  disabled={isMerging}
                  className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  上一步
                </button>
                <button
                  onClick={handleMerge}
                  disabled={isMerging}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isMerging ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      合并中...
                    </>
                  ) : (
                    '确认合并'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
