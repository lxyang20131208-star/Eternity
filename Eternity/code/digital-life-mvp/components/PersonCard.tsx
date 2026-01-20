'use client'

import { useState } from 'react'
import Image from 'next/image'

interface Person {
  id: string
  name: string
  aliases?: string[]
  relationship_to_user?: string
  bio_snippet?: string
  avatar_url?: string
  importance_score?: number
  confidence_score?: number
  extraction_status?: string
  photos?: Array<{
    url: string
    caption?: string
    source: string
    isPrimary?: boolean
  }>
}

interface PersonCardProps {
  person: Person
  onUpdate: (personId: string, updates: Partial<Person>) => Promise<void>
  onDelete: (personId: string) => Promise<void>
  onClose: () => void
}

const RELATIONSHIP_PRESETS = [
  '父亲',
  '母亲',
  '祖父',
  '祖母',
  '外祖父',
  '外祖母',
  '兄弟',
  '姐妹',
  '配偶',
  '儿子',
  '女儿',
  '孙子',
  '孙女',
  '叔叔',
  '阿姨',
  '舅舅',
  '姨妈',
  '堂兄弟',
  '表兄弟',
  '朋友',
  '同学',
  '同事',
  '老师',
  '学生',
  '邻居',
  '其他',
]

export default function PersonCard({ person, onUpdate, onDelete, onClose }: PersonCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editedData, setEditedData] = useState({
    name: person.name,
    relationship_to_user: person.relationship_to_user || '',
    bio_snippet: person.bio_snippet || '',
    aliases: person.aliases || [],
  })
  const [newAlias, setNewAlias] = useState('')
  const [customRelationship, setCustomRelationship] = useState('')
  const [showCustomRelationship, setShowCustomRelationship] = useState(
    person.relationship_to_user && !RELATIONSHIP_PRESETS.includes(person.relationship_to_user)
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const updates: Partial<Person> = {
        name: editedData.name,
        relationship_to_user: showCustomRelationship
          ? customRelationship
          : editedData.relationship_to_user,
        bio_snippet: editedData.bio_snippet,
        aliases: editedData.aliases,
      }

      await onUpdate(person.id, updates)
      setIsEditing(false)
    } catch (error) {
      console.error('保存失败:', error)
      alert('保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddAlias = () => {
    if (newAlias.trim() && !editedData.aliases.includes(newAlias.trim())) {
      setEditedData({
        ...editedData,
        aliases: [...editedData.aliases, newAlias.trim()],
      })
      setNewAlias('')
    }
  }

  const handleRemoveAlias = (alias: string) => {
    setEditedData({
      ...editedData,
      aliases: editedData.aliases.filter((a) => a !== alias),
    })
  }

  const handleDelete = async () => {
    if (confirm(`确定要删除人物 "${person.name}" 吗？此操作无法撤销。`)) {
      try {
        await onDelete(person.id)
        onClose()
      } catch (error) {
        console.error('删除失败:', error)
        alert('删除失败，请重试')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {person.avatar_url ? (
                <Image
                  src={person.avatar_url}
                  alt={person.name}
                  width={64}
                  height={64}
                  className="rounded-full border-4 border-white/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-bold text-white">
                  {person.name.charAt(0)}
                </div>
              )}
              <div className="text-white">
                <h2 className="text-2xl font-bold">{person.name}</h2>
                <p className="text-sm text-white/80">
                  {person.relationship_to_user || '关系未知'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Status Badges */}
          <div className="flex gap-2 mt-3">
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                person.extraction_status === 'confirmed'
                  ? 'bg-green-500/20 text-green-100'
                  : person.extraction_status === 'pending'
                  ? 'bg-yellow-500/20 text-yellow-100'
                  : 'bg-gray-500/20 text-gray-100'
              }`}
            >
              {person.extraction_status === 'confirmed'
                ? '已确认'
                : person.extraction_status === 'pending'
                ? '待确认'
                : '未知状态'}
            </span>
            {person.importance_score && person.importance_score > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/20 text-white">
                提到 {person.importance_score} 次
              </span>
            )}
            {person.confidence_score && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/20 text-white">
                置信度 {Math.round(person.confidence_score * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Edit Mode Toggle */}
          <div className="flex justify-end gap-2">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                编辑信息
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditedData({
                      name: person.name,
                      relationship_to_user: person.relationship_to_user || '',
                      bio_snippet: person.bio_snippet || '',
                      aliases: person.aliases || [],
                    })
                  }}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
              </>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              姓名
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editedData.name}
                onChange={(e) => setEditedData({ ...editedData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            ) : (
              <p className="text-lg text-gray-900 dark:text-white">{person.name}</p>
            )}
          </div>

          {/* Aliases */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              别称/昵称
            </label>
            <div className="flex flex-wrap gap-2">
              {editedData.aliases.map((alias) => (
                <span
                  key={alias}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm"
                >
                  {alias}
                  {isEditing && (
                    <button
                      onClick={() => handleRemoveAlias(alias)}
                      className="ml-1 text-purple-500 hover:text-purple-700"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {editedData.aliases.length === 0 && !isEditing && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">无别称</p>
              )}
            </div>
            {isEditing && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddAlias()}
                  placeholder="输入别称，按回车添加"
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                />
                <button
                  onClick={handleAddAlias}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  添加
                </button>
              </div>
            )}
          </div>

          {/* Relationship */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              与我的关系
            </label>
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {RELATIONSHIP_PRESETS.filter((r) => r !== '其他').map((rel) => (
                    <button
                      key={rel}
                      onClick={() => {
                        setEditedData({ ...editedData, relationship_to_user: rel })
                        setShowCustomRelationship(false)
                      }}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        editedData.relationship_to_user === rel && !showCustomRelationship
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {rel}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCustomRelationship(true)}
                    className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                      showCustomRelationship
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    自定义
                  </button>
                </div>
                {showCustomRelationship && (
                  <input
                    type="text"
                    value={customRelationship}
                    onChange={(e) => setCustomRelationship(e.target.value)}
                    placeholder="输入自定义关系（如：大学室友）"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                  />
                )}
              </div>
            ) : (
              <p className="text-gray-900 dark:text-white">
                {person.relationship_to_user || '未设置'}
              </p>
            )}
          </div>

          {/* Bio Snippet */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              人物描述
            </label>
            {isEditing ? (
              <textarea
                value={editedData.bio_snippet}
                onChange={(e) => setEditedData({ ...editedData, bio_snippet: e.target.value })}
                rows={4}
                placeholder="一句话或一段话描述这个人..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white resize-none"
              />
            ) : (
              <p className="text-gray-700 dark:text-gray-300">
                {person.bio_snippet || '暂无描述'}
              </p>
            )}
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              相关照片
            </label>
            {person.photos && person.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {person.photos.map((photo, idx) => (
                  <div key={idx} className="relative group aspect-square">
                    <Image
                      src={photo.url}
                      alt={photo.caption || '照片'}
                      fill
                      className="object-cover rounded-lg"
                    />
                    {photo.isPrimary && (
                      <span className="absolute top-1 right-1 px-2 py-1 bg-blue-500 text-white text-xs rounded">
                        主照片
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <p className="text-white text-xs px-2 text-center">
                        {photo.caption || '无描述'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">暂无关联照片</p>
            )}
          </div>

          {/* Delete Button */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              删除此人物
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
