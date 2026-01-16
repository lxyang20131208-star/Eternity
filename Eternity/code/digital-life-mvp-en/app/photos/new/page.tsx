"use client"

import { useEffect, useMemo, useRef, useState } from "react"

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

const EXISTING_PEOPLE: Person[] = [
  { id: "p1", name: "Father", relation: "Father" },
  { id: "p2", name: "Mother", relation: "Mother" },
  { id: "p3", name: "Alex", relation: "Friend" },
]

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
          setPeopleRoster(parsed)
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

  // Load photo annotations from localStorage (ignore blob previews)
  useEffect(() => {
    if (hasHydratedPhotos.current) return
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
    } finally {
      hasHydratedPhotos.current = true
    }
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
      setError(e?.message ?? "Upload failed, please try again")
      setStatus("idle")
    }
  }

  async function uploadViaPresignedUrl(file: File): Promise<string> {
    // Placeholder: call your API to get { uploadUrl, fileUrl }
    // const presign = await fetch("/api/upload-url", { method: "POST", body: JSON.stringify({ filename: file.name, type: file.type }) })
    // const { uploadUrl, fileUrl } = await presign.json()
    // await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })
    await new Promise((r) => setTimeout(r, 400))
    return URL.createObjectURL(file)
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
    addPersonToCurrent({ id: crypto.randomUUID(), name: "Unknown person", isUnknown: true })
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
      // Future: POST to backend endpoint
      // await fetch('/api/photos/save', { method: 'POST', body: JSON.stringify({ photos, roster: peopleRoster }) })
      const payload = { savedAt: new Date().toISOString(), photos, roster: peopleRoster }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload))
      }
      setLastSavedAt(payload.savedAt)
      showToast("Saved locally, can continue later", "success")
    } catch (e: any) {
      showToast(e?.message || "Save failed", "error")
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
      showToast("Local cache cleared", "success")
    } catch (e) {
      showToast("Clear failed", "error")
    }
  }

  const sceneSuggestionTags = ["Family gathering", "Travel", "Graduation", "Wedding", "Daily life", "Work", "Childhood"]

  return (
    <main style={styles.page}>
      <style>{cssHelpers}</style>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.kicker}>Photos • Structured Memory</div>
          <h1 style={styles.title}>Upload Photos and Tag People / Scenes</h1>
          <p style={styles.subtitle}>Complete upload, people tagging, scene tagging step by step to make photos searchable memory nodes.</p>
          {lastSavedAt && (
            <div style={{ color: "#9fb6cc", fontSize: 12, marginTop: 6 }}>Last saved: {new Date(lastSavedAt).toLocaleString()}</div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={styles.stepper}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ ...styles.stepDot, opacity: step >= i ? 1 : 0.35, background: step === i ? "linear-gradient(135deg,#35f2ff,#7c3aed)" : "#1f2a3d" }}>
                {i}
              </div>
            ))}
          </div>
          <button style={styles.ghostBtn} onClick={clearCacheAndReset}>Clear local cache</button>
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
              <div style={styles.cardHeader}>Step 1: Upload Photos</div>
              <p style={styles.cardHint}>Supports drag, click, paste. Max 10 photos. Enter tagging flow after upload.</p>
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
                <div style={{ fontWeight: 700 }}>Drag / Click / Paste to upload</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Supports 1-10 photos, auto-enter tagging</div>
              </div>
            </div>
          )}

          {step === 2 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 2: Tag People</div>
              <p style={styles.cardHint}>Select existing contacts, add new person, or mark as Unknown.</p>

              <div style={styles.chipRow}>
                {currentPhoto.people.map((p) => (
                  <button key={p.id} style={styles.chipActive} onClick={() => removePerson(p.id)}>
                    {p.name} {p.relation ? `· ${p.relation}` : ""}
                    <span style={{ marginLeft: 8, opacity: 0.8 }}>×</span>
                  </button>
                ))}
                {!currentPhoto.people.length && <span style={{ opacity: 0.6, fontSize: 12 }}>No tags yet</span>}
              </div>

              <div style={styles.sectionLabel}>Select from existing contacts</div>
              <div style={styles.chipRow}>
                {peopleRoster.map((p) => (
                  <button key={p.id} style={styles.chip} onClick={() => addPersonById(p.id)}>
                    {p.name} {p.relation ? `· ${p.relation}` : ""}
                  </button>
                ))}
              </div>

              <div style={styles.sectionLabel}>Add new person</div>
              <PersonForm onCreate={createPerson} />

              <div style={{ ...styles.personManager, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>Saved characters</div>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>Edit name/relationship, apply to current photo</div>
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
                  {!peopleRoster.length && <div style={{ color: "#94a3b8", fontSize: 12 }}>No characters yet. Add one first.</div>}
                </div>
              </div>

              <div style={styles.sectionLabel}>Unknown person</div>
              <button style={styles.chipGhost} onClick={markUnknown}>Unknown / Stranger</button>
            </div>
          )}

          {step === 3 && currentPhoto && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 3: Tag Scene</div>
              <p style={styles.cardHint}>Add location, time, event and tags for easier search.</p>

              <div style={styles.fieldGrid}>
                <LabeledInput label="Location" value={currentPhoto.scene.location ?? ""} onChange={(v) => updateScene({ location: v })} placeholder="e.g., Central Park, NYC" />
                <LabeledInput label="Date" type="date" value={currentPhoto.scene.date ?? ""} onChange={(v) => updateScene({ date: v })} />
                <LabeledInput label="Event / Scene" value={currentPhoto.scene.event ?? ""} onChange={(v) => updateScene({ event: v })} placeholder="e.g., Family gathering / Graduation" />
              </div>

              <div style={styles.sectionLabel}>Tags</div>
              <div style={styles.chipRow}>
                {sceneSuggestionTags.map((tag) => (
                  <button key={tag} style={currentPhoto.scene.tags.includes(tag) ? styles.chipActive : styles.chip} onClick={() => toggleTag(tag)}>
                    {tag}
                  </button>
                ))}
              </div>

              <LabeledTextArea
                label="Additional description"
                value={currentPhoto.scene.notes ?? ""}
                onChange={(v) => updateScene({ notes: v })}
                placeholder="Write the story, atmosphere or details of this photo."
              />
            </div>
          )}

          {step === 4 && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Step 4: Confirm and Save</div>
              <p style={styles.cardHint}>Review tags for each photo, then save.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {photos.map((p) => (
                  <div key={p.id} style={styles.reviewItem}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={styles.reviewThumb}>
                        <img src={p.previewUrl} alt={p.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p.fileName}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>People: {p.people.map((i) => i.name).join(", ") || "Not tagged"}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Scene: {p.scene.event || p.scene.location || p.scene.date || "Not filled"}</div>
                      </div>
                    </div>
                    <button style={styles.linkBtn} onClick={() => { setSelectedPhotoId(p.id); setStep(2) }}>Edit</button>
                  </div>
                ))}
              </div>
              <button style={styles.primaryBtn} onClick={saveAll}>Save and Return</button>
            </div>
          )}
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.previewShell}>
            {photos.length === 0 ? (
              <div style={{ color: "#94a3b8", textAlign: "center" }}>Preview will appear here after upload</div>
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
                          Preview unavailable, please re-upload
                        </div>
                      )}
                      <div style={styles.previewBadge}>{status === "uploading" ? "UPLOADING" : "ANNOTATING"}</div>
                      <div style={styles.previewInfoBar}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{currentPhoto.fileName || 'Unnamed photo'}</div>
                        <div style={{ fontSize: 12, color: '#9fb6cc' }}>Step {step}/4 · Can continue tagging people and scenes</div>
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
                          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 10 }}>No preview</div>
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
              <button style={styles.ghostBtn} disabled={step === 1} onClick={prevStep}>Previous</button>
              <button style={styles.primaryBtn} disabled={!canContinue} onClick={step === 4 ? saveAll : nextStep}>
                {step === 4 ? "Save" : "Next"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Progress: Step {step}/4</div>
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
        placeholder="Name"
        style={{ ...styles.input, flex: 1, minWidth: 160 }}
      />
      <input
        value={relation}
        onChange={(e) => setRelation(e.target.value)}
        placeholder="Relationship (optional)"
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
        Add
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
          placeholder="Name"
          style={{ ...styles.input, minWidth: 0 }}
        />
        <input
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder="Relationship"
          style={{ ...styles.input, minWidth: 0 }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button style={styles.smallBtn} onClick={() => onSave({ name: name.trim(), relation: relation.trim() || undefined })}>Save</button>
        <button style={styles.smallBtn} onClick={onApply}>Add to current photo</button>
        <button style={styles.dangerBtn} onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 20% 20%, rgba(53,242,255,0.15), transparent 25%), radial-gradient(circle at 80% 0%, rgba(124,58,237,0.18), transparent 28%), #0b1220",
    color: "#e5ecf5",
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
    color: "#67e8f9",
  },
  title: {
    margin: "6px 0",
    fontSize: 26,
    fontWeight: 800,
  },
  subtitle: {
    margin: 0,
    color: "#a5b4c5",
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
    color: "#e5ecf5",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  error: {
    background: "rgba(255,68,102,0.12)",
    border: "1px solid rgba(255,68,102,0.4)",
    color: "#ff99b0",
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
    background: "linear-gradient(145deg, rgba(17,24,39,0.85), rgba(27,40,61,0.9))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    backdropFilter: "blur(6px)",
  },
  cardHeader: {
    fontWeight: 800,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  cardHint: {
    margin: "0 0 10px",
    color: "#93adc6",
    fontSize: 13,
  },
  dropzone: {
    border: "1px dashed rgba(255,255,255,0.25)",
    borderRadius: 14,
    padding: "30px 16px",
    textAlign: "center",
    color: "#d9e3ee",
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  dropIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    margin: "0 auto 8px",
    background: "linear-gradient(135deg,#35f2ff,#7c3aed)",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    color: "#0b1220",
    boxShadow: "0 10px 30px rgba(124,58,237,0.25)",
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
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e5ecf5",
    cursor: "pointer",
    fontSize: 12,
  },
  chipActive: {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(53,242,255,0.6)",
    background: "linear-gradient(135deg, rgba(53,242,255,0.15), rgba(124,58,237,0.15))",
    color: "#e5ecf5",
    cursor: "pointer",
    fontSize: 12,
    boxShadow: "0 10px 30px rgba(53,242,255,0.2)",
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
    color: "#7dd3fc",
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
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#e5ecf5",
    fontSize: 13,
    outline: "none",
  },
  previewShell: {
    background: "linear-gradient(145deg, rgba(12,18,28,0.9), rgba(17,28,46,0.95))",
    border: "1px solid rgba(53,242,255,0.15)",
    borderRadius: 20,
    padding: 16,
    minHeight: 460,
    boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
  },
  previewImageWrap: {
    position: "relative",
    width: "100%",
    height: 360,
    overflow: "hidden",
    borderRadius: 18,
    background: "radial-gradient(circle at 20% 20%, rgba(53,242,255,0.08), transparent 30%), #0d1624",
    padding: 6,
    boxSizing: "border-box",
  },
  previewFrame: {
    position: "relative",
    width: "100%",
    height: "100%",
    borderRadius: 14,
    overflow: "hidden",
    background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.35))",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  previewBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    padding: "6px 10px",
    borderRadius: 12,
    background: "rgba(11, 18, 32, 0.85)",
    border: "1px solid rgba(53,242,255,0.35)",
    color: "#67e8f9",
    fontSize: 12,
    letterSpacing: 1,
    boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
  },
  previewInfoBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: "10px 14px",
    background: "linear-gradient(180deg, transparent 0%, rgba(6,12,20,0.8) 55%, rgba(6,12,20,0.95) 100%)",
    color: "#dce7f3",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    borderTop: "1px solid rgba(255,255,255,0.05)",
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
    background: "rgba(255,255,255,0.02)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ghostBtn: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.02)",
    color: "#cdd6e0",
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "12px 18px",
    borderRadius: 10,
    background: "linear-gradient(135deg, #35f2ff, #7c3aed)",
    color: "#0b1220",
    fontWeight: 800,
    letterSpacing: 0.5,
    border: "none",
    cursor: "pointer",
    boxShadow: "0 15px 35px rgba(124,58,237,0.35)",
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
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.02)",
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
    border: "1px solid rgba(103,232,249,0.5)",
    background: "linear-gradient(135deg, rgba(103,232,249,0.12), rgba(103,232,249,0.05))",
    color: "#e5ecf5",
    fontSize: 12,
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,68,102,0.5)",
    background: "rgba(255,68,102,0.08)",
    color: "#ff99b0",
    fontSize: 12,
    cursor: "pointer",
  },
  reviewItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "rgba(255,255,255,0.02)",
  },
  reviewThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
  },
}

const cssHelpers = `
  .glass-card { background: linear-gradient(145deg, rgba(17,24,39,0.85), rgba(27,40,61,0.9)); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.35); }
  .glass-card input::placeholder, .glass-card textarea::placeholder { color: #6b7a90; }
`


















