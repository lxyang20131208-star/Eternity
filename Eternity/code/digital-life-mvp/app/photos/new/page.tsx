"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

// Basic types
export type Person = {
  id: string
  name: string
  relation?: string
  avatarUrl?: string
  isUnknown?: boolean
}

export type PhotoItem = {
  id: string
  fileName: string
  previewUrl: string
  remoteUrl?: string
  // 5-field annotation
  linkedQuestionId?: string
  people: Person[]
  timeTaken?: string
  timePrecision: 'exact' | 'year' | 'month' | 'range' | 'fuzzy'
  placeId?: string
  placeName?: string
  caption?: string
  // Legacy scene fields
  scene: {
    location?: string
    date?: string
    event?: string
    tags: string[]
    notes?: string
  }
}

type Question = {
  id: string
  question_text: string
  category?: string
}

type Place = {
  id: string
  name: string
  description?: string
}

type Step = 1 | 2 | 3 | 4 | 5

const LOCAL_ROSTER_KEY = "photoFlow.peopleRoster"
const LOCAL_PHOTOS_KEY = "photoFlow.photos"
const LOCAL_SAVE_KEY = "photoFlow.lastSaved"

const EXISTING_PEOPLE: Person[] = []

const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export default function NewPhotoFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<Step>(1)
  const [prefilledPersonId, setPrefilledPersonId] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "uploading" | "uploaded" | "annotating">("idle")
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [peopleRoster, setPeopleRoster] = useState<Person[]>(EXISTING_PEOPLE)
  const [questions, setQuestions] = useState<Question[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [newPlaceName, setNewPlaceName] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasHydratedRoster = useRef(false)
  const hasHydratedPhotos = useRef(false)

  // Load questions and places
  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Load questions (排除 trial 问题，只显示核心问题和用户自定义问题)
        const { data: questionsData } = await supabase
          .from('questions')
          .select('id, question_text, category')
          .in('scope', ['global', 'user'])  // 排除 trial 问题
          .order('category', { ascending: true })
        if (questionsData) setQuestions(questionsData)

        // Load places
        const { data: placesData } = await supabase
          .from('places')
          .select('id, name, description')
          .order('name', { ascending: true })
        if (placesData) setPlaces(placesData)
      } catch (e) {
        console.warn("Failed to load questions/places", e)
      }
    }
    loadData()
  }, [])

  // Paste-to-upload
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return
      const items = Array.from(e.clipboardData.files || [])
      if (items.length) {
        handleFiles(items)
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  // Load roster from localStorage
  useEffect(() => {
    if (hasHydratedRoster.current) return
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(LOCAL_ROSTER_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Person[]
        if (Array.isArray(parsed)) {
          const validPeople = parsed.filter(p => isValidUUID(p.id))
          setPeopleRoster(validPeople)
        }
      }
    } catch (e) {
      console.warn("Roster restore failed", e)
    } finally {
      hasHydratedRoster.current = true
    }
  }, [])

  // Load last saved meta
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(LOCAL_SAVE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt?: string }
        if (parsed?.savedAt) setLastSavedAt(parsed.savedAt)
      }
    } catch (e) {
      console.warn("Save meta restore failed", e)
    }
  }, [])

  // Persist roster to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasHydratedRoster.current) return
    try {
      window.localStorage.setItem(LOCAL_ROSTER_KEY, JSON.stringify(peopleRoster))
    } catch (e) {
      console.warn("Roster persist failed", e)
    }
  }, [peopleRoster])

  // Load people roster from backend on mount (but NOT photos - this is for NEW uploads only)
  useEffect(() => {
    if (hasHydratedPhotos.current) return
    hasHydratedPhotos.current = true

    async function loadRosterOnly() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return

        // Only load the people roster, not the photos
        // /photos/new is for NEW uploads - it should not load already saved photos
        const response = await fetch('/api/photos/save', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (response.ok) {
          const { roster: loadedRoster } = await response.json()
          // Only load the roster (people list), NOT the photos
          if (loadedRoster?.length) {
            setPeopleRoster(loadedRoster)
          }
        }
      } catch (e) {
        console.warn("Backend roster load failed", e)
      }
    }

    loadRosterOnly()
  }, [])

  // Handle URL params for pre-filling person from Family page
  useEffect(() => {
    const personId = searchParams.get('personId')
    const personName = searchParams.get('personName')

    if (personId && personName && isValidUUID(personId)) {
      setPrefilledPersonId(personId)

      // Check if person already exists in roster
      const existingPerson = peopleRoster.find(p => p.id === personId)
      if (!existingPerson) {
        // Add the person to the roster
        const newPerson: Person = {
          id: personId,
          name: decodeURIComponent(personName),
        }
        setPeopleRoster(prev => [...prev, newPerson])
      }

      // Show a toast notification
      showToast(`已预选人物：${decodeURIComponent(personName)}`, "success")
    }
  }, [searchParams, peopleRoster])

  // Auto-add prefilled person to current photo when photo is created
  useEffect(() => {
    if (prefilledPersonId && photos.length > 0) {
      const person = peopleRoster.find(p => p.id === prefilledPersonId)
      if (person) {
        // Add person to all photos that don't have them yet
        setPhotos(prev => prev.map(photo => {
          const hasPerson = photo.people.some(p => p.id === prefilledPersonId)
          if (!hasPerson) {
            return { ...photo, people: [...photo.people, person] }
          }
          return photo
        }))
        // Clear the prefilled person after adding
        setPrefilledPersonId(null)
      }
    }
  }, [prefilledPersonId, photos.length, peopleRoster])

  // Persist photo annotations
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasHydratedPhotos.current) return
    try {
      window.localStorage.setItem(LOCAL_PHOTOS_KEY, JSON.stringify(photos))
    } catch (e) {
      console.warn("Photo persist failed", e)
    }
  }, [photos])

  const currentPhoto = useMemo(() => photos.find((p) => p.id === selectedPhotoId) ?? photos[0], [photos, selectedPhotoId])
  const canContinue = step === 1 ? photos.length > 0 : true

  // Calculate completion status for current photo
  const completionStatus = useMemo(() => {
    if (!currentPhoto) return { complete: false, missing: [] as string[] }
    const missing: string[] = []
    if (!currentPhoto.linkedQuestionId) missing.push('问题')
    if (!currentPhoto.people.length) missing.push('人物')
    if (!currentPhoto.timeTaken) missing.push('时间')
    if (!currentPhoto.placeId) missing.push('地点')
    if (!currentPhoto.caption?.trim()) missing.push('描述')
    return { complete: missing.length === 0, missing }
  }, [currentPhoto])

  function resolvePreviewSource(photo?: PhotoItem) {
    if (!photo) return null
    if (photo.previewUrl) return photo.previewUrl
    if (photo.remoteUrl) return photo.remoteUrl
    return null
  }

  function showToast(text: string, type: "success" | "error" = "success") {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2000)
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, 10)
    if (!files.length) return
    setStatus("uploading")
    setError(null)

    try {
      const uploaded: PhotoItem[] = []
      for (const file of files) {
        const photoId = crypto.randomUUID()
        const previewUrl = URL.createObjectURL(file)
        const remoteUrl = await uploadViaPresignedUrl(file).catch(() => previewUrl)

        uploaded.push({
          id: photoId,
          fileName: file.name,
          previewUrl,
          remoteUrl,
          people: [],
          timePrecision: 'fuzzy',
          scene: { tags: [] },
        })
      }

      setPhotos((prev) => [...prev, ...uploaded])
      setSelectedPhotoId((prev) => prev ?? uploaded[0]?.id ?? null)
      setStatus("uploaded")
      setStep(2)
    } catch (e: any) {
      setError(e?.message ?? "上传失败，请重试")
      setStatus("idle")
    }
  }

  async function uploadViaPresignedUrl(file: File): Promise<string> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        return URL.createObjectURL(file)
      }

      const urlResponse = await fetch('/api/photos/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type
        })
      })

      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL')
      }

      const { uploadUrl, fileUrl } = await urlResponse.json()

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'x-upsert': 'false'
        }
      })

      return fileUrl
    } catch (e) {
      console.warn('Upload failed, using local preview', e)
      return URL.createObjectURL(file)
    }
  }

  // Question selection
  function setLinkedQuestion(questionId: string) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => (p.id === currentPhoto.id ? { ...p, linkedQuestionId: questionId } : p))
    )
  }

  // People management
  function addPersonToCurrent(person: Person) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== currentPhoto.id) return p
        const exists = p.people.some((i) => i.id === person.id)
        return exists ? p : { ...p, people: [...p.people, person] }
      })
    )
  }

  function addPersonById(personId: string) {
    const person = peopleRoster.find((p) => p.id === personId)
    if (person) addPersonToCurrent(person)
  }

  function syncPersonUpdates(personId: string, updates: Partial<Person>) {
    setPhotos((prev) =>
      prev.map((p) => ({
        ...p,
        people: p.people.map((i) => (i.id === personId ? { ...i, ...updates } : i)),
      }))
    )
  }

  function removePerson(personId: string) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => (p.id === currentPhoto.id ? { ...p, people: p.people.filter((i) => i.id !== personId) } : p))
    )
  }

  function createPerson(name: string, relation?: string) {
    const person: Person = { id: crypto.randomUUID(), name, relation }
    setPeopleRoster((prev) => [...prev, person])
    addPersonToCurrent(person)
  }

  function updatePerson(personId: string, updates: Partial<Person>) {
    setPeopleRoster((prev) => prev.map((p) => (p.id === personId ? { ...p, ...updates } : p)))
    syncPersonUpdates(personId, updates)
  }

  function deletePerson(personId: string) {
    setPeopleRoster((prev) => prev.filter((p) => p.id !== personId))
    setPhotos((prev) => prev.map((p) => ({ ...p, people: p.people.filter((i) => i.id !== personId) })))
  }

  function markUnknown() {
    addPersonToCurrent({ id: crypto.randomUUID(), name: "未知人物", isUnknown: true })
  }

  // Time/Place/Caption updates
  function updatePhotoField<K extends keyof PhotoItem>(field: K, value: PhotoItem[K]) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => (p.id === currentPhoto.id ? { ...p, [field]: value } : p))
    )
  }

  async function createPlace(name: string) {
    if (!name.trim()) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        showToast("请先登录", "error")
        return
      }

      // Get user's project
      const { data: project } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', session.user.id)
        .single()

      if (!project) {
        showToast("未找到项目", "error")
        return
      }

      const { data: newPlace, error } = await supabase
        .from('places')
        .insert({ name: name.trim(), project_id: project.id })
        .select()
        .single()

      if (error) throw error
      if (newPlace) {
        setPlaces((prev) => [...prev, newPlace])
        updatePhotoField('placeId', newPlace.id)
        updatePhotoField('placeName', newPlace.name)
        setNewPlaceName("")
        showToast("地点已创建", "success")
      }
    } catch (e: any) {
      showToast(e?.message || "创建地点失败", "error")
    }
  }

  function updateScene(partial: Partial<PhotoItem["scene"]>) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => (p.id === currentPhoto.id ? { ...p, scene: { ...p.scene, ...partial } } : p))
    )
  }

  function toggleTag(tag: string) {
    if (!currentPhoto) return
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== currentPhoto.id) return p
        const has = p.scene.tags.includes(tag)
        return { ...p, scene: { ...p.scene, tags: has ? p.scene.tags.filter((t) => t !== tag) : [...p.scene.tags, tag] } }
      })
    )
  }

  function nextStep() {
    if (step === 5) return
    setStep((s) => (s + 1) as Step)
    if (step >= 2) setStatus("annotating")
  }

  function prevStep() {
    if (step === 1) return
    setStep((s) => (s - 1) as Step)
  }

  function resetFlow() {
    setStep(1)
    setPhotos([])
    setSelectedPhotoId(null)
    setStatus("idle")
    setError(null)
  }

  async function saveAll() {
    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        const payload = { savedAt: new Date().toISOString(), photos, roster: peopleRoster }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload))
        }
        setLastSavedAt(payload.savedAt)
        showToast("本地已保存（未登录），登录后可同步到云端", "success")
        return
      }

      const response = await fetch('/api/photos/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ photos, roster: peopleRoster })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Save failed:', response.status, errorText)
        throw new Error(`保存失败 (${response.status}): ${errorText}`)
      }

      const result = await response.json()

      // Clear local cache after successful save
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LOCAL_PHOTOS_KEY)
        window.localStorage.removeItem(LOCAL_SAVE_KEY)
      }

      showToast(`已保存 ${result.savedCount}/${result.totalCount} 张照片到云端`, "success")

      // Redirect to photos page after a short delay
      setTimeout(() => {
        router.push('/photos')
      }, 1500)
    } catch (e: any) {
      console.error('Save error:', e)
      showToast(e?.message || "保存失败，请稍后重试", "error")
    }
  }

  function clearCacheAndReset() {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LOCAL_PHOTOS_KEY)
        window.localStorage.removeItem(LOCAL_ROSTER_KEY)
        window.localStorage.removeItem(LOCAL_SAVE_KEY)
      }
      resetFlow()
      setPeopleRoster(EXISTING_PEOPLE)
      setLastSavedAt(null)
      showToast("本地缓存已清除", "success")
    } catch (e) {
      showToast("清除失败", "error")
    }
  }

  const timePrecisionOptions = [
    { value: 'exact', label: '精确日期' },
    { value: 'month', label: '精确到月' },
    { value: 'year', label: '精确到年' },
    { value: 'range', label: '时间范围' },
    { value: 'fuzzy', label: '模糊记忆' },
  ]

  const sceneSuggestionTags = ["家庭聚会", "旅行", "毕业", "婚礼", "日常", "工作", "童年"]

  // Group questions by category
  const questionsByCategory = useMemo(() => {
    const grouped: Record<string, Question[]> = {}
    questions.forEach(q => {
      const cat = q.category || '其他'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(q)
    })
    return grouped
  }, [questions])

  return (
    <main style={styles.page}>
      <style>{cssHelpers}</style>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.kicker}>Photos • 5字段标注系统</div>
          <h1 style={styles.title}>上传照片并完成5字段标注</h1>
          <p style={styles.subtitle}>每张照片需要：问题关联 + 人物标记 + 拍摄时间 + 拍摄地点 + 描述说明</p>
          {lastSavedAt && (
            <div style={{ color: "#9fb6cc", fontSize: 12, marginTop: 6 }}>上次保存：{new Date(lastSavedAt).toLocaleString()}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={styles.stepper}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  ...styles.stepDot,
                  opacity: step >= i ? 1 : 0.35,
                  background: step === i ? "linear-gradient(135deg,#f5d9b8,#efe6dd)" : "#f1e9e0",
                  color: step === i ? "#2C2C2C" : "#6B6B6B",
                }}
              >
                {i}
              </div>
            ))}
          </div>
          <button style={styles.ghostBtn} onClick={clearCacheAndReset}>清除本地缓存</button>
        </div>
      </div>

      {toast && (
        <div style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          padding: "12px 14px",
          borderRadius: 12,
          background: toast.type === "success" ? "rgba(53,242,255,0.12)" : "rgba(255,68,102,0.12)",
          border: toast.type === "success" ? "1px solid rgba(53,242,255,0.4)" : "1px solid rgba(255,68,102,0.4)",
          color: "#e5ecf5",
          boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
          zIndex: 20,
        }}>
          {toast.text}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.layout}>
        <div style={styles.leftPanel}>
          {/* Step 1: Upload */}
          {step === 1 && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 1 · 上传照片</div>
              <p style={styles.cardHint}>支持拖拽、点击、粘贴，最多 10 张。上传后进入标记流程。</p>
              <div
                style={styles.dropzone}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFiles(e.dataTransfer.files)
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div style={styles.dropIcon}>⬆</div>
                <div style={{ fontWeight: 700 }}>拖拽 / 点击 / 粘贴上传</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>支持 1-10 张，自动进入标记</div>
              </div>
            </div>
          )}

          {/* Step 2: Select Question */}
          {step === 2 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 2 · 关联问题 <span style={styles.required}>*必填</span></div>
              <p style={styles.cardHint}>选择这张照片回答的是哪个人生问题，便于后续自动插入自传。</p>

              {currentPhoto.linkedQuestionId && (
                <div style={styles.selectedBadge}>
                  已选择: {questions.find(q => q.id === currentPhoto.linkedQuestionId)?.question_text || currentPhoto.linkedQuestionId}
                </div>
              )}

              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {Object.entries(questionsByCategory).map(([category, categoryQuestions]) => (
                  <div key={category} style={{ marginBottom: 16 }}>
                    <div style={styles.sectionLabel}>{category}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {categoryQuestions.map((q) => (
                        <button
                          key={q.id}
                          style={{
                            ...styles.questionItem,
                            background: currentPhoto.linkedQuestionId === q.id ? 'linear-gradient(135deg, rgba(245,217,184,0.6), rgba(239,230,221,0.6))' : '#fff',
                            borderColor: currentPhoto.linkedQuestionId === q.id ? 'rgba(139,115,85,0.3)' : '#E8E4DE',
                          }}
                          onClick={() => setLinkedQuestion(q.id)}
                        >
                          {q.question_text}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {questions.length === 0 && (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>
                    暂无问题，请先在问题库中添加问题
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Mark People */}
          {step === 3 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 3 · 标记人物 <span style={styles.required}>*必填</span></div>
              <p style={styles.cardHint}>选择已有联系人、添加新人物或标记为"未知"。</p>

              <div style={styles.chipRow}>
                {currentPhoto.people.map((p) => (
                  <button key={p.id} style={styles.chipActive} onClick={() => removePerson(p.id)}>
                    {p.name} {p.relation ? `· ${p.relation}` : ""}
                    <span style={{ marginLeft: 8, opacity: 0.8 }}>×</span>
                  </button>
                ))}
                {!currentPhoto.people.length && <span style={{ opacity: 0.6, fontSize: 12 }}>暂无标记</span>}
              </div>

              <div style={styles.sectionLabel}>从已有联系人选择</div>
              <div style={styles.chipRow}>
                {peopleRoster.map((p) => (
                  <button key={p.id} style={styles.chip} onClick={() => addPersonById(p.id)}>
                    {p.name} {p.relation ? `· ${p.relation}` : ""}
                  </button>
                ))}
              </div>

              <div style={styles.sectionLabel}>添加新人物</div>
              <PersonForm onCreate={createPerson} />

              <div style={{ ...styles.personManager, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>已保存的角色</div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>可编辑名称/关系</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {peopleRoster.map((p) => (
                    <PersonEditor
                      key={p.id}
                      person={p}
                      onApply={() => addPersonById(p.id)}
                      onSave={(updates) => updatePerson(p.id, updates)}
                      onDelete={() => deletePerson(p.id)}
                    />
                  ))}
                  {!peopleRoster.length && <div style={{ color: "#94a3b8", fontSize: 12 }}>暂无角色，先添加一个吧。</div>}
                </div>
              </div>

              <div style={styles.sectionLabel}>未知人物</div>
              <button style={styles.chipGhost} onClick={markUnknown}>未知 / 路人</button>
            </div>
          )}

          {/* Step 4: Time/Place/Caption */}
          {step === 4 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 4 · 时间/地点/描述 <span style={styles.required}>*必填</span></div>
              <p style={styles.cardHint}>补充拍摄时间、地点和照片描述。</p>

              <div style={styles.fieldGrid}>
                <LabeledInput
                  label="拍摄时间 *"
                  type="date"
                  value={currentPhoto.timeTaken ?? ""}
                  onChange={(v) => updatePhotoField('timeTaken', v)}
                />
                <label style={styles.fieldLabel}>
                  <div style={styles.sectionLabel}>时间精度</div>
                  <select
                    value={currentPhoto.timePrecision}
                    onChange={(e) => updatePhotoField('timePrecision', e.target.value as any)}
                    style={styles.input}
                  >
                    {timePrecisionOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={styles.sectionLabel}>拍摄地点 *</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {places.map((place) => (
                  <button
                    key={place.id}
                    style={{
                      ...styles.chip,
                      background: currentPhoto.placeId === place.id ? 'linear-gradient(135deg, rgba(245,217,184,0.6), rgba(239,230,221,0.6))' : '#fff',
                      borderColor: currentPhoto.placeId === place.id ? 'rgba(139,115,85,0.3)' : '#E8E4DE',
                    }}
                    onClick={() => {
                      updatePhotoField('placeId', place.id)
                      updatePhotoField('placeName', place.name)
                    }}
                  >
                    {place.name}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder="添加新地点..."
                  style={{ ...styles.input, flex: 1 }}
                />
                <button style={styles.primaryBtn} onClick={() => createPlace(newPlaceName)}>添加</button>
              </div>

              <LabeledTextArea
                label="照片描述 *"
                value={currentPhoto.caption ?? ""}
                onChange={(v) => updatePhotoField('caption', v)}
                placeholder="描述这张照片的内容、故事或情感..."
              />

              <div style={styles.sectionLabel}>标签（可选）</div>
              <div style={styles.chipRow}>
                {sceneSuggestionTags.map((tag) => (
                  <button key={tag} style={currentPhoto.scene.tags.includes(tag) ? styles.chipActive : styles.chip} onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 5 && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 5 · 确认并保存</div>
              <p style={styles.cardHint}>查看每张照片的5字段标注完成情况。</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {photos.map((p) => {
                  const missing: string[] = []
                  if (!p.linkedQuestionId) missing.push('问题')
                  if (!p.people.length) missing.push('人物')
                  if (!p.timeTaken) missing.push('时间')
                  if (!p.placeId) missing.push('地点')
                  if (!p.caption?.trim()) missing.push('描述')
                  const isComplete = missing.length === 0
                  const percentage = ((5 - missing.length) / 5 * 100).toFixed(0)

                  return (
                    <div key={p.id} style={styles.reviewItem}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                        <div style={styles.reviewThumb}>
                          <img src={p.previewUrl} alt={p.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                            {p.fileName}
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              background: isComplete ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                              color: isComplete ? '#16a34a' : '#ca8a04',
                            }}>
                              {percentage}%
                            </span>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>问题：{questions.find(q => q.id === p.linkedQuestionId)?.question_text?.slice(0, 20) || '未选择'}...</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>人物：{p.people.map((i) => i.name).join("，") || "未标记"}</div>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>时间：{p.timeTaken || "未填写"} | 地点：{p.placeName || "未选择"}</div>
                          {!isComplete && (
                            <div style={{ fontSize: 11, color: '#ca8a04', marginTop: 4 }}>缺少：{missing.join('、')}</div>
                          )}
                        </div>
                      </div>
                      <button style={styles.linkBtn} onClick={() => { setSelectedPhotoId(p.id); setStep(2) }}>修改</button>
                    </div>
                  )
                })}
              </div>
              <button style={styles.primaryBtn} onClick={saveAll}>保存并返回</button>
            </div>
          )}
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.previewShell}>
            {photos.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center" }}>上传后将在此预览</div>
            ) : (
              currentPhoto && (
                <>
                  <div style={styles.previewImageWrap}>
                    <div style={styles.previewFrame}>
                      {resolvePreviewSource(currentPhoto) ? (
                        <img
                          src={resolvePreviewSource(currentPhoto) as string}
                          alt={currentPhoto.fileName}
                          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 16 }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 12 }}>
                          预览不可用，请重新上传
                        </div>
                      )}
                      <div style={styles.previewBadge}>{status === "uploading" ? "UPLOADING" : "ANNOTATING"}</div>
                      <div style={styles.previewInfoBar}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{currentPhoto.fileName || '未命名照片'}</div>
                          <div style={{ fontSize: 12, color: '#9fb6cc' }}>Step {step}/5</div>
                        </div>
                        <div style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          background: completionStatus.complete ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                          color: completionStatus.complete ? '#16a34a' : '#ca8a04',
                        }}>
                          {completionStatus.complete ? '标注完成' : `缺少: ${completionStatus.missing.join('、')}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={styles.thumbnailRow}>
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        style={{
                          ...styles.thumbButton,
                          outline: p.id === currentPhoto.id ? "2px solid #35f2ff" : "1px solid rgba(255,255,255,0.08)",
                          boxShadow: p.id === currentPhoto.id ? "0 0 0 6px rgba(53,242,255,0.08)" : "none",
                        }}
                        onClick={() => setSelectedPhotoId(p.id)}
                      >
                        {resolvePreviewSource(p) ? (
                          <img src={resolvePreviewSource(p) as string} alt={p.fileName} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 10 }}>无预览</div>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )
            )}
          </div>

          <div style={styles.footerBar}>
            <div style={{ display: "flex", gap: 10 }}>
              <button style={styles.ghostBtn} disabled={step === 1} onClick={prevStep}>← 上一步</button>
              <button style={styles.primaryBtn} disabled={!canContinue} onClick={step === 5 ? saveAll : nextStep}>
                {step === 5 ? "保存" : "下一步"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>进度：Step {step}/5</div>
          </div>
        </div>
      </div>
    </main>
  )
}

// Reusable UI
function LabeledInput({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label style={styles.fieldLabel}>
      <div style={styles.sectionLabel}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
      />
    </label>
  )
}

function LabeledTextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={styles.fieldLabel}>
      <div style={styles.sectionLabel}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ ...styles.input, height: 110, resize: "vertical" }}
      />
    </label>
  )
}

function PersonForm({ onCreate }: { onCreate: (name: string, relation?: string) => void }) {
  const [name, setName] = useState("")
  const [relation, setRelation] = useState("")

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="姓名"
        style={{ ...styles.input, flex: 1, minWidth: 160 }}
      />
      <input
        value={relation}
        onChange={(e) => setRelation(e.target.value)}
        placeholder="关系（可选）"
        style={{ ...styles.input, flex: 1, minWidth: 160 }}
      />
      <button
        style={styles.primaryBtn}
        onClick={() => {
          if (!name.trim()) return
          onCreate(name.trim(), relation.trim() || undefined)
          setName("")
          setRelation("")
        }}
      >
        添加
      </button>
    </div>
  )
}

function PersonEditor({ person, onApply, onSave, onDelete }: {
  person: Person
  onApply: () => void
  onSave: (updates: Partial<Person>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(person.name)
  const [relation, setRelation] = useState(person.relation ?? "")

  useEffect(() => {
    setName(person.name)
    setRelation(person.relation ?? "")
  }, [person])

  return (
    <div style={styles.personRow}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flex: 1 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="姓名"
          style={{ ...styles.input, minWidth: 0 }}
        />
        <input
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="关系"
          style={{ ...styles.input, minWidth: 0 }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={styles.smallBtn} onClick={() => onSave({ name: name.trim(), relation: relation.trim() || undefined })}>保存</button>
        <button style={styles.smallBtn} onClick={onApply}>加入当前照片</button>
        <button style={styles.dangerBtn} onClick={onDelete}>删除</button>
      </div>
    </div>
  )
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#FDFCFA",
    color: "#2C2C2C",
    padding: "32px 24px 48px",
    fontFamily: "'Microsoft YaHei', 'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#8B7355",
  },
  title: {
    margin: "6px 0",
    fontSize: 26,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: "#6B6B6B",
    maxWidth: 640,
    lineHeight: 1.5,
  },
  stepper: {
    display: "flex",
    gap: 10,
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    color: "#2C2C2C",
    border: "1px solid rgba(0,0,0,0.06)",
    background: "#f1e9e0",
  },
  required: {
    fontSize: 11,
    color: '#dc2626',
    fontWeight: 400,
    marginLeft: 6,
  },
  selectedBadge: {
    padding: '10px 14px',
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(245,217,184,0.4), rgba(239,230,221,0.4))',
    border: '1px solid rgba(139,115,85,0.2)',
    marginBottom: 12,
    fontSize: 13,
  },
  questionItem: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #E8E4DE',
    background: '#fff',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1.4,
    transition: 'all 0.15s',
  },
  error: {
    background: "rgba(220,38,38,0.08)",
    border: "1px solid rgba(220,38,38,0.15)",
    color: "#8b1d1d",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "420px 1fr",
    gap: 16,
  },
  leftPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  rightPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  card: {
    background: "#fff",
    border: "1px solid #E8E4DE",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 8px 18px rgba(11,12,15,0.06)",
  },
  cardHeader: {
    fontWeight: 800,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  cardHint: {
    margin: "0 0 10px",
    color: "#6B6B6B",
    fontSize: 13,
  },
  dropzone: {
    border: "1px dashed #E8E4DE",
    borderRadius: 14,
    padding: "30px 16px",
    textAlign: "center",
    color: "#2C2C2C",
    background: "#FAF8F5",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    margin: "0 auto 8px",
    background: "linear-gradient(135deg,#f5d9b8,#efe6dd)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    color: "#2C2C2C",
    boxShadow: "0 8px 20px rgba(139,115,85,0.08)",
  },
  chipRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 10,
  },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid #EEE",
    background: "#fff",
    color: "#2C2C2C",
    cursor: "pointer",
    fontSize: 12,
  },
  chipActive: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(139,115,85,0.18)",
    background: "linear-gradient(135deg, rgba(245,217,184,0.6), rgba(239,230,221,0.6))",
    color: "#2C2C2C",
    cursor: "pointer",
    fontSize: 12,
    boxShadow: "0 8px 20px rgba(139,115,85,0.06)",
  },
  chipGhost: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px dashed #ccc",
    background: "transparent",
    color: "#6B6B6B",
    cursor: "pointer",
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#8B7355",
    marginBottom: 6,
  },
  fieldGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
    gap: 10,
    marginBottom: 10,
  },
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    width: "100%",
    background: "#fff",
    border: "1px solid #E8E4DE",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#2C2C2C",
    fontSize: 13,
    outline: "none",
  },
  previewShell: {
    background: "#fff",
    border: "1px solid #E8E4DE",
    borderRadius: 20,
    padding: 16,
    minHeight: 460,
    boxShadow: "0 10px 30px rgba(11,12,15,0.06)",
  },
  previewImageWrap: {
    position: "relative",
    width: "100%",
    height: 360,
    overflow: "hidden",
    borderRadius: 18,
    background: "#FAF8F5",
    padding: 6,
    boxSizing: "border-box",
  },
  previewFrame: {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 14,
    overflow: "hidden",
    background: "#fff",
    border: "1px solid #EEE",
  },
  previewBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    padding: "6px 10px",
    borderRadius: 12,
    background: "#fff",
    border: "1px solid #E8E4DE",
    color: "#8B7355",
    fontSize: 12,
    letterSpacing: 1,
    boxShadow: "0 8px 20px rgba(11,12,15,0.06)",
  },
  previewInfoBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.95)",
    color: "#2C2C2C",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderTop: "1px solid #EEE",
  },
  thumbnailRow: {
    display: "flex",
    gap: 10,
    marginTop: 12,
    overflowX: "auto",
    paddingBottom: 4,
  },
  thumbButton: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  },
  footerBar: {
    marginTop: 12,
    padding: "14px 16px",
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #E8E4DE",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ghostBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #E8E4DE",
    background: "transparent",
    color: "#2C2C2C",
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "12px 18px",
    borderRadius: 10,
    background: "linear-gradient(135deg, #f5d9b8, #efe6dd)",
    color: "#2C2C2C",
    fontWeight: 800,
    letterSpacing: 0.5,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(139,115,85,0.08)",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#8B7355",
    cursor: "pointer",
    fontSize: 12,
  },
  personManager: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #E8E4DE",
    background: "#fff",
  },
  personRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
    border: "1px solid #E8E4DE",
    borderRadius: 10,
    padding: 10,
    background: "#FAF8F5",
  },
  smallBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(139,115,85,0.12)",
    background: "linear-gradient(135deg, rgba(139,115,85,0.08), rgba(139,115,85,0.04))",
    color: "#2C2C2C",
    fontSize: 12,
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,68,102,0.3)",
    background: "rgba(255,68,102,0.06)",
    color: "#9b1f2b",
    fontSize: 12,
    cursor: "pointer",
  },
  reviewItem: {
    border: "1px solid #E8E4DE",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "#fff",
  },
  reviewThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #EEE",
    flexShrink: 0,
  },
}

const cssHelpers = `
  .glass-card { background: #fff; border: 1px solid #E8E4DE; border-radius: 16px; box-shadow: 0 8px 18px rgba(11,12,15,0.06); }
  .glass-card input::placeholder, .glass-card textarea::placeholder { color: #9aa0a6; }
`
