/**
 * Collaboration API - Helper functions for family/friend collaboration
 */

import { supabase } from './supabaseClient'

export type CollabInvite = {
  id: string
  project_id: string
  created_by_user_id: string
  token: string
  role: 'contributor' | 'viewer'
  can_view_owner_answer: boolean
  owner_message: string | null
  expires_at: string | null
  created_at: string
}

export type CollabInviteQuestion = {
  id: string
  invite_id: string
  question_id: string
  can_view_owner_answer_override: boolean | null
  created_at: string
}

export type CollabComment = {
  id: string
  invite_id: string
  question_id: string
  project_id: string
  contributor_user_id: string | null
  contributor_name: string | null
  audio_storage_path: string | null
  transcript_text: string | null
  comment_text: string | null
  status: 'new' | 'reviewed' | 'pinned' | 'resolved'
  created_at: string
  updated_at: string
}

/**
 * Generate a random URL-safe token
 */
function generateToken(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36)
}

/**
 * Create a new collaboration invite
 */
export async function createInvite(params: {
  projectId: string
  userId: string
  questionIds: string[]
  role?: 'contributor' | 'viewer'
  canViewOwnerAnswer?: boolean
  ownerMessage?: string
  expiresAt?: Date
}): Promise<{ invite: CollabInvite; error: Error | null }> {
  try {
    const token = generateToken()

    // Insert invite
    const { data: invite, error: inviteError } = await supabase
      .from('collab_invites')
      .insert({
        project_id: params.projectId,
        created_by_user_id: params.userId,
        token,
        role: params.role || 'contributor',
        can_view_owner_answer: params.canViewOwnerAnswer || false,
        owner_message: params.ownerMessage || null,
        expires_at: params.expiresAt?.toISOString() || null,
      })
      .select()
      .single()

    if (inviteError) throw inviteError

    // Insert invite questions
    const questionRecords = params.questionIds.map(qid => ({
      invite_id: invite.id,
      question_id: qid,
    }))

    const { error: questionsError } = await supabase
      .from('collab_invite_questions')
      .insert(questionRecords)

    if (questionsError) throw questionsError

    return { invite, error: null }
  } catch (err: any) {
    console.error('createInvite error:', err)
    return { invite: null as any, error: err }
  }
}

/**
 * Fetch invite by token
 */
export async function fetchInviteByToken(token: string): Promise<{
  invite: CollabInvite | null
  error: Error | null
}> {
  try {
    const { data, error } = await supabase
      .from('collab_invites')
      .select('*')
      .eq('token', token)
      .single()

    if (error) throw error

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new Error('Invite link has expired')
    }

    return { invite: data, error: null }
  } catch (err: any) {
    console.error('fetchInviteByToken error:', err)
    return { invite: null, error: err }
  }
}

/**
 * Fetch questions for an invite
 */
export async function fetchInviteQuestions(inviteId: string): Promise<{
  questions: CollabInviteQuestion[]
  error: Error | null
}> {
  try {
    const { data, error } = await supabase
      .from('collab_invite_questions')
      .select('*')
      .eq('invite_id', inviteId)

    if (error) throw error

    return { questions: data || [], error: null }
  } catch (err: any) {
    console.error('fetchInviteQuestions error:', err)
    return { questions: [], error: err }
  }
}

/**
 * Create a collaboration comment
 */
export async function createCollabComment(params: {
  inviteId: string
  questionId: string
  projectId: string
  contributorUserId?: string
  contributorName?: string
  audioStoragePath?: string
  transcriptText?: string
  commentText?: string
}): Promise<{ comment: CollabComment | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('collab_comments')
      .insert({
        invite_id: params.inviteId,
        question_id: params.questionId,
        project_id: params.projectId,
        contributor_user_id: params.contributorUserId || null,
        contributor_name: params.contributorName || null,
        audio_storage_path: params.audioStoragePath || null,
        transcript_text: params.transcriptText || null,
        comment_text: params.commentText || null,
        status: 'new',
      })
      .select()
      .single()

    if (error) throw error

    return { comment: data, error: null }
  } catch (err: any) {
    console.error('createCollabComment error:', err)
    return { comment: null, error: err }
  }
}

/**
 * Upload audio file to storage
 */
export async function uploadCollabAudio(
  projectId: string,
  inviteId: string,
  commentId: string,
  audioBlob: Blob
): Promise<{ path: string | null; error: Error | null }> {
  try {
    const path = `${projectId}/${inviteId}/${commentId}.m4a`

    const { error } = await supabase.storage
      .from('collab-audio')
      .upload(path, audioBlob, {
        contentType: 'audio/m4a',
        upsert: true,
      })

    if (error) throw error

    return { path, error: null }
  } catch (err: any) {
    console.error('uploadCollabAudio error:', err)
    return { path: null, error: err }
  }
}

/**
 * Get audio URL from storage
 */
export async function getCollabAudioUrl(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage
      .from('collab-audio')
      .createSignedUrl(path, 3600) // 1 hour expiry

    return data?.signedUrl || null
  } catch (err) {
    console.error('getCollabAudioUrl error:', err)
    return null
  }
}

/**
 * Transcribe collab audio via API route
 */
export async function transcribeCollabAudio(
  commentId: string,
  audioStoragePath: string
): Promise<{ transcript: string | null; error: Error | null }> {
  try {
    console.log('[transcribeCollabAudio] Calling API route for comment:', commentId)

    const response = await fetch('/api/collab/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commentId,
        audioStoragePath,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `API error: ${response.status}`)
    }

    const { transcript } = await response.json()
    console.log('[transcribeCollabAudio] Transcription successful, length:', transcript.length)

    return { transcript, error: null }
  } catch (err: any) {
    console.error('transcribeCollabAudio error:', err)
    return { transcript: null, error: err }
  }
}

/**
 * Fetch owner's collab dashboard data
 */
export async function fetchOwnerCollabDashboard(projectId: string): Promise<{
  invites: (CollabInvite & { question_count: number; comment_count: number })[]
  comments: (CollabComment & { question_text?: string })[]
  error: Error | null
}> {
  try {
    // Fetch all invites for this project
    const { data: invites, error: invitesError } = await supabase
      .from('collab_invites')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (invitesError) throw invitesError

    // For each invite, count questions and comments
    const invitesWithCounts = await Promise.all(
      (invites || []).map(async (invite) => {
        const { count: questionCount } = await supabase
          .from('collab_invite_questions')
          .select('*', { count: 'exact', head: true })
          .eq('invite_id', invite.id)

        const { count: commentCount } = await supabase
          .from('collab_comments')
          .select('*', { count: 'exact', head: true })
          .eq('invite_id', invite.id)

        return {
          ...invite,
          question_count: questionCount || 0,
          comment_count: commentCount || 0,
        }
      })
    )

    // Fetch all comments for this project
    const { data: comments, error: commentsError } = await supabase
      .from('collab_comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (commentsError) throw commentsError

    return {
      invites: invitesWithCounts,
      comments: comments || [],
      error: null,
    }
  } catch (err: any) {
    console.error('fetchOwnerCollabDashboard error:', err)
    return { invites: [], comments: [], error: err }
  }
}

/**
 * Update comment status
 */
export async function updateCommentStatus(
  commentId: string,
  status: 'new' | 'reviewed' | 'pinned' | 'resolved'
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('collab_comments')
      .update({ status })
      .eq('id', commentId)

    if (error) throw error

    return { error: null }
  } catch (err: any) {
    console.error('updateCommentStatus error:', err)
    return { error: err }
  }
}

/**
 * Delete an invite
 */
export async function deleteInvite(inviteId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('collab_invites')
      .delete()
      .eq('id', inviteId)

    if (error) throw error

    return { error: null }
  } catch (err: any) {
    console.error('deleteInvite error:', err)
    return { error: err }
  }
}

/**
 * Fetch comments for a specific question
 */
export async function fetchQuestionComments(
  projectId: string,
  questionId: string
): Promise<{ comments: CollabComment[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('collab_comments')
      .select('*')
      .eq('project_id', projectId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return { comments: data || [], error: null }
  } catch (err: any) {
    console.error('fetchQuestionComments error:', err)
    return { comments: [], error: err }
  }
}
