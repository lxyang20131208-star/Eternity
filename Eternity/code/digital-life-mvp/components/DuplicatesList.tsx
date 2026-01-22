'use client'

import { useState } from 'react'
import { Person, DuplicateGroup } from '@/lib/types/knowledge-graph'

interface DuplicatesListProps {
  isOpen: boolean
  onClose: () => void
  duplicateGroups: DuplicateGroup[]
  allPeople: Person[]
  projectId: string
  onMerge: (primaryPerson: Person, secondaryPerson: Person) => void
  onIgnore?: (groupId: string) => void
}

export default function DuplicatesList({
  isOpen,
  onClose,
  duplicateGroups,
  allPeople,
  projectId,
  onMerge,
  onIgnore
}: DuplicatesListProps) {
  const [ignoredGroups, setIgnoredGroups] = useState<Set<string>>(new Set())

  const handleIgnore = (groupId: string) => {
    setIgnoredGroups(new Set([...ignoredGroups, groupId]))
    if (onIgnore) {
      onIgnore(groupId)
    }
  }

  // 过滤已忽略的组
  const visibleGroups = duplicateGroups.filter(g => !ignoredGroups.has(g.groupId))

  // 获取人物详情
  const getPersonById = (id: string): Person | undefined => {
    return allPeople.find(p => p.id === id)
  }

  // 获取相似度原因的中文描述
  const getReasonText = (reason: string): string => {
    switch (reason) {
      case 'exact_alias': return '别名完全匹配'
      case 'alias_match': return '别名包含关系'
      case 'name_similar': return '姓名拼写相似'
      case 'alias_intersection': return '别名接近'
      default: return '相似'
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">发现的重复人物</h2>
              <p className="text-white/80 text-sm mt-1">
                {visibleGroups.length > 0
                  ? `发现 ${visibleGroups.length} 组可能重复的人物`
                  : '没有发现重复的人物'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {visibleGroups.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 mx-auto text-green-500 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-4">
                没有发现重复
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                所有人物记录都是独立的，没有需要合并的项目
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleGroups.map((group) => {
                // 对于每组，展示第一个pair
                const firstPair = group.pairs[0]
                if (!firstPair) return null

                const personA = getPersonById(firstPair.personAId)
                const personB = getPersonById(firstPair.personBId)

                if (!personA || !personB) return null

                return (
                  <div
                    key={group.groupId}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                  >
                    {/* 相似度指示器 */}
                    <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-800/30 dark:text-orange-200">
                          相似度 {Math.round(firstPair.similarity * 100)}%
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {getReasonText(firstPair.reason)}
                        </span>
                      </div>
                      {group.pairs.length > 1 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          此组包含 {group.personIds.length} 个相关人物
                        </span>
                      )}
                    </div>

                    {/* 人物对比 */}
                    <div className="p-4">
                      <div className="grid grid-cols-5 gap-4 items-center">
                        {/* Person A */}
                        <div className="col-span-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {personA.name}
                          </h4>
                          {personA.aliases && personA.aliases.length > 0 && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              别名: {personA.aliases.join(', ')}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2 text-xs">
                            {personA.importance_score && personA.importance_score > 0 && (
                              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                提到 {personA.importance_score} 次
                              </span>
                            )}
                            {personA.relationship_to_user && (
                              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                {personA.relationship_to_user}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* VS */}
                        <div className="col-span-1 text-center">
                          <span className="text-2xl font-bold text-gray-300 dark:text-gray-600">
                            VS
                          </span>
                        </div>

                        {/* Person B */}
                        <div className="col-span-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {personB.name}
                          </h4>
                          {personB.aliases && personB.aliases.length > 0 && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              别名: {personB.aliases.join(', ')}
                            </p>
                          )}
                          <div className="flex gap-2 mt-2 text-xs">
                            {personB.importance_score && personB.importance_score > 0 && (
                              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                提到 {personB.importance_score} 次
                              </span>
                            )}
                            {personB.relationship_to_user && (
                              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                {personB.relationship_to_user}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex justify-end gap-2 mt-4">
                        <button
                          onClick={() => handleIgnore(group.groupId)}
                          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        >
                          忽略
                        </button>
                        <button
                          onClick={() => onMerge(personA, personB)}
                          className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                        >
                          合并重复
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* 提示 */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p>忽略的条目不会再次出现在检测结果中。</p>
                    <p className="mt-1">合并后的数据会保留备份，随时可以撤销。</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 底部按钮 */}
          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
