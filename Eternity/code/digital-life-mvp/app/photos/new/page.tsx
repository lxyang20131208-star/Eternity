"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
  people: Person[]
  scene: {
    location?: string
    date?: string
    event?: string
    tags: string[]
    notes?: string
  }
}

type Step = 1 | 2 | 3 | 4

// Mock existing contacts; in real app fetch from backend
const LOCAL_ROSTER_KEY = "photoFlow.peopleRoster"
const LOCAL_PHOTOS_KEY = "photoFlow.photos"
const LOCAL_SAVE_KEY = "photoFlow.lastSaved"

// Start with empty roster - users will create people with proper UUIDs
const EXISTING_PEOPLE: Person[] = []

// UUID validation helper
const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export default function NewPhotoFlow() {
  const [step, setStep] = useState<Step>(1)
  const [status, setStatus] = useState<"idle" | "uploading" | "uploaded" | "annotating">("idle")
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [peopleRoster, setPeopleRoster] = useState<Person[]>(EXISTING_PEOPLE)
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const hasHydratedRoster = useRef(false)
  const hasHydratedPhotos = useRef(false)

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
          // Filter out any people with invalid UUIDs (legacy data cleanup)
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

  // Load photo annotations from backend on mount
  useEffect(() => {
    if (hasHydratedPhotos.current) return
    hasHydratedPhotos.current = true
    
    async function loadFromBackend() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          // Try localStorage fallback
          loadFromLocalStorage()
          return
        }

        const response = await fetch('/api/photos/save', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (response.ok) {
          const { photos: loadedPhotos, roster: loadedRoster } = await response.json()
          if (loadedPhotos?.length) {
            setPhotos(loadedPhotos)
            setSelectedPhotoId(loadedPhotos[0].id)
            setStep(2)
          }
          if (loadedRoster?.length) {
            setPeopleRoster(loadedRoster)
          }
        } else {
          loadFromLocalStorage()
        }
      } catch (e) {
        console.warn("Backend load failed, trying localStorage", e)
        loadFromLocalStorage()
      }
    }

    function loadFromLocalStorage() {
      if (typeof window === "undefined") return
      try {
        const raw = window.localStorage.getItem(LOCAL_PHOTOS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as PhotoItem[]
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((p) => {
              const preview = p.previewUrl || p.remoteUrl
              if (!preview) return false
              return !preview.startsWith("blob:")
            })
            const normalized = filtered.map((p) => ({
              ...p,
              previewUrl: p.previewUrl || p.remoteUrl || "",
            }))
            if (normalized.length) {
              setPhotos(normalized)
              setSelectedPhotoId(normalized[0].id)
              setStep(2)
            }
          }
        }
      } catch (e) {
        console.warn("Photo restore failed", e)
      }
    }

    loadFromBackend()
  }, [])

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

        // In production: request presigned URL then PUT the file.
        // Here: simulate remote URL using preview for demo purposes.
        const remoteUrl = await uploadViaPresignedUrl(file).catch(() => previewUrl)

        uploaded.push({
          id: photoId,
          fileName: file.name,
          previewUrl,
          remoteUrl,
          people: [],
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
        // Fallback to local preview if not logged in
        return URL.createObjectURL(file)
      }

      // Get presigned upload URL from backend
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

      // Upload file to Supabase Storage
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
    if (step === 4) return
    setStep((s) => (s + 1) as Step)
    if (step === 2 || step === 3) setStatus("annotating")
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
        // Fallback to localStorage if not logged in
        const payload = { savedAt: new Date().toISOString(), photos, roster: peopleRoster }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload))
        }
        setLastSavedAt(payload.savedAt)
        showToast("本地已保存（未登录），登录后可同步到云端", "success")
        return
      }

      // Save to backend
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
      const savedAt = new Date().toISOString()
      setLastSavedAt(savedAt)
      
      // Also save to localStorage as backup
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify({ savedAt, photos, roster: peopleRoster }))
      }
      
      showToast(`已保存 ${result.savedCount}/${result.totalCount} 张照片到云端`, "success")
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

  const sceneSuggestionTags = ["家庭聚会", "旅行", "毕业", "婚礼", "日常", "工作", "童年"]

  return (
    <main style={styles.page}>
      <style>{cssHelpers}</style>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.kicker}>Photos • Structured Memory</div>
          <h1 style={styles.title}>上传照片并标记人物 / 场景</h1>
          <p style={styles.subtitle}>逐步完成上传、人物标记、场景标记，让照片成为可查询的记忆节点。</p>
          {lastSavedAt && (
            <div style={{ color: "#9fb6cc", fontSize: 12, marginTop: 6 }}>上次保存：{new Date(lastSavedAt).toLocaleString()}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={styles.stepper}>
            {[1, 2, 3, 4].map((i) => (
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

          {step === 2 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 2 · 标记人物</div>
              <p style={styles.cardHint}>选择已有联系人、添加新人物或标记为“未知”。</p>

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
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>可编辑名称/关系，应用到当前照片</div>
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

          {step === 3 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 3 · 场景标记</div>
              <p style={styles.cardHint}>补充地点、时间、事件与标签，便于后续检索。</p>

              <div style={styles.fieldGrid}>
                <LabeledInput label="地点" value={currentPhoto.scene.location ?? ""} onChange={(v) => updateScene({ location: v })} placeholder="如：上海徐家汇公园" />
                <LabeledInput label="日期" type="date" value={currentPhoto.scene.date ?? ""} onChange={(v) => updateScene({ date: v })} />
                <LabeledInput label="事件 / 场景" value={currentPhoto.scene.event ?? ""} onChange={(v) => updateScene({ event: v })} placeholder="如：家庭聚会 / 毕业" />
              </div>

              <div style={styles.sectionLabel}>标签</div>
              <div style={styles.chipRow}>
                {sceneSuggestionTags.map((tag) => (
                  <button key={tag} style={currentPhoto.scene.tags.includes(tag) ? styles.chipActive : styles.chip} onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>

              <LabeledTextArea
                label="补充描述"
                value={currentPhoto.scene.notes ?? ""}
                onChange={(v) => updateScene({ notes: v })}
                placeholder="写下这张照片的故事、氛围或细节。"
              />
            </div>
          )}

          {step === 4 && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 4 · 确认并保存</div>
              <p style={styles.cardHint}>查看每张照片的标记，确认无误后保存。</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {photos.map((p) => (
                  <div key={p.id} style={styles.reviewItem}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={styles.reviewThumb}>
                        <img src={p.previewUrl} alt={p.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.fileName}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>人物：{p.people.map((i) => i.name).join("，") || "未标记"}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>场景：{p.scene.event || p.scene.location || p.scene.date || "未填写"}</div>
                      </div>
                    </div>
                    <button style={styles.linkBtn} onClick={() => { setSelectedPhotoId(p.id); setStep(2) }}>修改</button>
                  </div>
                ))}
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
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{currentPhoto.fileName || '未命名照片'}</div>
                        <div style={{ fontSize: 12, color: '#9fb6cc' }}>Step {step}/4 · 可继续标记人物与场景</div>
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
              <button style={styles.primaryBtn} disabled={!canContinue} onClick={step === 4 ? saveAll : nextStep}>
                {step === 4 ? "保存" : "下一步"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>进度：Step {step}/4</div>
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
    border: "1px dashed rgba(255,255,255,0.25)",
    background: "transparent",
    color: "#e5ecf5",
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
    color: "#67e8f9",
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
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: 10,
    background: "rgba(255,255,255,0.02)",
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
  },
}

const cssHelpers = `
  .glass-card { background: #fff; border: 1px solid #E8E4DE; border-radius: 16px; box-shadow: 0 8px 18px rgba(11,12,15,0.06); }
  .glass-card input::placeholder, .glass-card textarea::placeholder { color: #9aa0a6; }
`
