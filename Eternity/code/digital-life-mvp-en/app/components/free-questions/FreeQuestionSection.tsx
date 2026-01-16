'use client'

import { useState, useEffect, useRef } from 'react'
import { FreeQuestionSlot, Slot } from './FreeQuestionSlot'
import { AddSlotButton } from './AddSlotButton'
import { SlotEmptyState } from './SlotEmptyState'

// Constants
const MAX_SLOTS = 5
const STORAGE_KEY_PREFIX = 'freeQuestions'

type FreeQuestionSectionProps = {
  chapterId: string
  chapterName: string
  existingQuestions: Array<{ id: string; text: string }>  // Existing official questions for this chapter
  onGenerateAI?: (chapterId: string, chapterName: string, existingTexts: string[]) => Promise<string>
  onSaveQuestion?: (text: string, chapter: string) => Promise<string>  // Save question to Supabase, returns questionId
  onQuestionClick?: (questionId: string) => void  // Click question to jump to recording
  onDeleteQuestion?: (questionId: string) => Promise<void> // Delete question from Supabase
}

export function FreeQuestionSection({
  chapterId,
  chapterName,
  existingQuestions,
  onGenerateAI,
  onSaveQuestion,
  onQuestionClick,
  onDeleteQuestion
}: FreeQuestionSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [slots, setSlots] = useState<Slot[]>([])
  const hasHydrated = useRef(false)

  // 从 localStorage 恢复数据
  useEffect(() => {
    if (hasHydrated.current) return
    if (typeof window === 'undefined') return
    hasHydrated.current = true

    const storageKey = `${STORAGE_KEY_PREFIX}.${chapterId}`
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setSlots(parsed)
      } catch (e) {
        console.error('Failed to parse stored free questions:', e)
      }
    }
  }, [chapterId])

  // 持久化到 localStorage
  useEffect(() => {
    if (!hasHydrated.current) return
    if (typeof window === 'undefined') return

    const storageKey = `${STORAGE_KEY_PREFIX}.${chapterId}`
    localStorage.setItem(storageKey, JSON.stringify(slots))
  }, [slots, chapterId])

  // 将本地存储的Free Questions补全 questionId，便于点击跳转
  useEffect(() => {
    if (!hasHydrated.current) return

    const textToId = new Map(existingQuestions.map(q => [q.text.trim(), q.id]))
    let changed = false

    const reconciled = slots.map(slot => {
      if (slot.state === 'filled' && slot.question?.text && !slot.questionId) {
        const matchId = textToId.get(slot.question.text.trim())
        if (matchId) {
          changed = true
          return { ...slot, questionId: matchId }
        }
      }
      return slot
    })

    if (changed) {
      setSlots(reconciled)
    }
  }, [existingQuestions, slots])

  // 计算已填充槽位数量
  const filledSlots = slots.filter(s => s.state === 'filled')
  const remainingCount = MAX_SLOTS - filledSlots.length
  const canAddMore = remainingCount > 0

  // 添加新槽位
  const handleAddSlot = () => {
    if (!canAddMore) return
    const newSlot: Slot = {
      id: crypto.randomUUID(),
      chapterId,
      state: 'empty'
    }
    setSlots(prev => [...prev, newSlot])
  }

  // 更新槽位（含自动保存到 Supabase）
  const handleUpdateSlot = async (updatedSlot: Slot) => {
    // 如果状态变成 filled 且有问题文本，但还没有 questionId，则保存到 Supabase
    if (
      updatedSlot.state === 'filled' &&
      updatedSlot.question?.text &&
      !updatedSlot.questionId &&
      onSaveQuestion
    ) {
      try {
        const questionId = await onSaveQuestion(updatedSlot.question.text, chapterName)
        updatedSlot = { ...updatedSlot, questionId }
      } catch (error) {
        console.error('保存问题到 Supabase 失败:', error)
      }
    }
    setSlots(prev => prev.map(s => s.id === updatedSlot.id ? updatedSlot : s))
  }

  // Delete槽位
  const handleRemoveSlot = (slotId: string) => {
    setSlots(prev => prev.filter(s => s.id !== slotId))
  }

  // 生成 AI 问题
  const handleGenerateAI = async (): Promise<string> => {
    // 收集所有已有问题文本
    const allQuestionTexts = [
      ...existingQuestions.map(q => q.text),
      ...filledSlots.map(s => s.question?.text).filter(Boolean) as string[]
    ]

    // 如果提供了外部生成函数，使用它
    if (onGenerateAI) {
      return onGenerateAI(chapterId, chapterName, allQuestionTexts)
    }

    // 否则使用内置的模拟生成（实际项目中应替换为真实 API 调用）
    return mockGenerateQuestion(chapterName, allQuestionTexts)
  }

  return (
    <div className="free-question-section mt-4">
      {/* 收起/展开入口 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2
                   text-sm text-cyan-400/60 hover:text-cyan-400
                   hover:bg-white/5 rounded transition-colors group"
      >
        <span className="flex items-center gap-2">
          <span className="text-base leading-none opacity-70 group-hover:opacity-100">+</span>
          <span>Free Questions</span>
          <span className="text-xs text-white/40">
            ({filledSlots.length}/{MAX_SLOTS})
          </span>
        </span>
        <span className="text-xs text-white/30 group-hover:text-white/50">
          {isExpanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="mt-2 ml-2 pl-3 border-l border-cyan-900/30 space-y-3">
          {/* 已有Free Questions列表（来自 existingQuestions） */}
          {existingQuestions.map(existingQ => (
            <div key={existingQ.id} className="flex items-start gap-2 py-2 px-3 rounded hover:bg-white/5 transition-colors">
              <span className="mt-0.5 flex-shrink-0 text-cyan-400">●</span>
              <span 
                onClick={() => onQuestionClick?.(existingQ.id)}
                className="flex-1 text-sm leading-relaxed text-white/90 hover:text-cyan-300 cursor-pointer"
              >
                {existingQ.text}
              </span>
              <button
                onClick={() => onDeleteQuestion?.(existingQ.id)}
                className="px-2 py-0.5 text-xs text-white/40 hover:text-red-400
                           hover:bg-red-500/10 rounded transition-colors flex-shrink-0"
              >
                Delete
              </button>
            </div>
          ))}

          {/* 已有槽位列表 */}
          {slots.map(slot => (
            <FreeQuestionSlot
              key={slot.id}
              slot={slot}
              onUpdate={handleUpdateSlot}
              onRemove={() => handleRemoveSlot(slot.id)}
              onGenerateAI={handleGenerateAI}
              onQuestionClick={onQuestionClick}
              onDeleteQuestion={onDeleteQuestion}
              onRetrySave={async (s) => {
                if (!s.question?.text || !onSaveQuestion) return undefined
                return onSaveQuestion(s.question.text, chapterName)
              }}
            />
          ))}

          {/* 空状态 - 直接显示添加选项 */}
          {slots.length === 0 && canAddMore && (
            <div className="space-y-2">
              <p className="text-xs text-white/30 leading-relaxed">
                Write your own question or let AI suggest one
              </p>
              <SlotEmptyState
                onStartEdit={() => {
                  const newSlot: Slot = {
                    id: crypto.randomUUID(),
                    chapterId,
                    state: 'editing'
                  }
                  setSlots([newSlot])
                }}
                onStartAI={async () => {
                  const newSlot: Slot = {
                    id: crypto.randomUUID(),
                    chapterId,
                    state: 'ai-generating'
                  }
                  setSlots([newSlot])
                  try {
                    const questionText = await handleGenerateAI()
                    let questionId: string | undefined
                    // 保存到 Supabase
                    if (onSaveQuestion) {
                      try {
                        questionId = await onSaveQuestion(questionText, chapterName)
                      } catch (e) {
                        console.error('保存问题到 Supabase 失败:', e)
                      }
                    }
                    setSlots([{
                      ...newSlot,
                      state: 'filled',
                      question: { text: questionText, source: 'ai' },
                      questionId
                    }])
                  } catch (error) {
                    console.error('AI 生成失败:', error)
                    setSlots([{ ...newSlot, state: 'empty' }])
                  }
                }}
              />
            </div>
          )}

          {/* 有槽位时的添加按钮 */}
          {slots.length > 0 && canAddMore && (
            <AddSlotButton
              remainingCount={remainingCount}
              onClick={handleAddSlot}
            />
          )}

          {/* 达到上限提示 */}
          {!canAddMore && slots.length > 0 && (
            <p className="text-xs text-white/20 py-1">
              Free question limit reached
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// 模拟 AI 生成问题（实际项目中应替换为真实 API）
async function mockGenerateQuestion(
  chapterName: string,
  existingQuestions: string[]
): Promise<string> {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 1500))

  // 根据不同阶段返回不同的模拟问题
  const mockQuestions: Record<string, string[]> = {
    '1. Childhood and Family of Origin': [
      'Is there a toy or item you were reluctant to throw away that you still remember?',
      'Did you have a secret place as a child that only you knew about?',
      'Do you remember how you felt the first time you disappointed your parents?',
      'Was there a childhood nightmare you still think about occasionally?'
    ],
    '2. Elementary to Middle School': [
      'Was there someone you really wanted to befriend but never got close to?',
      'Was there a moment when you suddenly felt you had grown up?',
      'Where did you most often hide to be alone during that time?',
      'Is there something you never told your parents?'
    ],
    '3. High School to College': [
      'Was there someone you secretly admired?',
      'Was there an exam or competition that still makes your heart race?',
      'How did you most often escape from pressure back then?',
      'Was there a decision that seemed small but changed a lot later?'
    ],
    '4. Entering Society and Early Independence': [
      'In your first job, was there a moment you felt recognized?',
      'When first living independently, was there a late night you really missed home?',
      'Was there a failure that felt devastating but was actually a turning point?',
      'What question did you fear others asking you the most?'
    ],
    '5. Family Responsibilities and Key Changes': [
      'Was there a moment you suddenly realized you had become an adult?',
      'What weakness were you most reluctant to admit while taking on responsibilities?',
      'Is there something you always wanted to say to your family but never did?'
    ],
    '6. Values and Life Integration': [
      'If you could write a letter to your younger self, what would you say?',
      'Is there something you used to care about but no longer do?',
      'What would you least want to be forgotten in your life?'
    ]
  }

  // 获取当前阶段的候选问题
  const candidates = mockQuestions[chapterName] || mockQuestions['1. Childhood and Family of Origin']

  // 过滤掉已存在的问题（简单的文本匹配）
  const availableQuestions = candidates.filter(
    q => !existingQuestions.some(eq => eq.includes(q.slice(0, 10)) || q.includes(eq.slice(0, 10)))
  )

  // 如果还有可用的问题，随机返回一个
  if (availableQuestions.length > 0) {
    const randomIndex = Math.floor(Math.random() * availableQuestions.length)
    return availableQuestions[randomIndex]
  }

  // 如果没有可用的问题，返回一个通用问题
  return 'Was there a small thing during that time you did not notice then but often think about now?'
}









