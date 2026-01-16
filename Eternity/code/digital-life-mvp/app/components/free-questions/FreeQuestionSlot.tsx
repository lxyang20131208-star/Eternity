'use client'

import { useState } from 'react'
import { SlotEmptyState } from './SlotEmptyState'
import { SlotEditMode } from './SlotEditMode'
import { SlotFilledDisplay } from './SlotFilledDisplay'
import { AIGeneratingIndicator } from './AIGeneratingIndicator'

// 类型定义
export type SlotState = 'empty' | 'editing' | 'ai-generating' | 'filled'

export type FreeQuestionData = {
  text: string
  source: 'user' | 'ai'
}

export type Slot = {
  id: string
  chapterId: string
  state: SlotState
  question?: FreeQuestionData
  questionId?: string  // Supabase questions 表的 ID
}

type FreeQuestionSlotProps = {
  slot: Slot
  onUpdate: (slot: Slot) => void
  onRemove: () => void
  onGenerateAI: () => Promise<string>
  onQuestionClick?: (questionId: string) => void
  onDeleteQuestion?: (questionId: string) => Promise<void>
  onRetrySave?: (slot: Slot) => Promise<string | undefined>  // 重试保存
}

export function FreeQuestionSlot({
  slot,
  onUpdate,
  onRemove,
  onGenerateAI,
  onQuestionClick,
  onDeleteQuestion,
  onRetrySave
}: FreeQuestionSlotProps) {
  const [editInitialText, setEditInitialText] = useState('')

  // 处理开始编辑
  const handleStartEdit = () => {
    setEditInitialText('')
    onUpdate({ ...slot, state: 'editing' })
  }

  // 处理编辑已有问题
  const handleEditExisting = () => {
    setEditInitialText(slot.question?.text || '')
    onUpdate({ ...slot, state: 'editing' })
  }

  // 处理保存
  const handleSave = (text: string) => {
    onUpdate({
      ...slot,
      state: 'filled',
      question: {
        text,
        source: editInitialText ? slot.question?.source || 'user' : 'user'
      }
    })
    setEditInitialText('')
  }

  // 处理取消编辑
  const handleCancel = () => {
    // 如果之前有问题，恢复到 filled 状态；否则恢复到 empty
    if (slot.question?.text) {
      onUpdate({ ...slot, state: 'filled' })
    } else {
      onUpdate({ ...slot, state: 'empty' })
    }
    setEditInitialText('')
  }

  // 处理 AI 生成
  const handleStartAI = async () => {
    onUpdate({ ...slot, state: 'ai-generating' })
    try {
      const question = await onGenerateAI()
      onUpdate({
        ...slot,
        state: 'filled',
        question: { text: question, source: 'ai' }
      })
    } catch (error) {
      console.error('AI 生成问题失败:', error)
      // 生成失败，恢复到空状态
      onUpdate({ ...slot, state: 'empty' })
    }
  }

  // 根据状态渲染不同的组件
  switch (slot.state) {
    case 'empty':
      return (
        <SlotEmptyState
          onStartEdit={handleStartEdit}
          onStartAI={handleStartAI}
        />
      )

    case 'editing':
      return (
        <SlotEditMode
          initialText={editInitialText}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )

    case 'ai-generating':
      return <AIGeneratingIndicator />

    case 'filled':
      if (!slot.question) {
        // 异常情况，恢复到空状态
        onUpdate({ ...slot, state: 'empty' })
        return null
      }

      const handleDelete = async () => {
        // 先删后移除槽位，避免未删除时状态丢失
        if (slot.questionId && onDeleteQuestion) {
          try {
            await onDeleteQuestion(slot.questionId)
          } catch (error) {
            console.error('删除自由问题失败:', error)
            return
          }
        }
        onRemove()
      }

      const handleRetry = async () => {
        if (!onRetrySave) return
        try {
          const questionId = await onRetrySave(slot)
          if (questionId) {
            onUpdate({ ...slot, questionId })
          }
        } catch (error) {
          console.error('重试保存失败:', error)
        }
      }

      return (
        <SlotFilledDisplay
          text={slot.question.text}
          source={slot.question.source}
          questionId={slot.questionId}
          onEdit={handleEditExisting}
          onDelete={handleDelete}
          onClick={onQuestionClick}
          onRetry={handleRetry}
        />
      )

    default:
      return null
  }
}
