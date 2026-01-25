'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import UnifiedNav from '@/app/components/UnifiedNav'
import {
  createInvite,
  fetchOwnerCollabDashboard,
  deleteInvite,
  updateCommentStatus,
  getCollabAudioUrl,
  type CollabInvite,
  type CollabComment,
} from '@/lib/collabApi'

type Question = {
  id: string
  text: string
  chapter: string | null
}

export default function CollabPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Questions & Invites
  const [questions, setQuestions] = useState<Question[]>([])
  const [invites, setInvites] = useState<(CollabInvite & { question_count: number; comment_count: number })[]>([])
  const [comments, setComments] = useState<(CollabComment & { question_text?: string })[]>([])

  // Create Invite Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set())
  const [canViewOwnerAnswer, setCanViewOwnerAnswer] = useState(false)
  const [ownerMessage, setOwnerMessage] = useState('')
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Audio playback
  const [playingAudio, setPlayingAudio] = useState<{ [key: string]: string | null }>({})

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  function showToast(text: string, type: 'success' | 'error' = 'success') {
    setToast({ text, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Init: check auth and load data
  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/signin')
          return
        }

        setUserId(user.id)

        // Get project
        const { data: projects } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1)

        if (!projects || projects.length === 0) {
          showToast('No project found', 'error')
          return
        }

        const pid = projects[0].id
        setProjectId(pid)

        // Load questions
        const { data: questionsData } = await supabase
          .from('questions')
          .select('id, text, chapter')
          .or(`scope.eq.global,and(scope.eq.user,owner_user_id.eq.${user.id})`)
          .order('chapter', { ascending: true })

        setQuestions(questionsData || [])

        // Load collab dashboard
        await loadDashboard(pid, questionsData || [])
      } catch (err: any) {
        console.error('Init error:', err)
        showToast(err.message || 'Failed to load', 'error')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!projectId) return

    const intervalId = setInterval(() => {
      console.log('Auto-refreshing collab dashboard...')
      loadDashboard(projectId)
    }, 30000) // 30 seconds

    return () => clearInterval(intervalId)
  }, [projectId, questions])

  async function loadDashboard(pid: string, questionsData?: Question[]) {
    const { invites: invitesData, comments: commentsData, error } = await fetchOwnerCollabDashboard(pid)
    if (error) {
      showToast(error.message || 'Failed to load dashboard', 'error')
      return
    }

    setInvites(invitesData)

    // Attach question text to comments
    const questionsToUse = questionsData || questions
    const commentsWithText = commentsData.map(c => {
      const q = questionsToUse.find(q => q.id === c.question_id)
      return { ...c, question_text: q?.text || c.question_id }
    })
    setComments(commentsWithText)
  }

  async function handleRefresh() {
    if (!projectId) return
    setRefreshing(true)
    try {
      await loadDashboard(projectId)
      showToast('刷新成功', 'success')
    } catch (err: any) {
      showToast('刷新失败', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  function openCreateModal() {
    setSelectedQuestions(new Set())
    setCanViewOwnerAnswer(false)
    setOwnerMessage('')
    setCreatedInviteLink(null)
    setShowCreateModal(true)
  }

  function toggleQuestion(qid: string) {
    const newSet = new Set(selectedQuestions)
    if (newSet.has(qid)) {
      newSet.delete(qid)
    } else {
      newSet.add(qid)
    }
    setSelectedQuestions(newSet)
  }

  async function handleCreateInvite() {
    if (!projectId || !userId) return
    if (selectedQuestions.size === 0) {
      showToast('Please select at least one question', 'error')
      return
    }

    setCreating(true)
    try {
      const { invite, error } = await createInvite({
        projectId,
        userId,
        questionIds: Array.from(selectedQuestions),
        role: 'contributor',
        canViewOwnerAnswer,
        ownerMessage: ownerMessage || undefined,
      })

      if (error) throw error

      const link = `${window.location.origin}/collab/invite?token=${invite.token}`
      setCreatedInviteLink(link)
      showToast('Invite created successfully!', 'success')

      // Reload dashboard
      await loadDashboard(projectId)
    } catch (err: any) {
      showToast(err.message || 'Failed to create invite', 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    if (!confirm('Delete this invite? All associated comments will also be deleted.')) return

    const { error } = await deleteInvite(inviteId)
    if (error) {
      showToast(error.message || 'Failed to delete invite', 'error')
      return
    }

    showToast('Invite deleted', 'success')
    if (projectId) await loadDashboard(projectId)
  }

  async function handleStatusChange(commentId: string, status: 'new' | 'reviewed' | 'pinned' | 'resolved') {
    const { error } = await updateCommentStatus(commentId, status)
    if (error) {
      showToast(error.message || 'Failed to update status', 'error')
      return
    }

    // Update local state
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, status } : c))
    showToast('Status updated', 'success')
  }

  async function handlePlayAudio(commentId: string, audioPath: string | null) {
    if (!audioPath) return

    // If already playing this one, stop it
    if (playingAudio[commentId]) {
      setPlayingAudio(prev => ({ ...prev, [commentId]: null }))
      return
    }

    const url = await getCollabAudioUrl(audioPath)
    if (!url) {
      showToast('Failed to load audio', 'error')
      return
    }

    setPlayingAudio(prev => ({ ...prev, [commentId]: url }))
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8B7355' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <UnifiedNav onProClick={() => {}} />

      <div style={{ padding: 24 }}>
        <div style={{
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#222' }}>
            👥 Collaboration
          </h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: '12px 20px',
                background: refreshing ? '#ccc' : 'rgba(184,155,114,0.1)',
                color: refreshing ? '#666' : '#8B7355',
                border: '1px solid rgba(184,155,114,0.3)',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: refreshing ? 'wait' : 'pointer',
              }}
            >
              {refreshing ? '🔄 刷新中...' : '🔄 刷新'}
            </button>
            <button
              onClick={openCreateModal}
              style={{
                padding: '12px 20px',
                background: '#8B7355',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + 创建邀请链接
            </button>
          </div>
        </div>

        <p style={{ fontSize: 14, color: '#5A4F43', marginBottom: 32 }}>
          Invite family and friends to contribute memories to specific questions via voice recordings.
        </p>

        {/* Invites List */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#222', marginBottom: 16 }}>
            Active Invites ({invites.length})
          </h2>
          {invites.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'rgba(184,155,114,0.05)',
              border: '1px solid rgba(184,155,114,0.2)',
              borderRadius: 12,
              color: '#7B6B5E',
            }}>
              No invites yet. Create one to get started!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {invites.map(invite => (
                <div key={invite.id} style={{
                  padding: 16,
                  background: 'white',
                  border: '1px solid rgba(184,155,114,0.2)',
                  borderRadius: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#8B7355', marginBottom: 4 }}>
                        Created {new Date(invite.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: 14, color: '#222', marginBottom: 8 }}>
                        {invite.question_count} question{invite.question_count !== 1 ? 's' : ''} • {invite.comment_count} contribution{invite.comment_count !== 1 ? 's' : ''}
                      </div>
                      {invite.owner_message && (
                        <div style={{
                          fontSize: 13,
                          color: '#5A4F43',
                          padding: 8,
                          background: 'rgba(184,155,114,0.05)',
                          borderRadius: 4,
                          marginBottom: 8,
                        }}>
                          "{invite.owner_message}"
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#999', fontFamily: 'monospace' }}>
                        {window.location.origin}/collab/invite?token={invite.token}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/collab/invite?token=${invite.token}`)
                          showToast('Link copied!', 'success')
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: 11,
                          background: 'rgba(184,155,114,0.1)',
                          border: '1px solid rgba(184,155,114,0.3)',
                          borderRadius: 6,
                          color: '#8B7355',
                          cursor: 'pointer',
                        }}
                      >
                        📋 Copy
                      </button>
                      <button
                        onClick={() => handleDeleteInvite(invite.id)}
                        style={{
                          padding: '6px 12px',
                          fontSize: 11,
                          background: 'rgba(255,68,102,0.1)',
                          border: '1px solid rgba(255,68,102,0.3)',
                          borderRadius: 6,
                          color: '#ff4466',
                          cursor: 'pointer',
                        }}
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comments List */}
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#222', marginBottom: 16 }}>
            Recent Contributions ({comments.length})
          </h2>
          {comments.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: 'rgba(184,155,114,0.05)',
              border: '1px solid rgba(184,155,114,0.2)',
              borderRadius: 12,
              color: '#7B6B5E',
            }}>
              No contributions yet. Share an invite link to start collecting memories!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.map(comment => (
                <div key={comment.id} style={{
                  padding: 16,
                  background: 'white',
                  border: `2px solid ${comment.status === 'new' ? '#4CAF50' : 'rgba(184,155,114,0.2)'}`,
                  borderRadius: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#8B7355', marginBottom: 4 }}>
                        {comment.contributor_name || 'Anonymous'} • {new Date(comment.created_at).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#222' }}>
                        {comment.question_text}
                      </div>
                    </div>
                    <select
                      value={comment.status}
                      onChange={(e) => handleStatusChange(comment.id, e.target.value as any)}
                      style={{
                        padding: '4px 8px',
                        fontSize: 11,
                        borderRadius: 6,
                        border: '1px solid rgba(184,155,114,0.3)',
                        background: 'white',
                        color: '#8B7355',
                      }}
                    >
                      <option value="new">New</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="pinned">Pinned</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>

                  {comment.comment_text && (
                    <div style={{
                      padding: 12,
                      background: 'rgba(184,155,114,0.05)',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#5A4F43',
                      marginBottom: 8,
                    }}>
                      {comment.comment_text}
                    </div>
                  )}

                  {comment.audio_storage_path && (
                    <div style={{ marginBottom: 12 }}>
                      <button
                        onClick={() => handlePlayAudio(comment.id, comment.audio_storage_path)}
                        style={{
                          padding: '8px 16px',
                          background: playingAudio[comment.id] ? '#4CAF50' : 'rgba(184,155,114,0.1)',
                          border: '1px solid rgba(184,155,114,0.3)',
                          borderRadius: 6,
                          color: playingAudio[comment.id] ? 'white' : '#8B7355',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {playingAudio[comment.id] ? '⏸ 停止' : '▶ 播放音频'}
                      </button>
                      {playingAudio[comment.id] && (
                        <audio
                          src={playingAudio[comment.id]!}
                          autoPlay
                          controls
                          onEnded={() => setPlayingAudio(prev => ({ ...prev, [comment.id]: null }))}
                          style={{ marginTop: 8, width: '100%', maxWidth: 400 }}
                        />
                      )}
                    </div>
                  )}

                  {comment.transcript_text ? (
                    <div style={{
                      padding: 14,
                      background: 'linear-gradient(135deg, rgba(184,155,114,0.06), rgba(184,155,114,0.02))',
                      borderLeft: '4px solid #8B7355',
                      borderRadius: 8,
                      marginTop: 8,
                    }}>
                      <div style={{
                        fontSize: 11,
                        color: '#8B7355',
                        marginBottom: 6,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        📝 音频转写
                      </div>
                      <div style={{
                        fontSize: 14,
                        color: '#222',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {comment.transcript_text}
                      </div>
                    </div>
                  ) : comment.audio_storage_path ? (
                    <div style={{
                      padding: 12,
                      background: 'rgba(255,193,7,0.08)',
                      borderLeft: '3px solid rgba(255,193,7,0.5)',
                      borderRadius: 6,
                      marginTop: 8,
                      fontSize: 12,
                      color: '#8B7355',
                    }}>
                      ⏳ 正在转写音频，请稍候刷新...
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Invite Modal */}
      {showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#222' }}>
              Create Invite Link
            </h2>

            {createdInviteLink ? (
              <div>
                <div style={{
                  padding: 16,
                  background: 'rgba(76,175,80,0.1)',
                  border: '1px solid rgba(76,175,80,0.3)',
                  borderRadius: 8,
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#4CAF50', marginBottom: 8 }}>
                    ✓ Invite Link Created!
                  </div>
                  <div style={{
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: '#5A4F43',
                    wordBreak: 'break-all',
                    marginBottom: 8,
                  }}>
                    {createdInviteLink}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteLink)
                      showToast('Link copied!', 'success')
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    📋 Copy Link
                  </button>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'rgba(184,155,114,0.1)',
                    border: '1px solid rgba(184,155,114,0.3)',
                    borderRadius: 8,
                    color: '#8B7355',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                    Select Questions to Share
                  </label>
                  <div style={{
                    maxHeight: 300,
                    overflow: 'auto',
                    border: '1px solid rgba(184,155,114,0.2)',
                    borderRadius: 8,
                    padding: 8,
                  }}>
                    {questions.map(q => (
                      <label
                        key={q.id}
                        style={{
                          display: 'block',
                          padding: 8,
                          cursor: 'pointer',
                          borderRadius: 4,
                          background: selectedQuestions.has(q.id) ? 'rgba(184,155,114,0.1)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedQuestions.has(q.id)}
                          onChange={() => toggleQuestion(q.id)}
                          style={{ marginRight: 8 }}
                        />
                        <span style={{ fontSize: 13, color: '#222' }}>{q.text}</span>
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#8B7355', marginTop: 4 }}>
                    {selectedQuestions.size} question{selectedQuestions.size !== 1 ? 's' : ''} selected
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 13,
                    color: '#222',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={canViewOwnerAnswer}
                      onChange={(e) => setCanViewOwnerAnswer(e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    Allow contributors to see your answers
                  </label>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#222', marginBottom: 8 }}>
                    Message to Contributors (Optional)
                  </label>
                  <textarea
                    value={ownerMessage}
                    onChange={(e) => setOwnerMessage(e.target.value)}
                    placeholder="e.g., Please share any memories you have about these events..."
                    style={{
                      width: '100%',
                      padding: 12,
                      border: '1px solid rgba(184,155,114,0.3)',
                      borderRadius: 8,
                      fontSize: 13,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      minHeight: 80,
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCreateInvite}
                    disabled={creating || selectedQuestions.size === 0}
                    style={{
                      flex: 1,
                      padding: '12px',
                      background: creating || selectedQuestions.size === 0 ? '#ccc' : '#8B7355',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: creating || selectedQuestions.size === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {creating ? 'Creating...' : 'Generate Link'}
                  </button>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    style={{
                      padding: '12px 20px',
                      background: 'white',
                      color: '#8B7355',
                      border: '1px solid rgba(184,155,114,0.3)',
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          padding: '12px 20px',
          background: toast.type === 'success' ? '#4CAF50' : '#f44336',
          color: 'white',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          zIndex: 2000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
