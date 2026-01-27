'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import PersonCard from '../../components/PersonCard'
import PeopleGraph from '../../components/PeopleGraph'
import MergeModal from '../../components/MergeModal'
import DuplicatesList from '../../components/DuplicatesList'
import Link from 'next/link'
import UnifiedNav from '../components/UnifiedNav'
import { DuplicateGroup } from '@/lib/types/knowledge-graph'

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
  node_color?: string // 用户自定义的节点颜色
  photos?: Array<{
    url: string
    caption?: string
    source: string
    isPrimary?: boolean
  }>
}

interface Relationship {
  id: string
  person_a_id: string
  person_b_id: string
  relationship_type: string
  custom_label?: string
  bidirectional: boolean
}

export default function FamilyPage() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isRefreshingPhotos, setIsRefreshingPhotos] = useState(false)
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showRelationshipModal, setShowRelationshipModal] = useState(false)
  const [selectedNodesForRelation, setSelectedNodesForRelation] = useState<string[]>([])
  const [isApplyingCorrections, setIsApplyingCorrections] = useState(false)
  const [pendingCorrectionsCount, setPendingCorrectionsCount] = useState(0)
  const [isDetectingDuplicates, setIsDetectingDuplicates] = useState(false)
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [showDuplicatesList, setShowDuplicatesList] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSourcePerson, setMergeSourcePerson] = useState<Person | null>(null)

  const showToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2500)
  }, [])

  // 初始化：获取项目ID
  useEffect(() => {
    async function initProject() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          showToast('请先登录', 'error')
          return
        }

        let { data: projects, error: selectError } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)

        if (selectError) throw selectError

        let pid = projects?.[0]?.id

        if (!pid) {
          const { data: created, error: insertError } = await supabase
            .from('projects')
            .insert({ owner_id: user.id, name: 'My Vault' })
            .select('id')
            .single()

          if (insertError) throw insertError
          pid = created.id
        }

        setProjectId(pid)
      } catch (error: any) {
        console.error('初始化项目失败:', error)
        showToast('初始化项目失败', 'error')
      }
    }

    initProject()
  }, [showToast])

  // 加载人物和关系
  useEffect(() => {
    if (!projectId) return

    async function loadData() {
      setIsLoading(true)
      try {
        // 加载人物
        const peopleRes = await fetch(`/api/people?projectId=${projectId}`)
        const peopleData = await peopleRes.json()

        if (peopleData.error) throw new Error(peopleData.error)

        // 为每个人物加载照片
        const peopleWithPhotos = await Promise.all(
          (peopleData.people || []).map(async (person: Person) => {
            try {
              const photosRes = await fetch(
                `/api/people/photos?personId=${person.id}&projectId=${projectId}`
              )
              const photosData = await photosRes.json()
              return {
                ...person,
                photos: photosData.photos || [],
              }
            } catch (error) {
              console.error(`加载人物 ${person.name} 的照片失败:`, error)
              return person
            }
          })
        )

        setPeople(peopleWithPhotos)

        // 加载关系
        const relRes = await fetch(`/api/people/relationships?projectId=${projectId}`)
        const relData = await relRes.json()

        if (relData.error) throw new Error(relData.error)

        setRelationships(relData.relationships || [])
      } catch (error: any) {
        console.error('加载数据失败:', error)
        showToast('加载数据失败', 'error')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [projectId, showToast])

  // 重新加载人物和关系数据（不刷新页面）
  const reloadData = useCallback(async () => {
    if (!projectId) return

    try {
      // 加载人物
      const peopleRes = await fetch(`/api/people?projectId=${projectId}`)
      const peopleData = await peopleRes.json()

      if (peopleData.error) throw new Error(peopleData.error)

      // 为每个人物加载照片
      const peopleWithPhotos = await Promise.all(
        (peopleData.people || []).map(async (person: Person) => {
          try {
            const photosRes = await fetch(
              `/api/people/photos?personId=${person.id}&projectId=${projectId}`
            )
            const photosData = await photosRes.json()
            return {
              ...person,
              photos: photosData.photos || [],
            }
          } catch (error) {
            console.error(`加载人物 ${person.name} 的照片失败:`, error)
            return person
          }
        })
      )

      setPeople(peopleWithPhotos)

      // 加载关系（保留已有的关系，不会被覆盖）
      const relRes = await fetch(`/api/people/relationships?projectId=${projectId}`)
      const relData = await relRes.json()

      if (relData.error) throw new Error(relData.error)

      setRelationships(relData.relationships || [])
    } catch (error: any) {
      console.error('重新加载数据失败:', error)
      showToast('重新加载数据失败', 'error')
    }
  }, [projectId, showToast])

  // 触发人物抽取（同步执行，增量更新，不会删除已有人物和关系）
  const handleExtractPeople = async () => {
    if (!projectId || isExtracting) return

    setIsExtracting(true)

    try {
      console.log('[Family] Starting people extraction for project:', projectId)
      showToast('正在抽取人物，请稍候...（已有编辑不会丢失）', 'success')

      const res = await fetch('/api/people/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      console.log('[Family] API response status:', res.status)

      const data = await res.json()
      console.log('[Family] API response data:', data)

      if (!data.success) {
        throw new Error(data.error || 'Extraction failed')
      }

      // 检查结果
      const newPeople = data.newPeople || 0
      const updatedPeople = data.updatedPeople || 0

      if (data.message) {
        // 没有大纲或大纲为空
        showToast(data.message, 'error')
      } else if (newPeople === 0 && updatedPeople === 0) {
        showToast('没有找到新人物', 'error')
      } else {
        showToast(`抽取完成！新增 ${newPeople} 人，更新 ${updatedPeople} 人。已有的人物编辑和关系已保留。`, 'success')
        // 增量更新：重新加载数据，不刷新页面，保留用户的所有编辑
        await reloadData()
      }
    } catch (error: any) {
      console.error('[Family] 人物抽取失败:', error)
      showToast('人物抽取失败: ' + error.message, 'error')
    } finally {
      setIsExtracting(false)
    }
  }

  // 刷新照片关联
  const handleRefreshPhotos = async () => {
    if (!projectId) return

    setIsRefreshingPhotos(true)

    try {
      // 重新加载所有人物的照片
      const updatedPeople = await Promise.all(
        people.map(async (person) => {
          const photosRes = await fetch(
            `/api/people/photos?personId=${person.id}&projectId=${projectId}`
          )
          const photosData = await photosRes.json()
          return {
            ...person,
            photos: photosData.photos || [],
          }
        })
      )

      setPeople(updatedPeople)
      showToast('照片关联已刷新', 'success')
    } catch (error: any) {
      console.error('刷新照片失败:', error)
      showToast('刷新照片失败', 'error')
    } finally {
      setIsRefreshingPhotos(false)
    }
  }

  // 加载待应用的名字修正数量
  const loadPendingCorrectionsCount = useCallback(async () => {
    if (!projectId) return

    try {
      const res = await fetch(`/api/people/name-corrections?projectId=${projectId}`)
      const data = await res.json()
      if (data.corrections) {
        setPendingCorrectionsCount(data.corrections.length)
      }
    } catch (error) {
      console.error('加载名字修正数量失败:', error)
    }
  }, [projectId])

  // 在页面加载时获取修正数量
  useEffect(() => {
    if (projectId) {
      loadPendingCorrectionsCount()
    }
  }, [projectId, loadPendingCorrectionsCount])

  // 应用名字修正到提纲
  const handleApplyCorrectionsToOutline = async () => {
    if (!projectId || isApplyingCorrections) return

    setIsApplyingCorrections(true)

    try {
      const res = await fetch('/api/people/apply-corrections-to-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || '应用失败')
      }

      showToast(data.message, 'success')

      // 如果有应用的修正，显示详细信息
      if (data.corrections && data.corrections.length > 0) {
        const details = data.corrections
          .map((c: { oldName: string; newName: string; count: number }) => `${c.oldName}→${c.newName}(${c.count}处)`)
          .join('、')
        console.log('[Family] Applied corrections:', details)
      }
    } catch (error: any) {
      console.error('应用名字修正失败:', error)
      showToast('应用失败: ' + error.message, 'error')
    } finally {
      setIsApplyingCorrections(false)
    }
  }

  // 更新人物信息
  const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
    try {
      // 检查是否修改了名字
      const person = people.find((p) => p.id === personId)
      const isNameChanged = updates.name && person && updates.name !== person.name

      const res = await fetch('/api/people', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId,
          updates,
          applyGlobalNameCorrection: isNameChanged,
        }),
      })

      const data = await res.json()

      if (data.error) throw new Error(data.error)

      // 更新本地状态
      setPeople((prev) =>
        prev.map((p) => (p.id === personId ? { ...p, ...updates } : p))
      )

      showToast('人物信息已更新', 'success')

      if (isNameChanged) {
        showToast(
          `姓名已修改：${person.name} → ${updates.name}。可点击"应用到提纲"按钮更新传记大纲。`,
          'success'
        )
        // 刷新待应用的修正数量
        loadPendingCorrectionsCount()
      }
    } catch (error: any) {
      console.error('更新人物失败:', error)
      showToast('更新失败: ' + error.message, 'error')
    }
  }

  // 删除人物
  const handleDeletePerson = async (personId: string) => {
    try {
      const res = await fetch(`/api/people?personId=${personId}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setPeople((prev) => prev.filter((p) => p.id !== personId))
      setSelectedPerson(null)
      showToast('人物已删除', 'success')
    } catch (error: any) {
      console.error('删除人物失败:', error)
      showToast('删除失败: ' + error.message, 'error')
    }
  }

  // 检测重复人物
  const handleDetectDuplicates = async () => {
    if (!projectId || isDetectingDuplicates) return

    setIsDetectingDuplicates(true)

    try {
      console.log('[Family] Detecting duplicates for project:', projectId)

      const res = await fetch('/api/people/detect-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Detection failed')
      }

      setDuplicateGroups(data.duplicateGroups || [])

      if (data.totalDuplicates > 0) {
        setShowDuplicatesList(true)
        showToast(`发现 ${data.totalDuplicates} 组可能重复的人物`, 'success')
      } else {
        showToast('没有发现重复的人物', 'success')
      }
    } catch (error: any) {
      console.error('[Family] 检测重复人物失败:', error)
      showToast('检测失败: ' + error.message, 'error')
    } finally {
      setIsDetectingDuplicates(false)
    }
  }

  // 打开合并模态框
  const handleOpenMergeModal = (person: Person) => {
    setMergeSourcePerson(person)
    setShowMergeModal(true)
  }

  // 从重复列表触发合并
  const handleMergeFromDuplicates = (primaryPerson: Person, secondaryPerson: Person) => {
    setMergeSourcePerson(primaryPerson)
    setShowDuplicatesList(false)
    setShowMergeModal(true)
  }

  // 合并成功后的处理
  const handleMergeSuccess = async () => {
    showToast('人物合并成功！', 'success')
    await reloadData()
  }

  // 添加关系
  const handleAddRelationship = async (personAId: string, personBId: string) => {
    setSelectedNodesForRelation([personAId, personBId])
    setShowRelationshipModal(true)
  }

  const handleCreateRelationship = async (
    relationshipType: string,
    customLabel?: string
  ) => {
    if (!projectId || selectedNodesForRelation.length !== 2) return

    try {
      const res = await fetch('/api/people/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          personAId: selectedNodesForRelation[0],
          personBId: selectedNodesForRelation[1],
          relationshipType,
          customLabel,
          bidirectional: true,
        }),
      })

      const data = await res.json()

      if (data.error) throw new Error(data.error)

      setRelationships((prev) => [...prev, data.relationship])
      showToast('关系已创建', 'success')
      setShowRelationshipModal(false)
      setSelectedNodesForRelation([])
    } catch (error: any) {
      console.error('创建关系失败:', error)
      showToast('创建失败: ' + error.message, 'error')
    }
  }

  const stats = {
    total: people.length,
    confirmed: people.filter((p) => p.extraction_status === 'confirmed').length,
    pending: people.filter((p) => p.extraction_status === 'pending').length,
    totalPhotos: people.reduce((sum, p) => sum + (p.photos?.length || 0), 0),
    totalRelationships: relationships.length,
  }

  return (
    <main 
      className="min-h-screen bg-[#F7F5F2]"
      style={{ padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 4px' }}>
        <UnifiedNav />
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                家庭人物空间
              </h1>
              <p className="text-[#666666] mt-1">
                从你的传记大纲中自动识别你提到过的人，帮你整理成家庭/人物关系网。
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExtractPeople}
                disabled={isExtracting}
                className="px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExtracting ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>抽取中...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>重新抽取人物</span>
                  </>
                )}
              </button>
              <button
                onClick={handleRefreshPhotos}
                disabled={isRefreshingPhotos}
                className="px-5 py-2.5 bg-white border border-[#E5E5E0] text-[#2C2C2C] rounded-xl hover:bg-[#F5F5F0] transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefreshingPhotos ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>刷新中...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span>刷新照片关联</span>
                  </>
                )}
              </button>
              {pendingCorrectionsCount > 0 && (
                <button
                  onClick={handleApplyCorrectionsToOutline}
                  disabled={isApplyingCorrections}
                  className="px-5 py-2.5 bg-[#2E7D32] hover:bg-[#1B5E20] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplyingCorrections ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>应用中...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
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
                      <span>应用到提纲 ({pendingCorrectionsCount})</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleDetectDuplicates}
                disabled={isDetectingDuplicates || people.length === 0}
                className="px-5 py-2.5 bg-[#D32F2F] hover:bg-[#B71C1C] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDetectingDuplicates ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>检测中...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>检测重复</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
            <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E0]">
              <div className="text-2xl font-bold text-[#2C2C2C]">
                {stats.total}
              </div>
              <div className="text-sm text-[#666666]">总人物</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E0]">
              <div className="text-2xl font-bold text-[#2E7D32]">{stats.confirmed}</div>
              <div className="text-sm text-[#666666]">已确认</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E0]">
              <div className="text-2xl font-bold text-[#F9A825]">{stats.pending}</div>
              <div className="text-sm text-[#666666]">待确认</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E0]">
              <div className="text-2xl font-bold text-[#1565C0]">
                {stats.totalRelationships}
              </div>
              <div className="text-sm text-[#666666]">关系数</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border border-[#E5E5E0]">
              <div className="text-2xl font-bold text-[#6A1B9A]">{stats.totalPhotos}</div>
              <div className="text-sm text-[#666666]">关联照片</div>
            </div>
          </div>

        </div>

        {/* Main Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <svg
                className="animate-spin h-12 w-12 mx-auto text-blue-500 mb-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-gray-600 dark:text-gray-400">加载中...</p>
            </div>
          </div>
        ) : people.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-12 text-center">
            <svg
              className="w-24 h-24 mx-auto text-gray-400 mb-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              还没有人物
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              点击"重新抽取人物"按钮，系统将从你的传记大纲中自动识别人物
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
              💡 提示：请先前往主页回答问题并生成传记大纲，然后再回来抽取人物
            </p>
            <button
              onClick={handleExtractPeople}
              disabled={isExtracting}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExtracting ? '抽取中...' : '开始抽取人物'}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 relative">
            <button
              onClick={() => window.location.reload()}
              className="absolute top-6 right-6 z-10 px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              刷新页面生效编辑
            </button>
            <PeopleGraph
              people={people}
              relationships={relationships}
              onNodeClick={(person) => setSelectedPerson(person)}
              onAddRelationship={handleAddRelationship}
            />
          </div>
        )}
      </div>

      {/* Person Detail Card */}
      {selectedPerson && (
        <PersonCard
          person={selectedPerson}
          onUpdate={handleUpdatePerson}
          onDelete={handleDeletePerson}
          onClose={() => setSelectedPerson(null)}
          onMerge={handleOpenMergeModal}
        />
      )}

      {/* Relationship Modal */}
      {showRelationshipModal && (
        <RelationshipModal
          personAId={selectedNodesForRelation[0]}
          personBId={selectedNodesForRelation[1]}
          people={people}
          onClose={() => {
            setShowRelationshipModal(false)
            setSelectedNodesForRelation([])
          }}
          onCreate={handleCreateRelationship}
        />
      )}

      {/* Merge Modal */}
      {showMergeModal && mergeSourcePerson && projectId && (
        <MergeModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          sourcePerson={mergeSourcePerson as any}
          allPeople={people as any}
          projectId={projectId}
          onMergeSuccess={handleMergeSuccess}
        />
      )}

      {/* Duplicates List */}
      {showDuplicatesList && projectId && (
        <DuplicatesList
          isOpen={showDuplicatesList}
          onClose={() => setShowDuplicatesList(false)}
          duplicateGroups={duplicateGroups}
          allPeople={people as any}
          projectId={projectId}
          onMerge={handleMergeFromDuplicates as any}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed right-6 bottom-6 px-6 py-4 rounded-lg shadow-2xl z-50 ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </main>
  )
}

// 关系创建模态框
function RelationshipModal({
  personAId,
  personBId,
  people,
  onClose,
  onCreate,
}: {
  personAId: string
  personBId: string
  people: Person[]
  onClose: () => void
  onCreate: (type: string, customLabel?: string) => void
}) {
  const [relationshipType, setRelationshipType] = useState('friend')
  const [customLabel, setCustomLabel] = useState('')

  const personA = people.find((p) => p.id === personAId)
  const personB = people.find((p) => p.id === personBId)

  const relationshipTypes = [
    { value: 'parent', label: '父母/子女' },
    { value: 'spouse', label: '配偶' },
    { value: 'sibling', label: '兄弟姐妹' },
    { value: 'friend', label: '朋友' },
    { value: 'colleague', label: '同事' },
    { value: 'custom', label: '自定义' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          创建关系
        </h2>
        <div className="mb-4">
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            <span className="font-semibold text-blue-600">{personA?.name}</span>
            {' 与 '}
            <span className="font-semibold text-purple-600">{personB?.name}</span>
            {' 的关系'}
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              关系类型
            </label>
            <select
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
            >
              {relationshipTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          {relationshipType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                自定义描述
              </label>
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="例如：表兄弟、师生关系"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => onCreate(relationshipType, customLabel || undefined)}
              disabled={relationshipType === 'custom' && !customLabel.trim()}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              创建
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
