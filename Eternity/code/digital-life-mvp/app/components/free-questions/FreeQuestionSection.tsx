'use client'

import { useState, useEffect, useRef } from 'react'
import { FreeQuestionSlot, Slot } from './FreeQuestionSlot'
import { AddSlotButton } from './AddSlotButton'
import { SlotEmptyState } from './SlotEmptyState'

// 常量
const MAX_SLOTS = 5
const STORAGE_KEY_PREFIX = 'freeQuestions'

type FreeQuestionSectionProps = {
  chapterId: string
  chapterName: string
  existingQuestions: Array<{ id: string; text: string }>  // 该阶段已有的正式问题
  onGenerateAI?: (chapterId: string, chapterName: string, existingTexts: string[]) => Promise<string>
  onSaveQuestion?: (text: string, chapter: string) => Promise<string>  // 保存问题到 Supabase，返回 questionId
  onQuestionClick?: (questionId: string) => void  // 点击问题跳转录音
  onDeleteQuestion?: (questionId: string) => Promise<void> // 删除 Supabase 中的问题
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

  // 将本地存储的自由问题补全 questionId，便于点击跳转
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
      } catch (error: any) {
        console.error('保存问题到 Supabase 失败:', error?.message || error)
        // 不抛出错误，允许槽位更新为 filled 状态，用户可以稍后重试
      }
    }
    setSlots(prev => prev.map(s => s.id === updatedSlot.id ? updatedSlot : s))
  }

  // 删除槽位
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
                   text-sm text-[var(--ink)] hover:text-[var(--ink)]
                   hover:bg-white rounded transition-colors group border border-[var(--border)]"
      >
        <span className="flex items-center gap-2">
          <span className="text-base leading-none opacity-70 group-hover:opacity-100">+</span>
          <span>自由问题</span>
          <span className="text-xs text-[var(--muted)]">
            ({filledSlots.length}/{MAX_SLOTS})
          </span>
        </span>
        <span className="text-xs text-[var(--muted)]">
          {isExpanded ? '▲ 收起' : '▼ 展开'}
        </span>
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="mt-2 ml-2 pl-3 border-l border-slate-200 space-y-3">
          {/* 已有自由问题列表（来自 existingQuestions） */}
          {existingQuestions.map(existingQ => (
            <div key={existingQ.id} className="flex items-start gap-2 py-2 px-3 rounded hover:bg-slate-100 transition-colors">
              <span className="mt-0.5 flex-shrink-0 text-[#B89B72]">●</span>
              <span 
                onClick={() => onQuestionClick?.(existingQ.id)}
                className="flex-1 text-sm leading-relaxed text-slate-800 hover:text-[#8B7355] cursor-pointer"
              >
                {existingQ.text}
              </span>
              <button
                onClick={() => onDeleteQuestion?.(existingQ.id)}
                className="px-2 py-0.5 text-xs text-slate-400 hover:text-red-600
                           hover:bg-red-50 rounded transition-colors flex-shrink-0"
              >
                删除
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
              <p className="text-xs text-slate-500 leading-relaxed">
                写下你自己想回答的问题，或让 AI 帮你想一个
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
                      } catch (e: any) {
                        console.error('保存 AI 生成问题到 Supabase 失败:', e?.message || e)
                        // 继续执行，允许用户稍后重试保存
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
            <p className="text-xs text-slate-400 py-1">
              已达到自由问题上限
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
    '1. 童年与原生家庭': [
      '有没有一个玩具或物品，你特别舍不得丢掉，至今还记得它？',
      '小时候有没有一个秘密基地，是只有你知道的地方？',
      '你还记得第一次让父母失望时的感觉吗？',
      '童年时有没有一个噩梦，到现在还偶尔想起？'
    ],
    '2. 小学到初中': [
      '那时候有没有一个人，你很想和他成为朋友，但始终没能靠近？',
      '有没有哪个瞬间，你突然觉得自己长大了？',
      '那段时间，你最常躲在哪里一个人待着？',
      '有没有一件事，你从来没告诉过父母？'
    ],
    '3. 高中到大学': [
      '那时候有没有一个你暗暗羡慕的人？',
      '有没有一次考试或比赛，至今想起来还会心跳加速？',
      '那时候你最常用什么方式逃避压力？',
      '有没有一个决定，当时觉得很小，后来才发现改变了很多？'
    ],
    '4. 进入社会与早期独立': [
      '第一份工作里，有没有一个让你感到被认可的瞬间？',
      '刚独立时，有没有哪个深夜让你特别想家？',
      '有没有一次失败，当时觉得天塌了，现在回头看其实是转折？',
      '那时候你最怕别人问你什么问题？'
    ],
    '5. 成家责任与关键变化': [
      '有没有一个瞬间，你突然意识到自己成了"大人"？',
      '在承担责任的过程中，你最不愿意承认的软弱是什么？',
      '有没有一句话，你一直想对家人说，但始终没说出口？'
    ],
    '6. 价值观模式与整合': [
      '如果可以给年轻时的自己写一封信，你最想说什么？',
      '有没有一个曾经很在意的事，现在完全不在意了？',
      '你觉得自己这一生，最不想被遗忘的是什么？'
    ]
  }

  // 获取当前阶段的候选问题
  const candidates = mockQuestions[chapterName] || mockQuestions['1. 童年与原生家庭']

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
  return '那段时间，有没有一件小事，当时没在意，现在却常常想起？'
}
