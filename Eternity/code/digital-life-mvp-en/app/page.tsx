'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import {
  generateBiographyOutline,
  getOutlineJobStatus,
  getOutlineById,
  listProjectOutlines,
  deleteOutline,
  outlineToMarkdown,
  copyToClipboard,
  AUTHOR_STYLES,
  type StylePrefs,
  type BiographyOutline,
  type OutlineJob,
  type OutlineJSON,
  type AuthorStyle,
} from '../lib/biographyOutlineApi'
import { FreeQuestionSection } from './components/free-questions'

function uuid() {
  return crypto.randomUUID()
}

// Custom Modal Component
function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          minWidth: 320,
          maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  )
}

// Confirm Dialog Component
function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
}: {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  title: string
  message: string
}) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          minWidth: 320,
          maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 500,
              background: '#f1f5f9',
              color: '#64748b',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// AudioPlayer component to handle loading and playing signed URLs
function AudioPlayer({ audioObjectKey }: { audioObjectKey: string }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAudio() {
      try {
        setLoading(true)
        const { data: signed, error } = await supabase.storage
          .from('vault')
          .createSignedUrl(audioObjectKey, 3600)

        if (error) throw error
        setAudioUrl(signed?.signedUrl ?? null)
      } catch (e) {
        console.error('Error loading audio:', e)
      } finally {
        setLoading(false)
      }
    }

    loadAudio()
  }, [audioObjectKey])

  if (loading) {
    return <div style={{ fontSize: 12, color: '#64748b' }}>Loading audio...</div>
  }

  if (!audioUrl) {
    return <div style={{ fontSize: 12, color: '#991b1b' }}>Failed to load audio</div>
  }

  return (
    <audio
      controls
      src={audioUrl}
      style={{
        width: '100%',
        height: 28,
      }}
    />
  )
}

export default function Home() {
  type QuestionRow = {
    id: string
    text: string
    chapter: string | null
    isCustom?: boolean
  }

  type AnswerSession = {
    id: string
    created_at: string
    audio_object_key: string
    transcript_text?: string | null
  }

  const MIN_ANSWERS_FOR_OUTLINE = 10

  const [status, setStatus] = useState<'idle' | 'recording' | 'stopped' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [answeredSet, setAnsweredSet] = useState<Set<string>>(new Set())
  const [answerHistory, setAnswerHistory] = useState<AnswerSession[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [openChapter, setOpenChapter] = useState<string | null>(null)

  // Modal states
  const [showAuthModal, setShowAuthModal] = useState<'signin' | 'signup' | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [toast, setToast] = useState<{text: string, type: 'success' | 'error'} | null>(null)
  
  // Interview-style states
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [editingTranscript, setEditingTranscript] = useState<string | null>(null)
  const [transcriptEdit, setTranscriptEdit] = useState('')
  const [confirmDeleteTranscript, setConfirmDeleteTranscript] = useState<string | null>(null)
  
  // Photo attachment states
  const [sessionPhotos, setSessionPhotos] = useState<{url: string, persons: string[]}[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoPersonTags, setPhotoPersonTags] = useState<string>('')
  
  // Collaboration states
  const [showCollaboratorModal, setShowCollaboratorModal] = useState(false)
  const [collaboratorEmail, setCollaboratorEmail] = useState('')
  const [collaboratorRole, setCollaboratorRole] = useState<'contributor' | 'viewer'>('viewer')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [answerComments, setAnswerComments] = useState<{[key: string]: any[]}>({})
  const [commentText, setCommentText] = useState('')
  
  // Premium/Upsell states
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const DEV_FORCE_PREMIUM = true // temp override for this account/session
  
  // Biography Outline states
  const [showOutlineModal, setShowOutlineModal] = useState(false)
  const [showStyleModal, setShowStyleModal] = useState(false)
  const [stylePrefs, setStylePrefs] = useState<StylePrefs>({
    tone: 'narrative',
    depth: 'detailed',
    languageRule: 'zh-CN'
  })
  const [currentJob, setCurrentJob] = useState<OutlineJob | null>(null)
  const [currentOutline, setCurrentOutline] = useState<BiographyOutline | null>(null)
  const [allOutlines, setAllOutlines] = useState<BiographyOutline[]>([])
  const [generatingOutline, setGeneratingOutline] = useState(false)
  const [showOutlineHistory, setShowOutlineHistory] = useState(false)
  const [displayProgress, setDisplayProgress] = useState(0)
  const [confirmDeleteOutline, setConfirmDeleteOutline] = useState<string | null>(null)

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 2500)
  }

  async function handleDeleteOutline(outlineId: string) {
    const result = await deleteOutline(outlineId)
    if (result.success) {
      showToast('Outline deleted', 'success')
      // Remove from local state
      setAllOutlines(prev => prev.filter(o => o.id !== outlineId))
      // If we deleted the current outline, clear it
      if (currentOutline?.id === outlineId) {
        setCurrentOutline(null)
        setShowOutlineModal(false)
      }
    } else {
      showToast(result.error || 'Delete failed', 'error')
    }
    setConfirmDeleteOutline(null)
  }

  const searchParams = useSearchParams()
  const isLoggedIn = !!userId

  async function initAuthAndProject() {
    try {
      setError(null)
      setAuthReady(false)

      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr) {
        // Supabase returns "Auth session missing" when the client has no stored session; treat as logged-out instead of an error banner.
        const msg = userErr.message || ''
        if (msg.toLowerCase().includes('auth session missing')) {
          setUserId(null)
          setUserEmail(null)
          setProjectId(null)
          return
        }
        throw userErr
      }

      if (!user) {
        setUserId(null)
        setUserEmail(null)
        setProjectId(null)
        return
      }

      setUserId(user.id)
      setUserEmail(user.email ?? null)

      const { data: list, error: selErr } = await supabase
        .from('projects')
        .select('id, created_at')
        .eq('owner_id', user.id)
        .eq('name', 'My Vault')
        .limit(1)

      if (selErr) throw selErr

      const existingId = list?.[0]?.id
      if (existingId) {
        setProjectId(existingId)
        return
      }

      const { data: created, error: insErr } = await supabase
        .from('projects')
        .insert({ owner_id: user.id, name: 'My Vault' })
        .select('id')
        .maybeSingle()

      if (insErr) throw insErr
      if (!created) throw new Error('Failed to create project')

      setProjectId(created.id)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setAuthReady(true)
    }
  }

  useEffect(() => {
    initAuthAndProject()
  }, [])

  // Load premium status from server (no client-side toggle)
  useEffect(() => {
    async function loadPremiumStatus() {
      if (DEV_FORCE_PREMIUM) {
        setIsPremium(true)
        return
      }
      if (!userId) {
        setIsPremium(false)
        return
      }

      try {
        const { data, error } = await supabase.rpc('is_premium', { p_user_id: userId })
        if (error) throw error
        setIsPremium(Boolean(data))
      } catch (e) {
        console.error('Failed to load premium status:', e)
        setIsPremium(false)
      }
    }

    loadPremiumStatus()
  }, [userId])

  useEffect(() => {
    const fromQuery = searchParams.get('questionId')
    if (fromQuery) {
      setCurrentQuestionId(fromQuery)
    }
  }, [searchParams])

  useEffect(() => {
    async function loadQuestions() {
      try {
        if (!userId) return

        // 读取本地自定义问题 ID，区分展示
        let customIds: Set<string> = new Set()
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('customQuestionIds')
          if (stored) {
            try {
              customIds = new Set(JSON.parse(stored))
            } catch (e) {
              console.warn('Failed to parse customQuestionIds:', e)
            }
          }
        }

        const { data, error } = await supabase
          .from('questions')
          .select('id, text, chapter')
          .order('id', { ascending: true })

        if (error) throw error

        const normalized: QuestionRow[] = (data ?? []).map((q: any) => ({
          id: String(q.id),
          text: q.text,
          chapter: q.chapter ?? null,
          isCustom: customIds.has(String(q.id)),
        }))

        setQuestions(normalized)

        if (normalized.length > 0) {
          const exists = currentQuestionId && normalized.some((q) => q.id === currentQuestionId)
          if (!exists) setCurrentQuestionId(normalized[0].id)
        }
      } catch (e: any) {
        setError(e?.message ?? String(e))
      }
    }

    loadQuestions()
  }, [userId])

  useEffect(() => {
    async function loadAnswered() {
      try {
        if (!projectId) return

        const { data, error } = await supabase
          .from('answer_sessions')
          .select('question_id')
          .eq('project_id', projectId)

        if (error) throw error

        const s = new Set((data ?? []).map((row: any) => String(row.question_id)))
        setAnsweredSet(s)
      } catch (e: any) {
        setError(e?.message ?? String(e))
      }
    }

    loadAnswered()
  }, [projectId])

  // Load answer history for current question
  useEffect(() => {
    async function loadAnswerHistory() {
      try {
        if (!projectId || !currentQuestionId) {
          setAnswerHistory([])
          return
        }

        console.log('Loading answer history for:', { projectId, currentQuestionId })

        const { data, error } = await supabase
          .from('answer_sessions')
          .select('id, created_at, audio_object_key, transcript_text')
          .eq('project_id', projectId)
          .eq('question_id', currentQuestionId)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Supabase error:', String(error))
          console.error('Error message:', error?.message)
          console.error('Error code:', error?.code)
          throw new Error(`Failed to load history: ${error?.message || 'Unknown error'}`)
        }

        console.log('Answer history loaded:', data)
        setAnswerHistory(data ?? [])
      } catch (e: any) {
        console.error('Error loading answer history:', String(e))
        console.error('Error message:', e?.message)
        console.error('Error toString:', e?.toString ? e.toString() : 'No toString')
      }
    }

    loadAnswerHistory()
  }, [projectId, currentQuestionId])

  // Load collaborators when project changes
  useEffect(() => {
    loadCollaborators()
  }, [projectId])

  // Clear ephemeral recording preview when switching questions
  useEffect(() => {
    // When the user navigates to another question, hide the previous
    // "Recording saved" preview so the UI stays context-specific.
    setAudioUrl(null)
    // Reset non-recording states to idle for clarity
    if (status !== 'recording') {
      setStatus('idle')
    }
    // Also clear any transient error message linked to the previous question
    setError(null)
  }, [currentQuestionId])

  // Load photos for current answer
  useEffect(() => {
    async function loadAnswerPhotos() {
      try {
        if (!answerHistory.length || !answerHistory[0]?.id) {
          setSessionPhotos([])
          return
        }

        const { data, error } = await supabase
          .from('answer_photos')
          .select('photo_url, person_names')
          .eq('answer_session_id', answerHistory[0].id)
          .order('display_order', { ascending: true })

        if (error) {
          // Table might not exist yet, silently ignore
          console.warn('Photos table not available yet:', error.message)
          setSessionPhotos([])
          return
        }

        const photos = (data ?? []).map(p => ({
          url: p.photo_url,
          persons: p.person_names || []
        }))
        
        setSessionPhotos(photos)
      } catch (err: any) {
        console.warn('Error loading photos:', err?.message || err)
        setSessionPhotos([])
      }
    }

    loadAnswerPhotos()
  }, [answerHistory.length > 0 ? answerHistory[0]?.id : null])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  async function signUp() {
    if (!authEmail || !authPassword) return

    setAuthLoading(true)
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword })
    setAuthLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setError('Signed up successfully! Now click Sign In.')
      setShowAuthModal(null)
      setAuthEmail('')
      setAuthPassword('')
    }
  }

  async function signIn() {
    if (!authEmail || !authPassword) return

    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
    setAuthLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setError(null)
      setShowAuthModal(null)
      setAuthEmail('')
      setAuthPassword('')
      initAuthAndProject()
    }
  }

  function openSignIn() {
    setAuthEmail('')
    setAuthPassword('')
    setShowAuthModal('signin')
  }

  function openSignUp() {
    setAuthEmail('')
    setAuthPassword('')
    setShowAuthModal('signup')
  }

  function closeAuthModal() {
    setShowAuthModal(null)
    setAuthEmail('')
    setAuthPassword('')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUserId(null)
    setUserEmail(null)
    setProjectId(null)
    setQuestions([])
    setAnsweredSet(new Set())
    setCurrentQuestionId(null)
    setAudioUrl(null)
    setStatus('idle')
    setError(null)
  }

  // Save自由问题到 Supabase questions 表
  async function saveFreeQuestion(text: string, chapter: string): Promise<string> {
    const questionId = crypto.randomUUID()

    if (!userId) {
      throw new Error('Not logged in, cannot save custom question')
    }

    const { error } = await supabase
      .from('questions')
      .insert({
        id: questionId,
        text,
        chapter,
        created_by: userId,
      })

    if (error) {
      console.error('Failed to save custom question:', error)
      throw error
    }

    // 记录自定义问题 ID 以便区分
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('customQuestionIds')
        const arr: string[] = stored ? JSON.parse(stored) : []
        if (!arr.includes(questionId)) {
          arr.push(questionId)
          localStorage.setItem('customQuestionIds', JSON.stringify(arr))
        }
      }
    } catch (e) {
      console.warn('Failed to persist customQuestionIds:', e)
    }

    // 添加到本地 questions 列表（标记 isCustom）
    setQuestions(prev => [...prev, { id: questionId, text, chapter, isCustom: true }])
    setCurrentQuestionId(questionId)

    return questionId
  }

  // Delete自由问题（从 Supabase Delete）
  async function deleteFreeQuestion(questionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', questionId)

      if (error) throw error

      // 从本地 questions 列表移除
      setQuestions(prev => prev.filter(q => q.id !== questionId))

      // 从 localStorage 的 customQuestionIds 移除
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('customQuestionIds')
        if (stored) {
          const arr: string[] = JSON.parse(stored)
          const updated = arr.filter(id => id !== questionId)
          localStorage.setItem('customQuestionIds', JSON.stringify(updated))
        }
      }

      // 如果当前选中的是被删问题，Clear选择
      setCurrentQuestionId(prev => (prev === questionId ? null : prev))
      
      showToast('Custom question deleted', 'success')
    } catch (e: any) {
      console.error('Failed to delete custom question:', e)
      showToast('Delete failed, please try again', 'error')
      throw e
    }
  }

  async function startRecording() {
    setError(null)
    setAudioUrl(null)

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)

    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      try {
        if (!userId || !projectId) {
          setError('User or project not ready')
          setStatus('error')
          return
        }
        if (!currentQuestionId) {
          setError('Please choose a question first')
          setStatus('error')
          return
        }

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const sessionId = uuid()

        const now = new Date()
        const yyyy = now.getFullYear()
        const mm = String(now.getMonth() + 1).padStart(2, '0')

        const objectPath = `projects/${projectId}/audio_raw/${yyyy}/${mm}/${sessionId}.webm`

        setStatus('uploading')

        const { error: uploadError } = await supabase.storage
          .from('vault')
          .upload(objectPath, blob, {
            contentType: blob.type || 'audio/webm',
            upsert: false,
          })

        if (uploadError) throw uploadError

        const { data: signed, error: signErr } = await supabase.storage
          .from('vault')
          .createSignedUrl(objectPath, 60)

        if (signErr) throw signErr
        if (!signed) throw new Error('Failed to create signed URL')

        const { error: dbErr } = await supabase
          .from('answer_sessions')
          .insert({
            id: sessionId,
            project_id: projectId,
            question_id: currentQuestionId,
            audio_object_key: objectPath,
            status: 'uploaded',
          })

        if (dbErr) throw dbErr

        // Save attached photos
        if (sessionPhotos.length > 0) {
          const photoRecords = sessionPhotos.map((photo, idx) => ({
            answer_session_id: sessionId,
            project_id: projectId,
            question_id: currentQuestionId,
            photo_url: photo.url,
            person_names: photo.persons.length > 0 ? photo.persons : null,
            display_order: idx,
          }))

          const { error: photoErr } = await supabase
            .from('answer_photos')
            .insert(photoRecords)

          if (photoErr) {
            console.error('Photo save error:', photoErr)
            // Don't throw - photos are optional
          }
        }

        const { error: transcribeErr } = await supabase.functions.invoke('transcribe_session', {
          body: { session_id: sessionId },
        })

        if (transcribeErr) throw transcribeErr

        setAnsweredSet((prev) => new Set([...prev, String(currentQuestionId)]))
        setAudioUrl(signed.signedUrl)
        setSessionPhotos([])
        setStatus('done')
      } catch (e: any) {
        setError(e?.message ?? String(e))
        setStatus('error')
      }
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    setStatus('recording')
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setStatus('stopped')
  }

  async function deleteAnswerSession(sessionId: string) {
    try {
      console.log('Deleting answer session via function:', sessionId)
      const { error } = await supabase.functions.invoke('delete_answer_session', {
        body: { session_id: sessionId },
      })

      if (error) throw error

      // Remove from local state, then show toast
      setAnswerHistory(prev => prev.filter(a => a.id !== sessionId))
      showToast('Answer deleted', 'success')

      // If no remaining answers for the current question, update answeredSet
      const remainingForQuestion = answerHistory.filter(a => a.id !== sessionId)
      if (remainingForQuestion.length === 0 && currentQuestionId) {
        setAnsweredSet(prev => {
          const s = new Set(prev)
          s.delete(String(currentQuestionId))
          return s
        })
      }
    } catch (e: any) {
      console.error('Delete function error:', e)
      setError(e?.message ?? String(e))
      showToast('Delete failed', 'error')
    }
  }

  async function getSignedAudioUrl(objectPath: string): Promise<string | null> {
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from('vault')
        .createSignedUrl(objectPath, 3600) // 1 hour

      if (signErr) throw signErr
      return signed?.signedUrl ?? null
    } catch (e: any) {
      console.error('Error getting signed URL:', e)
      return null
    }
  }

  async function handlePhotoUpload(file: File) {
    try {
      if (!projectId || !currentQuestionId) {
        showToast('Missing project or question', 'error')
        return
      }

      if (sessionPhotos.length >= 3) {
        if (isPremium) {
          showToast('Maximum 3 photos per answer (free), unlimited with Premium!', 'error')
        } else {
          showToast('Upgrade to Premium for unlimited photos per answer', 'error')
          setShowPremiumModal(true)
        }
        return
      }

      setUploadingPhoto(true)

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const fileName = `${Date.now()}_${file.name}`
      const photoPath = `projects/${projectId}/photos/${yyyy}/${mm}/${dd}/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('vault')
        .upload(photoPath, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get signed URL
      const { data: signed, error: signErr } = await supabase.storage
        .from('vault')
        .createSignedUrl(photoPath, 31536000) // 1 year

      if (signErr) throw signErr
      if (!signed) throw new Error('Failed to create signed URL')

      // Add to local state
      const persons = photoPersonTags.trim().split(',').map(p => p.trim()).filter(p => p)
      setSessionPhotos(prev => [...prev, { url: signed.signedUrl, persons }])
      setPhotoPersonTags('')
      
      showToast('Photo added', 'success')
    } catch (err: any) {
      console.error('Photo upload error:', err)
      showToast('Photo upload failed', 'error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function generateInviteLink() {
    try {
      if (!projectId) return

      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      
      const { error } = await supabase
        .from('project_invites')
        .insert({
          project_id: projectId,
          invite_token: token,
          role: collaboratorRole,
          created_by: userId,
        })

      if (error) throw error

      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
      const link = `${baseUrl}?invite=${token}`
      setInviteLink(link)
      showToast('Invite link generated', 'success')
    } catch (err: any) {
      console.error('Failed to generate invite link:', err?.message || err, err)
      const msg = err?.message || 'Invite link failed. Please ensure DB migrations are applied and you are project owner.'
      showToast(`Failed to generate invite link: ${msg}`, 'error')
    }
  }

  async function loadCollaborators() {
    try {
      if (!projectId) return

      const { data, error } = await supabase
        .from('project_collaborators')
        .select('id, user_id, role, joined_at')
        .eq('project_id', projectId)

      if (error) {
        // Table might not exist yet - silently skip
        if (error.message?.includes('Could not find the table')) {
          console.warn('Collaborators table not available yet. Run: supabase link && supabase db push')
          return
        }
        throw error
      }
      setCollaborators(data ?? [])
    } catch (err: any) {
      console.error('Failed to load collaborators:', err?.message || err)
    }
  }

  async function loadAnswerComments(answerId: string) {
    try {
      const { data, error } = await supabase
        .from('answer_comments')
        .select('id, content, user_id, created_at')
        .eq('answer_session_id', answerId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setAnswerComments(prev => ({
        ...prev,
        [answerId]: data ?? []
      }))
    } catch (err: any) {
      console.error('Failed to load comments:', err)
    }
  }

  async function addComment(answerId: string) {
    try {
      if (!projectId || !userId || !commentText.trim()) return

      const { error } = await supabase
        .from('answer_comments')
        .insert({
          answer_session_id: answerId,
          project_id: projectId,
          user_id: userId,
          content: commentText,
        })

      if (error) throw error

      setCommentText('')
      await loadAnswerComments(answerId)
      showToast('Comment added', 'success')
    } catch (err: any) {
      console.error('Failed to add comment:', err)
      showToast('Failed to add comment', 'error')
    }
  }

  function requirePremium(feature: string): boolean {
    if (!isPremium) {
      showToast(`${feature} is a Premium feature. Upgrade to unlock!`, 'error')
      setShowPremiumModal(true)
      return false
    }
    return true
  }

  // Biography Outline Functions
  async function startOutlineGeneration() {
    if (!projectId) return
    
    setGeneratingOutline(true)
    setShowStyleModal(false)
    
    try {
      const result = await generateBiographyOutline(projectId, stylePrefs)
      
      if (result.error) {
        showToast(result.error, 'error')
        setGeneratingOutline(false)
        return
      }

      if (result.job_id) {
        // Start polling
        pollOutlineJob(result.job_id)
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to start generation', 'error')
      setGeneratingOutline(false)
    }
  }

  async function pollOutlineJob(jobId: string) {
    const pollInterval = setInterval(async () => {
      const job = await getOutlineJobStatus(jobId)
      
      if (!job) {
        clearInterval(pollInterval)
        showToast('Job not found', 'error')
        setGeneratingOutline(false)
        return
      }

      setCurrentJob(job)

      if (job.status === 'done' && job.result_outline_id) {
        clearInterval(pollInterval)
        const outline = await getOutlineById(job.result_outline_id)
        if (outline) {
          setCurrentOutline(outline)
          setShowOutlineModal(true)
          showToast('Outline generated successfully!', 'success')
        }
        setGeneratingOutline(false)
        loadProjectOutlines()
      } else if (job.status === 'failed') {
        clearInterval(pollInterval)
        showToast(job.error_text || 'Generation failed', 'error')
        setGeneratingOutline(false)
      } else if (job.status === 'cancelled') {
        clearInterval(pollInterval)
        setGeneratingOutline(false)
      }
    }, 3000) // Poll every 3 seconds
  }

  async function loadProjectOutlines() {
    if (!projectId) return
    try {
      const outlines = await listProjectOutlines(projectId)
      setAllOutlines(outlines)
    } catch (e: any) {
      console.error('Failed to load outlines:', e?.message || e)
      showToast(e?.message || 'Failed to load outlines', 'error')
    }
  }

  async function copyOutlineAsMarkdown() {
    if (!currentOutline?.outline_json) return
    const markdown = outlineToMarkdown(currentOutline.outline_json)
    const success = await copyToClipboard(markdown)
    if (success) {
      showToast('Copied to clipboard!', 'success')
    } else {
      showToast('Failed to copy', 'error')
    }
  }

  // Load outlines when project is available
  useEffect(() => {
    if (projectId) {
      loadProjectOutlines()
    }
  }, [projectId])

  // Smooth progress animation for outline generation
  useEffect(() => {
    if (!generatingOutline) {
      setDisplayProgress(0)
      return
    }

    const targetProgress = currentJob?.progress_percent ?? 0

    // If we're generating but no job yet, show a slow creeping progress (fake loading)
    if (!currentJob) {
      const fakeInterval = setInterval(() => {
        setDisplayProgress(prev => {
          // Slowly creep up to 50% while waiting for job to start
          if (prev < 50) return prev + 0.5
          return prev
        })
      }, 100)
      return () => clearInterval(fakeInterval)
    }

    // Animate towards target progress
    const animateInterval = setInterval(() => {
      setDisplayProgress(prev => {
        const target = Math.max(targetProgress, prev) // avoid moving backwards when backend reports lower
        const diff = target - prev
        if (Math.abs(diff) < 1) return target
        // Move 10% of the remaining distance each tick for smooth animation
        return prev + diff * 0.1
      })
    }, 50)

    return () => clearInterval(animateInterval)
  }, [generatingOutline, currentJob, currentJob?.progress_percent])

  const progressCount = answeredSet.size
  const totalCount = questions.length
  const outlineUnlocked = progressCount >= MIN_ANSWERS_FOR_OUTLINE

  // Find current question
  const currentQuestion = questions.find((q) => q.id === currentQuestionId)

  const buildFollowUps = (text: string, chapter?: string | null): string[] => {
    const t = (text || '').toLowerCase()
    const hints = new Set<string>()

    const add = (hint: string) => {
      if (hint) hints.add(hint)
    }

    // Time, place, people, reason style probes based on keywords found in the question text
    if (/when|时间|时候|年代|年份|年龄/.test(t)) add('Include specific years, ages, or approximate time periods')
    if (/where|哪里|哪儿|地点|住在|城市|家乡|学校|公司/.test(t)) add('Describe the location: city, neighborhood, house, or environment details')
    if (/who|谁|人物|家人|同学|朋友|同事|老师/.test(t)) add('Mention the people involved: who they were, your relationship, what they said')
    if (/why|原因|动机|怎么会|如何发生/.test(t)) add('Explain the reasons or motivations behind what happened')
    if (/感受|感觉|心情|开心|难过|紧张|兴奋/.test(t)) add('Add your emotions at the time: happy, nervous, or worried?')
    if (/结果|影响|收获|教训|改变/.test(t)) add('What results or changes did this bring? Any lessons learned?')
    if (/第一次|初次/.test(t)) add('Recall details of the first time: who was there, the scene, conversations')
    if (/搬家|转学|变动|变故/.test(t)) add('Explain the reasons for the change, where you moved, and how it affected your life')
    if (/游戏|玩具|爱好|兴趣/.test(t)) add('Give examples of your favorite toys/games/hobbies and who accompanied you')
    if (/老师|课程|学校|学习|考试|科目/.test(t)) add('Mention memorable teachers, classes, or a specific exam/assignment')
    if (/工作|职业|岗位|项目|同事|老板/.test(t)) add('Describe your role, team, challenges, and how you solved problems')
    if (/家庭|父母|兄弟|姐妹|婚|伴侣/.test(t)) add('Include family interaction moments: a phrase, a scene, or a habit')
    if (/旅行|旅途|出差|游/.test(t)) add('Describe the destination, companions, route, and memorable moments')
    if (/困难|挫折|挑战|失败/.test(t)) add('Identify the biggest challenge, how you dealt with it, and the outcome')
    if (/选择|决定|决定/.test(t)) add('Share your thought process and other options you considered')

    // Chapter-aware extra nudge if still few hints
    const c = (chapter || '').toLowerCase()
    if (hints.size < 2 && (c.includes('童年') || c.includes('childhood'))) {
      add('Childhood scenes: what home looked like, the surroundings, places you often visited')
      add('What small things or secrets mattered most to you back then?')
    }
    if (hints.size < 2 && (c.includes('学') || c.includes('school') || c.includes('education'))) {
      add('School life: your desk mate, clubs, a memorable class')
    }
    if (hints.size < 2 && (c.includes('工作') || c.includes('career') || c.includes('职业'))) {
      add('Work scenes: team atmosphere, a typical day, your proudest moment')
    }
    if (hints.size < 2 && (c.includes('家') || c.includes('family') || c.includes('婚'))) {
      add('Family moments: a conversation, an argument, or a warm moment')
    }

    const result = Array.from(hints)
    if (result.length === 0) {
      return [
        'Add more scene details (time, place, people, dialogue)',
        'What impact or inspiration did this have on you?'
      ]
    }
    if (result.length === 1) {
      result.push('Add your emotions or thoughts to make the story more vivid')
    }
    return result.slice(0, 3)
  }

  // Generate follow-up questions based on question text (per-question customization)
  const followUpQuestions = useMemo(() => {
    if (!currentQuestion?.text) return []
    return buildFollowUps(currentQuestion.text, currentQuestion.chapter)
  }, [currentQuestion?.text, currentQuestion?.chapter])

  // Helper to get question index
  const currentQIndex = currentQuestion ? questions.findIndex((q) => q.id === currentQuestion.id) : -1
  const prevQuestion = currentQIndex > 0 ? questions[currentQIndex - 1] : null
  const nextQuestion = currentQIndex >= 0 && currentQIndex < questions.length - 1 ? questions[currentQIndex + 1] : null

  function formatChapterName(name: string): string {
    const trimmed = (name || '').trim()
    const match = trimmed.match(/^0*(\d+)[\s._-]+(.+)$/)
    if (match) {
      const num = Number(match[1])
      const title = match[2].trim()
      return `${num}. ${title}`
    }
    return trimmed || 'Uncategorized'
  }

  // Group questions by chapter while keeping original order of chapters
  const chapterGroups: { name: string; displayName: string; items: QuestionRow[] }[] = []
  const chapterMap = new Map<string, { name: string; displayName: string; items: QuestionRow[] }>()
  questions.forEach((q) => {
    const name = q.chapter ?? 'Uncategorized'
    const existing = chapterMap.get(name)
    if (existing) {
      existing.items.push(q)
    } else {
      const group = { name, displayName: formatChapterName(name), items: [q] }
      chapterMap.set(name, group)
      chapterGroups.push(group)
    }
  })

  function toggleChapter(name: string) {
    setOpenChapter((prev) => (prev === name ? null : name))
  }

  // Open the first chapter by default for convenience
  useEffect(() => {
    if (!openChapter && chapterGroups.length > 0) {
      setOpenChapter(chapterGroups[0].name)
    }
  }, [openChapter, chapterGroups])

  if (!authReady) {
    return (
      <main className="detroit-bg" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div className="glass-card" style={{
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}>
          <div style={{
            width: 40,
            height: 40,
            border: '2px solid rgba(0, 212, 255, 0.3)',
            borderTop: '2px solid #00d4ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <div style={{ color: '#8899aa', fontSize: 14, letterSpacing: '0.5px' }}>
            SYSTEM INITIALIZING...
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="detroit-bg" style={{
      minHeight: '100vh',
      padding: '24px 16px',
      fontFamily: '"Microsoft YaHei", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {/* Layout Container */}
      <div style={{
        maxWidth: 1400,
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          background: 'rgba(13, 18, 25, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          borderRadius: 4,
          gap: 12,
          minHeight: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <img 
              src="/logo.png" 
              alt="EverArchive Logo" 
              style={{ 
                width: 42, 
                height: 42,
                objectFit: 'contain',
                background: 'transparent'
              }} 
            />
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e8f4f8', letterSpacing: '0.5px' }}>
                Ever<span style={{ color: '#00d4ff' }}>Archive</span>
              </h1>
              <p style={{ margin: '0px 0 0', fontSize: 8, color: '#8899aa', letterSpacing: '0.3px' }}>
                Where Memories Outlast Time
              </p>
            </div>
          </div>
          {isLoggedIn && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                borderRadius: 3,
                fontSize: 8,
                color: '#8899aa',
                minWidth: 0,
              }}>
                <span className="status-dot active" style={{ width: 4, height: 4 }} />
                <span style={{ color: '#00d4ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', fontSize: 8 }}>{userEmail}</span>
              </div>
              
              {/* Primary Action */}
              <Link
                href="/today"
                className="cyber-btn cyber-btn-primary"
                style={{
                  padding: '6px 10px',
                  fontSize: 9,
                  borderRadius: 3,
                  textDecoration: 'none',
                  background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                  color: '#0b1220',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                ◉ TODAY'S 3
              </Link>
              
              {/* Navigation Group */}
              <div style={{ 
                display: 'flex', 
                gap: 2,
                padding: '2px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 3,
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}>
                <Link
                  href="/photos/new"
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    textDecoration: 'none',
                    border: 'none',
                    whiteSpace: 'nowrap',
                  }}
                  title="Photos"
                >
                  ◇ PHOTOS
                </Link>
                <Link
                  href="/progress"
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    textDecoration: 'none',
                    border: 'none',
                    whiteSpace: 'nowrap',
                  }}
                  title="Map"
                >
                  ◇ MAP
                </Link>
                <button
                  onClick={() => {
                    if (isPremium) {
                      window.location.href = '/outline-annotate'
                    } else {
                      requirePremium('Advanced Outline Editing')
                    }
                  }}
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.12), rgba(255, 68, 102, 0.12))',
                    color: !isPremium ? '#fbbf2466' : '#fbbf24',
                    borderColor: 'rgba(251, 191, 36, 0.3)',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Outline"
                >
                  ◇ OUTLINE {!isPremium && '🔒'}
                </button>
                <Link
                  href="/progress/book"
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(52, 211, 153, 0.12))',
                    color: '#10b981',
                    borderColor: 'rgba(52, 211, 153, 0.3)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Book"
                >
                  ◇ BOOK
                </Link>
                <Link
                  href="/family"
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(255, 68, 102, 0.12))',
                    color: '#f0abfc',
                    borderColor: 'rgba(192, 132, 252, 0.3)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Tree"
                >
                  ◇ TREE
                </Link>
                <Link
                  href="/stories"
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(124, 58, 237, 0.12))',
                    color: '#c084fc',
                    borderColor: 'rgba(124, 58, 237, 0.3)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Story"
                >
                  ◇ STORY
                </Link>
                <button
                  onClick={() => {
                    if (isPremium) {
                      window.location.href = '/export'
                    } else {
                      requirePremium('Advanced Export (PDF/Print)')
                    }
                  }}
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(79, 70, 229, 0.15))',
                    color: !isPremium ? '#a78bfa66' : '#a78bfa',
                    borderColor: 'rgba(167, 139, 250, 0.3)',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Export"
                >
                  ◇ EXPORT {!isPremium && '🔒'}
                </button>
                <button
                  onClick={() => setShowCollaboratorModal(true)}
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(168, 85, 247, 0.15))',
                    color: '#ec4899',
                    borderColor: 'rgba(236, 72, 153, 0.3)',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Collab"
                >
                  ◇ COLLAB
                </button>
                <button
                  onClick={() => setShowPremiumModal(true)}
                  className="cyber-btn"
                  style={{
                    padding: '5px 7px',
                    fontSize: 8,
                    borderRadius: 2,
                    background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.15))',
                    color: '#ffd700',
                    borderColor: 'rgba(255, 215, 0, 0.4)',
                    border: '1px solid rgba(255, 215, 0, 0.4)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                  title="PRO"
                >
                  ✨ PRO
                </button>
              </div>
              
              <button
                onClick={signOut}
                className="cyber-btn cyber-btn-danger"
                style={{
                  padding: '5px 10px',
                  fontSize: 8,
                  borderRadius: 2,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                SIGN OUT
              </button>
            </div>
          )}
        </div>

        {/* Main Content */}
        {!isLoggedIn ? (
          // Auth Screen - Detroit Style
          <div style={{
            maxWidth: 450,
            margin: '80px auto',
            textAlign: 'center',
          }}>
            <div className="glass-card" style={{
              padding: 48,
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Scan line effect */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
                animation: 'scan-line 3s linear infinite',
              }} />

              <div style={{
                width: 80,
                height: 80,
                margin: '0 auto 24px',
                background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 136, 204, 0.1))',
                border: '2px solid rgba(0, 212, 255, 0.5)',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                color: '#00d4ff',
              }}>◈</div>

              <h2 style={{
                margin: '0 0 8px',
                fontSize: 24,
                fontWeight: 600,
                color: '#e8f4f8',
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}>ACCESS PORTAL</h2>
              <p style={{
                color: '#556677',
                marginBottom: 32,
                fontSize: 13,
                letterSpacing: '0.5px',
              }}>AUTHENTICATION REQUIRED</p>

              <div style={{ display: 'flex', gap: 16, flexDirection: 'column' }}>
                <button
                  onClick={openSignIn}
                  className="cyber-btn cyber-btn-primary"
                  style={{ borderRadius: 4, width: '100%' }}
                >
                  ▸ SIGN IN
                </button>
                <button
                  onClick={openSignUp}
                  className="cyber-btn"
                  style={{ borderRadius: 4, width: '100%' }}
                >
                  ◇ CREATE ACCOUNT
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Two-Column Layout
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
          }} className="two-column-layout">
            {/* Left Column: Main Operation Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Current Question Focus Card */}
              {currentQuestion && (
                <div className="glass-card" style={{
                  padding: 24,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Top accent line */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
                  }} />

                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{
                      padding: '6px 12px',
                      background: 'rgba(0, 212, 255, 0.1)',
                      color: '#00d4ff',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 4,
                      border: '1px solid rgba(0, 212, 255, 0.3)',
                      letterSpacing: '1px',
                    }}>
                      Q{currentQuestion.id.replace(/^Q/i, '')}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: '#8899aa',
                      flex: 1,
                      padding: '6px 0',
                    }}>
                      📘 {currentQuestion.chapter ?? 'Uncategorized'}
                    </div>
                  </div>

                  <h3 style={{
                    margin: '0 0 16px',
                    fontSize: 20,
                    fontWeight: 500,
                    color: '#e8f4f8',
                    lineHeight: 1.5,
                  }}>
                    {currentQuestion.text}
                  </h3>
                  
                  {/* Follow-up hints */}
                  {followUpQuestions.length > 0 && (
                    <div style={{
                      padding: '12px',
                      background: 'rgba(251, 191, 36, 0.08)',
                      border: '1px solid rgba(251, 191, 36, 0.2)',
                      borderRadius: 8,
                      marginBottom: 16,
                    }}>
                      <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, marginBottom: 6, letterSpacing: '0.5px' }}>
                        💡 Follow-up Prompts
                      </div>
                      {followUpQuestions.map((q, idx) => (
                        <div key={idx} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                          • {q}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Question Navigation */}
                  <div style={{
                    display: 'flex',
                    gap: 8,
                    justifyContent: 'flex-end',
                  }}>
                    <button
                      onClick={() => prevQuestion && setCurrentQuestionId(prevQuestion.id)}
                      disabled={!prevQuestion}
                      style={{
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: prevQuestion ? 'rgba(0, 212, 255, 0.05)' : 'rgba(0, 0, 0, 0.2)',
                        color: prevQuestion ? '#00d4ff' : '#334455',
                        border: `1px solid ${prevQuestion ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
                        borderRadius: 4,
                        cursor: prevQuestion ? 'pointer' : 'not-allowed',
                        transition: 'all 0.3s',
                        letterSpacing: '0.5px',
                      }}
                    >
                      ◁ PREV
                    </button>
                    <button
                      onClick={() => nextQuestion && setCurrentQuestionId(nextQuestion.id)}
                      disabled={!nextQuestion}
                      style={{
                        padding: '8px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: nextQuestion ? 'rgba(0, 212, 255, 0.05)' : 'rgba(0, 0, 0, 0.2)',
                        color: nextQuestion ? '#00d4ff' : '#334455',
                        border: `1px solid ${nextQuestion ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 0, 0, 0.1)'}`,
                        borderRadius: 4,
                        cursor: nextQuestion ? 'pointer' : 'not-allowed',
                        transition: 'all 0.3s',
                        letterSpacing: '0.5px',
                      }}
                    >
                      NEXT ▷
                    </button>
                  </div>
                </div>
              )}

              {/* Recording Card */}
              <div className="glass-card" style={{
                padding: 24,
                border: status === 'recording' ? '1px solid rgba(255, 68, 102, 0.5)' : '1px solid rgba(0, 212, 255, 0.15)',
                boxShadow: status === 'recording' ? '0 0 30px rgba(255, 68, 102, 0.2)' : 'none',
                transition: 'all 0.3s',
              }}>
                {/* Status Indicator */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 20,
                  padding: '10px 16px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color:
                    status === 'done' ? '#00ff88' :
                    status === 'error' ? '#ff4466' :
                    status === 'recording' ? '#ff4466' :
                    status === 'uploading' ? '#00d4ff' : '#556677',
                }}>
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background:
                      status === 'done' ? '#00ff88' :
                      status === 'error' ? '#ff4466' :
                      status === 'recording' ? '#ff4466' :
                      status === 'uploading' ? '#00d4ff' : '#334455',
                    boxShadow:
                      status === 'recording' ? '0 0 15px #ff4466' :
                      status === 'done' ? '0 0 15px #00ff88' : 'none',
                    animation: status === 'recording' ? 'pulse-glow 1s ease-in-out infinite' : 'none',
                  }} />
                  {status === 'idle' && 'STANDBY'}
                  {status === 'recording' && 'REC ●'}
                  {status === 'stopped' && 'RECORDING COMPLETE'}
                  {status === 'uploading' && 'PROCESSING...'}
                  {status === 'done' && 'MEMORY SAVED'}
                  {status === 'error' && 'ERROR'}
                </div>

                {/* Recording Buttons */}
                <div style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 20,
                }}>
                  <button
                    onClick={startRecording}
                    disabled={status === 'recording' || status === 'uploading'}
                    className={status === 'recording' || status === 'uploading' ? '' : 'cyber-btn cyber-btn-primary'}
                    style={{
                      flex: 1,
                      padding: '16px 18px',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '1px',
                      background: status === 'recording' || status === 'uploading'
                        ? 'linear-gradient(135deg, rgba(255, 68, 102, 0.2), rgba(255, 68, 102, 0.15))'
                        : 'linear-gradient(135deg, #35f2ff, #0e9bff)',
                      color: status === 'recording' || status === 'uploading' ? '#ff99b0' : '#051019',
                      border: status === 'recording' || status === 'uploading'
                        ? '1px solid rgba(255, 68, 102, 0.4)'
                        : '1px solid rgba(14, 155, 255, 0.5)',
                      borderRadius: 8,
                      boxShadow: status === 'recording' || status === 'uploading'
                        ? '0 0 10px rgba(255, 68, 102, 0.25)'
                        : '0 12px 30px rgba(14, 155, 255, 0.25)',
                      cursor: status === 'recording' || status === 'uploading' ? 'not-allowed' : 'pointer',
                      transition: 'all 0.25s ease',
                      transform: status === 'recording' || status === 'uploading' ? 'none' : 'translateY(0)',
                    }}
                    onMouseEnter={(e) => {
                      if (status === 'recording' || status === 'uploading') return
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      if (status === 'recording' || status === 'uploading') return
                      (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
                    }}
                  >
                    ◉ {status === 'recording' ? 'RECORDING...' : 'START REC'}
                  </button>
                  <button
                    onClick={stopRecording}
                    disabled={status !== 'recording'}
                    className="cyber-btn cyber-btn-danger"
                    style={{
                      flex: 1,
                      padding: '16px 18px',
                      fontSize: 13,
                      fontWeight: 700,
                      letterSpacing: '1px',
                      borderRadius: 8,
                      background: status === 'recording'
                        ? 'linear-gradient(135deg, #ff6b6b, #ff3366)'
                        : 'linear-gradient(135deg, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.2))',
                      color: status === 'recording' ? '#1a0b12' : '#cbd5e1',
                      border: status === 'recording'
                        ? '1px solid rgba(255, 107, 107, 0.6)'
                        : '1px solid rgba(148, 163, 184, 0.35)',
                      boxShadow: status === 'recording'
                        ? '0 12px 30px rgba(255, 51, 102, 0.25)'
                        : 'none',
                      opacity: status === 'recording' ? 1 : 0.5,
                      cursor: status === 'recording' ? 'pointer' : 'not-allowed',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    ◼ STOP
                  </button>
                </div>

                {/* Audio Preview */}
                {audioUrl && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(0, 255, 136, 0.05)',
                    border: '1px solid rgba(0, 255, 136, 0.3)',
                    borderRadius: 4,
                  }}>
                    <p style={{
                      margin: '0 0 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#00ff88',
                      letterSpacing: '1px',
                    }}>
                      ◈ AUDIO MEMORY CAPTURED
                    </p>
                    <audio controls src={audioUrl} style={{
                      width: '100%',
                      height: 32,
                      borderRadius: 4,
                      filter: 'hue-rotate(140deg)',
                    }} />
                  </div>
                )}

                {/* Photo Attachment Section */}
                <div style={{
                  padding: 16,
                  background: 'rgba(168, 85, 247, 0.05)',
                  border: '1px solid rgba(168, 85, 247, 0.2)',
                  borderRadius: 8,
                  marginTop: 16,
                }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#d8b4fe',
                    marginBottom: 12,
                    letterSpacing: '0.5px',
                  }}>
                    📸 ATTACH PHOTOS ({sessionPhotos.length}/3)
                  </div>

                  {/* Photo Grid */}
                  {sessionPhotos.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      marginBottom: 12,
                    }}>
                      {sessionPhotos.map((photo, idx) => (
                        <div key={idx} style={{
                          position: 'relative',
                          aspectRatio: '1',
                          borderRadius: 6,
                          overflow: 'hidden',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                        }}>
                          <img 
                            src={photo.url} 
                            alt={`Photo ${idx + 1}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                          {photo.persons.length > 0 && (
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: 'rgba(0, 0, 0, 0.6)',
                              padding: '4px 6px',
                              fontSize: 10,
                              color: '#d8b4fe',
                              textAlign: 'center',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {photo.persons.join(', ')}
                            </div>
                          )}
                          <button
                            onClick={() => setSessionPhotos(prev => prev.filter((_, i) => i !== idx))}
                            style={{
                              position: 'absolute',
                              top: 4,
                              right: 4,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: 'rgba(255, 68, 102, 0.8)',
                              color: 'white',
                              border: 'none',
                              fontSize: 14,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload Form */}
                  {sessionPhotos.length < 3 && (
                    <div style={{
                      display: 'flex',
                      gap: 8,
                      flexDirection: 'column',
                    }}>
                      <input
                        type="text"
                        placeholder="Who's in this photo? (comma-separated)"
                        value={photoPersonTags}
                        onChange={(e) => setPhotoPersonTags(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          background: '#1a1f2e',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          borderRadius: 6,
                          color: '#e8f4f8',
                          fontSize: 12,
                        }}
                      />
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        background: 'rgba(168, 85, 247, 0.1)',
                        border: '1px solid rgba(168, 85, 247, 0.4)',
                        borderRadius: 6,
                        cursor: uploadingPhoto ? 'not-allowed' : 'pointer',
                        opacity: uploadingPhoto ? 0.6 : 1,
                      }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0]
                            if (file) handlePhotoUpload(file)
                          }}
                          disabled={uploadingPhoto}
                          style={{ display: 'none' }}
                        />
                        <span style={{ fontSize: 12, color: '#d8b4fe', fontWeight: 500 }}>
                          {uploadingPhoto ? '🔄 Uploading...' : '📤 Choose Photo'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Error Display */}
                {error && (
                  <div style={{
                    padding: 16,
                    background: 'rgba(255, 68, 102, 0.1)',
                    border: '1px solid rgba(255, 68, 102, 0.3)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: '#ff4466',
                    letterSpacing: '0.5px',
                  }}>
                    <strong>⚠ SYSTEM ERROR:</strong> {error}
                  </div>
                )}
              </div>

              {/* All Recording History - Collapsible */}
              {answerHistory.length > 0 && (
                <div className="glass-card" style={{ padding: 20, marginTop: 16 }}>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'none',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#00d4ff',
                      cursor: 'pointer',
                      marginBottom: showHistory ? 12 : 0,
                      letterSpacing: '0.5px',
                    }}
                  >
                    <span>◈ Recording History ({answerHistory.length} versions)</span>
                    <span style={{
                      transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>▼</span>
                  </button>

                  {showHistory && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}>
                      {answerHistory.map((session, idx) => (
                        <div key={session.id} style={{
                          padding: 12,
                          background: idx === 0 ? 'rgba(0, 212, 255, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                          border: idx === 0 ? '1px solid rgba(0, 212, 255, 0.15)' : '1px solid rgba(100, 116, 139, 0.3)',
                          borderRadius: 10,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}>
                            <span style={{
                              fontSize: 12,
                              color: idx === 0 ? '#00d4ff' : '#94a3b8',
                              fontWeight: idx === 0 ? 700 : 500,
                            }}>
                              {idx === 0 ? '✨ Latest Version' : `Version #${answerHistory.length - idx}`}
                            </span>
                            <span style={{
                              fontSize: 11,
                              color: '#94a3b8',
                            }}>
                              {new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Audio Player */}
                          <AudioPlayer audioObjectKey={session.audio_object_key} />

                          {/* Transcript with Edit for Latest */}
                          {session.transcript_text && (
                            <div style={{ marginTop: 4 }}>
                              {idx === 0 && editingTranscript === session.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
                                    ✏️ Quick Edit（edit full paragraph or first 2 sentences）
                                  </div>
                                  <textarea
                                    value={transcriptEdit}
                                    onChange={(e) => setTranscriptEdit(e.target.value)}
                                    style={{
                                      width: '100%',
                                      minHeight: 100,
                                      padding: 12,
                                      background: '#1a1f2e',
                                      border: '1px solid rgba(0, 212, 255, 0.3)',
                                      borderRadius: 8,
                                      color: '#e8f4f8',
                                      fontSize: 12,
                                      lineHeight: 1.6,
                                      resize: 'vertical',
                                    }}
                                  />
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { error } = await supabase
                                            .from('answer_sessions')
                                            .update({ transcript_text: transcriptEdit })
                                            .eq('id', session.id)
                                          
                                          if (error) throw error
                                          
                                          setAnswerHistory(prev => prev.map(s => 
                                            s.id === session.id 
                                              ? { ...s, transcript_text: transcriptEdit }
                                              : s
                                          ))
                                          
                                          showToast('Transcript updated', 'success')
                                          setEditingTranscript(null)
                                        } catch (err) {
                                          console.error('Failed to update transcript:', err)
                                          showToast('Update failed', 'error')
                                        }
                                      }}
                                      style={{
                                        padding: '8px 16px',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: 'rgba(0, 212, 255, 0.15)',
                                        color: '#00d4ff',
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingTranscript(null)
                                        setTranscriptEdit('')
                                      }}
                                      style={{
                                        padding: '8px 16px',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        background: 'rgba(255, 68, 102, 0.1)',
                                        color: '#ff9aa2',
                                        border: '1px solid rgba(255, 68, 102, 0.2)',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{
                                  padding: 10,
                                  background: idx === 0 ? 'rgba(0, 212, 255, 0.03)' : 'white',
                                  border: idx === 0 ? '1px solid rgba(0, 212, 255, 0.1)' : 'none',
                                  borderRadius: 8,
                                }}>
                                  <div style={{
                                    fontSize: 11,
                                    color: idx === 0 ? '#00d4ff' : '#64748b',
                                    marginBottom: 6,
                                    fontWeight: 600,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}>
                                    <span>📝 Transcript</span>
                                    {idx === 0 && (
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                          onClick={() => {
                                            setEditingTranscript(session.id)
                                            setTranscriptEdit(session.transcript_text || '')
                                          }}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            background: 'rgba(251, 191, 36, 0.15)',
                                            color: '#fbbf24',
                                            border: '1px solid rgba(251, 191, 36, 0.3)',
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          ✏️ Edit
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteTranscript(session.id)}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            background: 'rgba(255, 68, 102, 0.12)',
                                            color: '#ff4466',
                                            border: '1px solid rgba(255, 68, 102, 0.25)',
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          🗑 Clear
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{
                                    fontSize: 12,
                                    color: idx === 0 ? '#e8f4f8' : '#334155',
                                    lineHeight: 1.5,
                                    maxHeight: 120,
                                    overflowY: 'auto',
                                  }}>
                                    {session.transcript_text}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {idx === 0 && confirmDeleteTranscript === session.id && (
                            <div style={{
                              marginTop: 8,
                              padding: 12,
                              background: 'rgba(255, 68, 102, 0.05)',
                              border: '1px solid rgba(255, 68, 102, 0.2)',
                              borderRadius: 8,
                            }}>
                              <div style={{ fontSize: 12, color: '#ff4466', marginBottom: 8 }}>
                                Are you sure you want to clear this transcript？
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={async () => {
                                    try {
                                      const { error } = await supabase
                                        .from('answer_sessions')
                                        .update({ transcript_text: null })
                                        .eq('id', session.id)
                                      if (error) throw error
                                      setAnswerHistory(prev => prev.map(s => s.id === session.id ? { ...s, transcript_text: null } : s))
                                      setEditingTranscript(null)
                                      setTranscriptEdit('')
                                      showToast('Transcript cleared', 'success')
                                    } catch (err) {
                                      console.error('Failed to clear transcript:', err)
                                      showToast('Clear failed', 'error')
                                    } finally {
                                      setConfirmDeleteTranscript(null)
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: 'rgba(255, 68, 102, 0.2)',
                                    color: '#ff4466',
                                    border: '1px solid rgba(255, 68, 102, 0.3)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Clear
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteTranscript(null)}
                                  style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: 'rgba(148, 163, 184, 0.1)',
                                    color: '#64748b',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Photos only for latest */}
                          {idx === 0 && sessionPhotos.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{
                                fontSize: 11,
                                color: '#00d4ff',
                                marginBottom: 8,
                                fontWeight: 600,
                              }}>
                                📸 Attached Photos ({sessionPhotos.length})
                              </div>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                                gap: 8,
                              }}>
                                {sessionPhotos.map((photo, photoIdx) => (
                                  <div key={photoIdx} style={{
                                    position: 'relative',
                                    aspectRatio: '1',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    border: '1px solid rgba(0, 212, 255, 0.2)',
                                  }}>
                                    <img 
                                      src={photo.url} 
                                      alt={`Photo ${photoIdx + 1}`}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                      }}
                                    />
                                    {photo.persons && photo.persons.length > 0 && (
                                      <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        background: 'rgba(0, 0, 0, 0.6)',
                                        padding: '4px 6px',
                                        fontSize: 9,
                                        color: '#00d4ff',
                                        textAlign: 'center',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}>
                                        {photo.persons.join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Delete Button - available for all versions */}
                          <button
                            onClick={() => setConfirmDelete(session.id)}
                            style={{
                              marginTop: 4,
                              padding: '6px 12px',
                              fontSize: 11,
                              fontWeight: 600,
                              background: 'rgba(255, 68, 102, 0.1)',
                              color: '#ff4466',
                              border: '1px solid rgba(255, 68, 102, 0.2)',
                              borderRadius: 6,
                              cursor: 'pointer',
                            }}
                          >
                            🗑 Delete this version
                          </button>

                          {/* Confirm Delete Modal */}
                          {confirmDelete === session.id && (
                            <div style={{
                              marginTop: 8,
                              padding: 12,
                              background: 'rgba(255, 68, 102, 0.05)',
                              border: '1px solid rgba(255, 68, 102, 0.2)',
                              borderRadius: 8,
                            }}>
                              <div style={{ fontSize: 12, color: '#ff4466', marginBottom: 8 }}>
                                Are you sure you want to delete this version？
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  onClick={async () => {
                                    await deleteAnswerSession(session.id)
                                    setConfirmDelete(null)
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: 'rgba(255, 68, 102, 0.2)',
                                    color: '#ff4466',
                                    border: '1px solid rgba(255, 68, 102, 0.3)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  style={{
                                    flex: 1,
                                    padding: '6px 12px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: 'rgba(148, 163, 184, 0.1)',
                                    color: '#64748b',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Biography Outline CTA */}
              <div style={{
                background: outlineUnlocked ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0, 136, 204, 0.1) 100%)' : 'rgba(13, 18, 25, 0.85)',
                borderRadius: 4,
                padding: 20,
                boxShadow: outlineUnlocked ? '0 0 20px rgba(0, 212, 255, 0.15)' : 'none',
                border: outlineUnlocked ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid rgba(0, 212, 255, 0.1)',
                color: outlineUnlocked ? '#e8f4f8' : '#8899aa',
                marginTop: 16,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{outlineUnlocked ? '📖' : '📑'}</div>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
                  Review & Generate Biography Outline
                </h3>
                <p style={{ margin: '0 0 16px', fontSize: 13, opacity: outlineUnlocked ? 0.95 : 0.75, lineHeight: 1.5 }}>
                  {outlineUnlocked
                    ? `You've completed ${answeredSet.size} questions! Review unlocks at ${MIN_ANSWERS_FOR_OUTLINE}+. You can generate or refine your outline.`
                    : `Completed ${answeredSet.size} / ${MIN_ANSWERS_FOR_OUTLINE} questions. Reach ${MIN_ANSWERS_FOR_OUTLINE} to generate your outline。`}
                </p>
                
                {outlineUnlocked ? (
                  generatingOutline ? (
                    <div style={{
                      padding: 16,
                      background: 'rgba(0, 212, 255, 0.05)',
                      borderRadius: 4,
                      border: '1px solid rgba(0, 212, 255, 0.15)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{
                          width: 20,
                          height: 20,
                          border: '3px solid rgba(255,255,255,0.3)',
                          borderTop: '3px solid white',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          {currentJob?.status === 'processing' ? 'Generating outline...' : 'Starting...'}
                        </span>
                      </div>
                      <div style={{
                          height: 4,
                          background: 'rgba(0, 212, 255, 0.1)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.round(displayProgress)}%`,
                            background: 'white',
                            transition: 'width 0.15s ease-out',
                          }} />
                        </div>
                        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.9 }}>
                          {Math.round(displayProgress)}% complete
                        </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <button
                          onClick={() => setShowStyleModal(true)}
                          disabled={!outlineUnlocked}
                          style={{
                            width: '100%',
                            padding: '12px 24px',
                            fontSize: 14,
                            fontWeight: 600,
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 136, 204, 0.15) 100%)',
                            color: '#00d4ff',
                            border: '1px solid rgba(0, 212, 255, 0.4)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 0 15px rgba(0, 212, 255, 0.15)',
                          }}
                        >
                          🚀 Generate Outline
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link
                          href="/outline"
                          style={{
                            padding: '10px 16px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'rgba(0, 212, 255, 0.05)',
                            color: '#00d4ff',
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          🔎 Review Outline
                        </Link>
                      </div>
                    </div>
                  )
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <button
                        disabled
                        style={{
                          width: '100%',
                          padding: '12px 24px',
                          fontSize: 14,
                          fontWeight: 600,
                          background: 'rgba(100, 116, 139, 0.2)',
                          color: '#64748b',
                          border: '1px solid rgba(100, 116, 139, 0.2)',
                          borderRadius: 4,
                          cursor: 'not-allowed',
                          transition: 'all 0.2s',
                        }}
                      >
                        🚀 Generate Outline
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{
                        padding: '10px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'rgba(100, 116, 139, 0.1)',
                        color: '#64748b',
                        border: '1px solid rgba(100, 116, 139, 0.2)',
                        borderRadius: 4,
                        cursor: 'not-allowed',
                      }}>
                        🔎 Review Outline
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Question Bank */}
            <div className="glass-card" style={{
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100vh - 200px)',
              overflow: 'hidden',
            }}>
              {/* Progress */}
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}>
                  <h3 style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#8899aa',
                    letterSpacing: '1px',
                  }}>COMPLETION STATUS</h3>
                  <span style={{
                    fontSize: 14,
                    color: '#00d4ff',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                  }}>{progressCount} / {totalCount > 0 ? totalCount : '—'}</span>
                </div>
                <div className="cyber-progress">
                  <div className="cyber-progress-bar" style={{
                    width: totalCount > 0 ? `${(progressCount / totalCount) * 100}%` : '0%',
                  }} />
                </div>
              </div>

              {/* Questions List */}
              <div style={{
                marginBottom: 16,
                fontSize: 11,
                fontWeight: 600,
                color: '#556677',
                letterSpacing: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  background: '#00d4ff',
                  borderRadius: '50%',
                }} />
                DATA ARCHIVE
              </div>

              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingBottom: 40,
              }}>
                {totalCount === 0 && (
                  <div style={{
                    border: '1px solid rgba(255, 196, 0, 0.25)',
                    background: 'rgba(255, 196, 0, 0.08)',
                    color: '#eab308',
                    borderRadius: 6,
                    padding: '10px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}>
                    Questions not loaded: Please check if Supabase RLS policies allow reading default questions (created_by is null or equals current user), and run NOTIFY pgrst, 'reload schema' in SQL Editor to refresh cache.
                  </div>
                )}
                {chapterGroups.map((group) => {
                  const collapsed = openChapter !== group.name
                  const visibleItems = group.items.filter((item) => !item.isCustom)
                  const answeredInGroup = visibleItems.filter((item) => answeredSet.has(String(item.id))).length

                  return (
                    <div
                      key={group.name}
                      style={{
                        border: collapsed ? '1px solid rgba(0, 212, 255, 0.1)' : '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        background: collapsed ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 212, 255, 0.05)',
                        transition: 'all 0.3s',
                      }}
                    >
                      <button
                        onClick={() => toggleChapter(group.name)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
                          <span style={{
                            display: 'inline-flex',
                            width: 28,
                            height: 28,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            background: 'rgba(0, 212, 255, 0.1)',
                            border: '1px solid rgba(0, 212, 255, 0.3)',
                            color: '#00d4ff',
                            fontWeight: 700,
                            fontSize: 11,
                            flexShrink: 0,
                          }}>
                            {group.items.length}
                          </span>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#e8f4f8',
                            flex: 1,
                            lineHeight: 1.4,
                            textAlign: 'left',
                          }}>
                            {group.displayName}
                          </div>
                          <div style={{
                            fontSize: 11,
                            color: answeredInGroup === group.items.length ? '#00ff88' : '#00d4ff',
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            flexShrink: 0,
                          }}>
                            [{answeredInGroup}/{group.items.length}]
                          </div>
                        </div>
                        <span style={{
                          transition: 'transform 0.2s',
                          transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                          color: '#00d4ff',
                          fontSize: 12,
                        }}>
                          ▶
                        </span>
                      </button>

                      {!collapsed && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          padding: '10px 10px 24px',
                          maxHeight: 280,
                          overflowY: 'auto',
                        }}>
                          {group.items.filter((q) => !q.isCustom).map((q) => {
                            const qid = String(q.id)
                            const done = answeredSet.has(qid)
                            const selected = qid === currentQuestionId

                            return (
                              <button
                                key={qid}
                                onClick={() => setCurrentQuestionId(qid)}
                                style={{
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  border: selected
                                    ? '1px solid rgba(0, 212, 255, 0.8)'
                                    : done
                                      ? '1px solid rgba(0, 255, 136, 0.3)'
                                      : '1px solid rgba(0, 212, 255, 0.1)',
                                  background: selected
                                    ? 'rgba(0, 212, 255, 0.15)'
                                    : done
                                      ? 'rgba(0, 255, 136, 0.05)'
                                      : 'rgba(0, 0, 0, 0.2)',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  gap: 10,
                                  alignItems: 'flex-start',
                                  transition: 'all 0.2s',
                                  boxShadow: selected ? '0 0 15px rgba(0, 212, 255, 0.2)' : 'none',
                                }}
                              >
                                <div style={{
                                  width: 20,
                                  height: 20,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 10,
                                  flexShrink: 0,
                                  borderRadius: 3,
                                  border: done
                                    ? '1px solid rgba(0, 255, 136, 0.5)'
                                    : '1px solid rgba(0, 212, 255, 0.3)',
                                  background: done
                                    ? 'rgba(0, 255, 136, 0.2)'
                                    : 'rgba(0, 0, 0, 0.3)',
                                  color: done ? '#00ff88' : '#556677',
                                }}>
                                  {done ? '◆' : '◇'}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: 12,
                                    color: selected ? '#00d4ff' : done ? '#00ff88' : '#8899aa',
                                    fontWeight: 500,
                                    lineHeight: 1.4,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                  }}>
                                    {q.text}
                                  </div>
                                </div>

                                <div style={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: selected ? '#00d4ff' : '#556677',
                                  letterSpacing: '0.5px',
                                  flexShrink: 0,
                                  fontFamily: 'monospace',
                                }}>
                                  {qid.padStart(3, '0')}
                                </div>
                              </button>
                            )
                          })}

                          {/* 自定义问题列表（带Delete按钮） */}
                          {group.items.filter((q) => q.isCustom).map((q) => {
                            const qid = String(q.id)
                            const done = answeredSet.has(qid)
                            const selected = qid === currentQuestionId

                            return (
                              <div key={qid} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  onClick={() => setCurrentQuestionId(qid)}
                                  style={{
                                    flex: 1,
                                    textAlign: 'left',
                                    padding: '10px 12px',
                                    border: selected
                                      ? '1px solid rgba(0, 212, 255, 0.8)'
                                      : done
                                        ? '1px solid rgba(0, 255, 136, 0.3)'
                                        : '1px solid rgba(0, 212, 255, 0.1)',
                                    background: selected
                                      ? 'rgba(0, 212, 255, 0.15)'
                                      : done
                                        ? 'rgba(0, 255, 136, 0.05)'
                                        : 'rgba(0, 0, 0, 0.2)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    gap: 10,
                                    alignItems: 'flex-start',
                                    transition: 'all 0.2s',
                                    boxShadow: selected ? '0 0 15px rgba(0, 212, 255, 0.2)' : 'none',
                                  }}
                                >
                                  <div style={{
                                    width: 20,
                                    height: 20,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    flexShrink: 0,
                                    borderRadius: 3,
                                    border: done
                                      ? '1px solid rgba(0, 255, 136, 0.5)'
                                      : '1px solid rgba(0, 212, 255, 0.3)',
                                    background: done
                                      ? 'rgba(0, 255, 136, 0.2)'
                                      : 'rgba(0, 0, 0, 0.3)',
                                    color: done ? '#00ff88' : '#556677',
                                  }}>
                                    {done ? '◆' : '◇'}
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontSize: 12,
                                      color: selected ? '#00d4ff' : done ? '#00ff88' : '#8899aa',
                                      fontWeight: 500,
                                      lineHeight: 1.4,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                    }}>
                                      {q.text}
                                    </div>
                                  </div>
                                </button>
                                
                                <button
                                  onClick={() => deleteFreeQuestion(qid)}
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: 'rgba(255, 68, 102, 0.15)',
                                    color: '#ff4466',
                                    border: '1px solid rgba(255, 68, 102, 0.3)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  🗑 Delete
                                </button>
                              </div>
                            )
                          })}


                          {/* 自由问题区域 */}
                          <FreeQuestionSection
                            chapterId={group.name}
                            chapterName={group.displayName}
                            existingQuestions={group.items.filter(q => q.isCustom).map(q => ({
                              id: String(q.id),
                              text: q.text
                            }))}
                            onSaveQuestion={saveFreeQuestion}
                            onQuestionClick={(questionId) => setCurrentQuestionId(questionId)}
                            onDeleteQuestion={deleteFreeQuestion}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add responsive styles via style tag */}
      <style>{`
        @media (max-width: 1024px) {
          .two-column-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Auth Modal */}
      <Modal
        isOpen={showAuthModal !== null}
        onClose={closeAuthModal}
        title={showAuthModal === 'signin' ? 'Sign In' : 'Create Account'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#667eea')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Password {showAuthModal === 'signup' && <span style={{ color: '#94a3b8', fontWeight: 400 }}>(min 6 chars)</span>}
            </label>
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#667eea')}
              onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  showAuthModal === 'signin' ? signIn() : signUp()
                }
              }}
            />
          </div>
          {error && (
            <div style={{
              padding: 10,
              background: error.includes('successfully') ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${error.includes('successfully') ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 8,
              fontSize: 12,
              color: error.includes('successfully') ? '#166534' : '#991b1b',
            }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={closeAuthModal}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                background: '#f1f5f9',
                color: '#64748b',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={showAuthModal === 'signin' ? signIn : signUp}
              disabled={authLoading || !authEmail || !authPassword}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: authLoading || !authEmail || !authPassword ? '#cbd5e1' : 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: authLoading || !authEmail || !authPassword ? 'not-allowed' : 'pointer',
              }}
            >
              {authLoading ? 'Loading...' : showAuthModal === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            {showAuthModal === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => { setShowAuthModal('signup'); setError(null) }}
                  style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontWeight: 600 }}
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setShowAuthModal('signin'); setError(null) }}
                  style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', fontWeight: 600 }}
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onConfirm={() => {
          if (confirmDelete) {
            deleteAnswerSession(confirmDelete)
          }
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
        title="Delete Answer"
        message="Are you sure you want to delete this answer? This action cannot be undone."
      />

      {/* Style Preferences Modal */}
      <Modal
        isOpen={showStyleModal}
        onClose={() => setShowStyleModal(false)}
        title="Outline Style Preferences"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Tone
            </label>
            <select
              value={stylePrefs.tone || 'narrative'}
              onChange={(e) => setStylePrefs({ ...stylePrefs, tone: e.target.value as any })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="narrative">Narrative</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Detail Level
            </label>
            <select
              value={stylePrefs.depth || 'detailed'}
              onChange={(e) => setStylePrefs({ ...stylePrefs, depth: e.target.value as any })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="brief">Brief</option>
              <option value="detailed">Detailed</option>
              <option value="comprehensive">Comprehensive</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Output Language
            </label>
            <select
              value={stylePrefs.languageRule || 'zh-CN'}
              onChange={(e) => setStylePrefs({ ...stylePrefs, languageRule: e.target.value as any })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="zh-CN">Simplified Chinese (Default)</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
              Writing Style
            </label>
            <select
              value={stylePrefs.authorStyle || 'default'}
              onChange={(e) => setStylePrefs({ ...stylePrefs, authorStyle: e.target.value as AuthorStyle })}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {Object.entries(AUTHOR_STYLES).map(([key, style]) => (
                <option key={key} value={key}>
                  {style.name} - {style.description.slice(0, 20)}...
                </option>
              ))}
            </select>
            {stylePrefs.authorStyle && AUTHOR_STYLES[stylePrefs.authorStyle] && (
              <p style={{ marginTop: 8, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                {AUTHOR_STYLES[stylePrefs.authorStyle].description}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              onClick={() => setShowStyleModal(false)}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 500,
                background: '#f1f5f9',
                color: '#64748b',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={startOutlineGeneration}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Generate
            </button>
          </div>
        </div>
      </Modal>

      {/* Outline Viewer Modal */}
      {currentOutline && (
        <Modal
          isOpen={showOutlineModal}
          onClose={() => setShowOutlineModal(false)}
          title={`Biography Outline v${currentOutline.version}`}
        >
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {currentOutline.outline_json && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Metadata */}
                <div style={{
                  padding: 12,
                  background: '#f8fafc',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#64748b',
                }}>
                  <div>Generated: {new Date(currentOutline.outline_json.generatedAt).toLocaleString()}</div>
                  <div>Total Sessions: {currentOutline.outline_json.totalSessions}</div>
                  <div>Version: {currentOutline.version}</div>
                </div>

                {/* Sections */}
                {currentOutline.outline_json.sections.map((section, idx) => (
                  <div key={idx} style={{
                    padding: 16,
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                  }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
                      {section.title}
                    </h4>
                    <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                      {section.bullets.map((bullet, bidx) => (
                        <li key={bidx} style={{ marginBottom: 6 }}>{bullet}</li>
                      ))}
                    </ul>
                    {section.quotes && section.quotes.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
                          Notable Quotes
                        </div>
                        {section.quotes.map((quote, qidx) => (
                          <div key={qidx} style={{
                            padding: 10,
                            background: '#f8fafc',
                            borderLeft: '3px solid #667eea',
                            borderRadius: 4,
                            fontSize: 12,
                            fontStyle: 'italic',
                            color: '#475569',
                            marginBottom: 8,
                          }}>
                            "{quote.text}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                  <button
                    onClick={copyOutlineAsMarkdown}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: '#f1f5f9',
                      color: '#667eea',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    📋 Copy Markdown
                  </button>
                  <button
                    onClick={() => setConfirmDeleteOutline(currentOutline.id)}
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete
                  </button>
                  <button
                    onClick={() => setShowOutlineModal(false)}
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Outline History Modal */}
      <Modal
        isOpen={showOutlineHistory}
        onClose={() => setShowOutlineHistory(false)}
        title="Outline History"
      >
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {allOutlines.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
              No outlines generated yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allOutlines.map((outline) => (
                <div
                  key={outline.id}
                  style={{
                    padding: 16,
                    background: outline.status === 'done' ? 'white' : '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    cursor: outline.status === 'done' ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (outline.status === 'done') {
                      setCurrentOutline(outline)
                      setShowOutlineHistory(false)
                      setShowOutlineModal(true)
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                      Version {outline.version}
                    </div>
                    <div style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 6,
                      background: 
                        outline.status === 'done' ? '#dcfce7' : 
                        outline.status === 'failed' ? '#fee2e2' : 
                        outline.status === 'processing' ? '#dbeafe' : '#f1f5f9',
                      color: 
                        outline.status === 'done' ? '#166534' : 
                        outline.status === 'failed' ? '#991b1b' : 
                        outline.status === 'processing' ? '#1e40af' : '#64748b',
                    }}>
                      {outline.status.toUpperCase()}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    {new Date(outline.created_at).toLocaleString()}
                  </div>
                  {outline.outline_json && (
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {outline.outline_json.sections?.length || 0} sections
                    </div>
                  )}
                  {outline.error_text && (
                    <div style={{ fontSize: 11, color: '#991b1b', marginTop: 8, padding: 8, background: '#fee2e2', borderRadius: 6 }}>
                      {outline.error_text}
                    </div>
                  )}
                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteOutline(outline.id)
                    }}
                    style={{
                      marginTop: 10,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    🗑️ Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Confirm Delete Outline Dialog */}
      <ConfirmDialog
        isOpen={confirmDeleteOutline !== null}
        onConfirm={() => {
          if (confirmDeleteOutline) {
            handleDeleteOutline(confirmDeleteOutline)
          }
        }}
        onCancel={() => setConfirmDeleteOutline(null)}
        title="Delete Outline"
        message="Are you sure you want to delete this outline? This action cannot be undone."
      />

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2',
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          borderRadius: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          fontSize: 14,
          fontWeight: 500,
          zIndex: 2000,
          animation: 'slideIn 0.3s ease',
        }}>
          {toast.text}
        </div>
      )}

      {/* Collaborator Modal */}
      {showCollaboratorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowCollaboratorModal(false)}>
          <div style={{
            background: '#0b1220',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#00d4ff',
              marginBottom: 16,
              letterSpacing: '1px',
            }}>
              👥 COLLABORATION
            </div>

            {/* Invite Link Section */}
            <div style={{
              padding: 12,
              background: 'rgba(168, 85, 247, 0.05)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#d8b4fe',
                marginBottom: 8,
              }}>
                📤 Generate Invite Link
              </div>
              <div style={{
                display: 'flex',
                gap: 8,
                marginBottom: 8,
              }}>
                <select
                  value={collaboratorRole}
                  onChange={(e) => setCollaboratorRole(e.target.value as any)}
                  style={{
                    padding: '6px 8px',
                    background: '#1a1f2e',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: 4,
                    color: '#d8b4fe',
                    fontSize: 11,
                  }}
                >
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="contributor">Contributor (can comment)</option>
                </select>
                <button
                  onClick={generateInviteLink}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    background: 'rgba(168, 85, 247, 0.2)',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    color: '#d8b4fe',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Create Link
                </button>
              </div>
              {inviteLink && (
                <div style={{
                  padding: 8,
                  background: 'rgba(0, 255, 136, 0.05)',
                  border: '1px solid rgba(0, 255, 136, 0.2)',
                  borderRadius: 4,
                }}>
                  <div style={{
                    fontSize: 10,
                    color: '#00ff88',
                    marginBottom: 4,
                    fontWeight: 600,
                  }}>
                    Share this link:
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#e8f4f8',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}>
                    {inviteLink}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink)
                      showToast('Copied to clipboard', 'success')
                    }}
                    style={{
                      marginTop: 8,
                      padding: '4px 8px',
                      background: 'rgba(0, 255, 136, 0.1)',
                      border: '1px solid rgba(0, 255, 136, 0.3)',
                      color: '#00ff88',
                      borderRadius: 3,
                      cursor: 'pointer',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    📋 Copy Link
                  </button>
                </div>
              )}
            </div>

            {/* Collaborators List */}
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#8899aa',
              marginBottom: 8,
            }}>
              Active Collaborators ({collaborators.length})
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              {collaborators.map((collab) => (
                <div key={collab.id} style={{
                  padding: 8,
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.1)',
                  borderRadius: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: '#e8f4f8',
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>User {collab.user_id.slice(0, 8)}</div>
                    <div style={{ fontSize: 10, color: '#8899aa' }}>{collab.role} • {new Date(collab.joined_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
              {collaborators.length === 0 && (
                <div style={{
                  padding: 12,
                  textAlign: 'center',
                  color: '#556677',
                  fontSize: 11,
                }}>
                  No collaborators yet. Share an invite link above.
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCollaboratorModal(false)}
              style={{
                marginTop: 16,
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(255, 68, 102, 0.1)',
                border: '1px solid rgba(255, 68, 102, 0.2)',
                color: '#ff9aa2',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Premium Modal */}
      {showPremiumModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }} onClick={() => setShowPremiumModal(false)}>
          <div style={{
            background: 'linear-gradient(135deg, #0b1220 0%, #1a1f2e 100%)',
            border: '2px solid rgba(255, 215, 0, 0.3)',
            borderRadius: 16,
            padding: 32,
            maxWidth: 600,
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 80px rgba(255, 215, 0, 0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              textAlign: 'center',
              marginBottom: 32,
            }}>
              <div style={{
                fontSize: 32,
                marginBottom: 12,
              }}>
                ✨
              </div>
              <div style={{
                fontSize: 24,
                fontWeight: 700,
                background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: 8,
              }}>
                PREMIUM FEATURES
              </div>
              <div style={{
                fontSize: 13,
                color: '#8899aa',
              }}>
                Unlock advanced tools for richer storytelling
              </div>
            </div>

            {/* Feature Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              marginBottom: 28,
            }}>
              {[
                { icon: '✏️', title: 'Advanced Editing', desc: 'Edit transcripts, rearrange, merge answers' },
                { icon: '🎨', title: 'Professional Formatting', desc: 'Custom fonts, colors, layouts for exports' },
                { icon: '📄', title: 'PDF/Print Export', desc: 'High-quality biography documents' },
                { icon: '📸', title: 'Unlimited Photos', desc: 'Store unlimited images per answer' },
                { icon: '🤖', title: 'AI Enhancement', desc: 'Auto-suggestions for incomplete answers' },
                { icon: '⚡', title: 'Priority Processing', desc: 'Faster transcription & outline generation' },
              ].map((feature, idx) => (
                <div key={idx} style={{
                  padding: 16,
                  background: 'rgba(255, 215, 0, 0.05)',
                  border: '1px solid rgba(255, 215, 0, 0.15)',
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{feature.icon}</div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#ffd700',
                    marginBottom: 4,
                  }}>
                    {feature.title}
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: '#8899aa',
                    lineHeight: 1.4,
                  }}>
                    {feature.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* Pricing Tiers */}
            <div style={{
              marginBottom: 24,
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#e8f4f8',
                marginBottom: 12,
                textAlign: 'center',
              }}>
                Simple Pricing
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}>
                {/* Monthly Plan */}
                <div style={{
                  padding: 16,
                  background: 'rgba(0, 212, 255, 0.05)',
                  border: '1px solid rgba(0, 212, 255, 0.2)',
                  borderRadius: 10,
                }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#00d4ff',
                    marginBottom: 8,
                  }}>
                    Monthly
                  </div>
                  <div style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#ffd700',
                    marginBottom: 4,
                  }}>
                    $9.99
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#8899aa',
                    marginBottom: 12,
                  }}>
                    per month
                  </div>
                  <button
                    onClick={() => {
                      showToast('Premium checkout coming soon. Please contact support or use a redemption code', 'success')
                    }}
                    disabled={isPremium}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: isPremium ? 'rgba(0, 212, 255, 0.2)' : 'linear-gradient(135deg, #00d4ff, #0099ff)',
                      border: 'none',
                      color: isPremium ? '#7acfe3' : '#051019',
                      borderRadius: 6,
                      cursor: isPremium ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: isPremium ? 0.8 : 1,
                    }}
                  >
                    {isPremium ? '✓ Active' : 'Contact to Upgrade'}
                  </button>
                </div>

                {/* Annual Plan */}
                <div style={{
                  padding: 16,
                  background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.1))',
                  border: '2px solid rgba(255, 215, 0, 0.3)',
                  borderRadius: 10,
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                    color: '#0b1220',
                    padding: '2px 12px',
                    borderRadius: 12,
                    fontSize: 9,
                    fontWeight: 700,
                  }}>
                    BEST VALUE
                  </div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#ffd700',
                    marginBottom: 8,
                  }}>
                    Annual
                  </div>
                  <div style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#ffd700',
                    marginBottom: 4,
                  }}>
                    $79.99
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#8899aa',
                    marginBottom: 12,
                  }}>
                    ~$6.67/month (save 33%)
                  </div>
                  <button
                    onClick={() => {
                      showToast('Premium checkout coming soon. Please contact support or use a redemption code', 'success')
                    }}
                    disabled={isPremium}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: isPremium ? 'rgba(255, 215, 0, 0.3)' : 'linear-gradient(135deg, #ffd700, #ffed4e)',
                      border: 'none',
                      color: isPremium ? '#bca200' : '#0b1220',
                      borderRadius: 6,
                      cursor: isPremium ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 700,
                      opacity: isPremium ? 0.85 : 1,
                    }}
                  >
                    {isPremium ? '✓ Active' : 'Contact to Upgrade'}
                  </button>
                </div>
              </div>
            </div>

            {/* Benefits List */}
            <div style={{
              padding: 16,
              background: 'rgba(16, 185, 129, 0.05)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#10b981',
                marginBottom: 8,
              }}>
                ✓ Why Go Premium?
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: 16,
                fontSize: 11,
                color: '#8899aa',
                lineHeight: 1.6,
              }}>
                <li>Professional-grade exports for sharing with family</li>
                <li>Never lose memories to storage limits</li>
                <li>AI-powered suggestions to enrich your stories</li>
                <li>Priority support & early access to new features</li>
              </ul>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowPremiumModal(false)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'rgba(255, 68, 102, 0.1)',
                border: '1px solid rgba(255, 68, 102, 0.2)',
                color: '#ff9aa2',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Continue as Free User
            </button>
          </div>
        </div>
      )}


      {/* Keyframe Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  )
}

















