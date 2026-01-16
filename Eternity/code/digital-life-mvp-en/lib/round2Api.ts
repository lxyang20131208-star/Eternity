import { supabase } from './supabaseClient'

export interface Round2Question {
  id: string
  project_id: string
  round_id: string
  question_text: string
  question_text_en: string | null
  question_type: 'conflict' | 'sensory' | 'quote' | 'general'
  related_chapter: string | null
  missing_element_description: string | null
  media_prompt: string | null
  suggested_media_type: 'photo' | 'video' | 'both' | 'none' | null
  status: 'pending' | 'answered' | 'skipped'
  priority: number
  answer_session_id: string | null
  created_at: string
}

export interface ContentAnalysis {
  id: string
  project_id: string
  round_id: string | null
  analysis_json: {
    chapters: Array<{
      chapter_name: string
      has_conflicts: boolean
      has_sensory_details: boolean
      has_quotes: boolean
      overall_score: { conflict: number; sensory: number; quote: number }
    }>
    overall_score: { conflict: number; sensory: number; quote: number }
    suggested_question_count: number
  }
  status: 'processing' | 'done' | 'failed'
  created_at: string
}

export interface QuestionRound {
  id: string
  project_id: string
  round_number: number
  status: 'active' | 'completed' | 'skipped'
  total_questions: number
  answered_questions: number
  created_at: string
}

export interface AnalysisResult {
  success: boolean
  round_id: string
  analysis_id: string
  analysis: ContentAnalysis['analysis_json']
  questions: Round2Question[]
  question_count: number
}

/**
 * Trigger content analysis to generate round 2 questions
 */
export async function triggerContentAnalysis(projectId: string): Promise<AnalysisResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  if (!token) {
    throw new Error('Not authenticated')
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze_content_gaps`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        language_rule: 'zh-CN',
      }),
    }
  )

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to analyze content')
  }

  return response.json()
}

/**
 * Get existing round 2 questions for a project
 */
export async function getRound2Questions(projectId: string): Promise<Round2Question[]> {
  try {
    const { data, error } = await supabase
      .from('round2_questions')
      .select('*')
      .eq('project_id', projectId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })

    // Table might not exist yet - return empty array
    if (error) {
      console.warn('round2_questions query error:', error.message)
      return []
    }
    return data || []
  } catch (e) {
    console.warn('getRound2Questions failed:', e)
    return []
  }
}

/**
 * Get the latest question round for a project
 */
export async function getLatestRound(projectId: string): Promise<QuestionRound | null> {
  try {
    const { data, error } = await supabase
      .from('question_rounds')
      .select('*')
      .eq('project_id', projectId)
      .eq('round_number', 2)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.warn('question_rounds query error:', error.message)
      return null
    }
    return data
  } catch (e) {
    console.warn('getLatestRound failed:', e)
    return null
  }
}

/**
 * Get the latest content analysis for a project
 */
export async function getLatestAnalysis(projectId: string): Promise<ContentAnalysis | null> {
  const { data, error } = await supabase
    .from('content_analysis')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Update question status
 */
export async function updateQuestionStatus(
  questionId: string,
  status: 'pending' | 'answered' | 'skipped',
  answerSessionId?: string
): Promise<void> {
  const updateData: Record<string, any> = { status, updated_at: new Date().toISOString() }
  if (answerSessionId) {
    updateData.answer_session_id = answerSessionId
  }

  const { error } = await supabase
    .from('round2_questions')
    .update(updateData)
    .eq('id', questionId)

  if (error) throw error

  // Update answered_questions count in question_rounds
  if (status === 'answered') {
    const { data: question } = await supabase
      .from('round2_questions')
      .select('round_id')
      .eq('id', questionId)
      .single()

    if (question?.round_id) {
      const { data: answeredCount } = await supabase
        .from('round2_questions')
        .select('id', { count: 'exact' })
        .eq('round_id', question.round_id)
        .eq('status', 'answered')

      await supabase
        .from('question_rounds')
        .update({ answered_questions: answeredCount?.length || 0 })
        .eq('id', question.round_id)
    }
  }
}

/**
 * Skip a question
 */
export async function skipQuestion(questionId: string): Promise<void> {
  return updateQuestionStatus(questionId, 'skipped')
}

/**
 * Get round 2 progress stats
 */
export async function getRound2Progress(projectId: string): Promise<{
  total: number
  answered: number
  skipped: number
  pending: number
}> {
  try {
    const questions = await getRound2Questions(projectId)

    return {
      total: questions.length,
      answered: questions.filter(q => q.status === 'answered').length,
      skipped: questions.filter(q => q.status === 'skipped').length,
      pending: questions.filter(q => q.status === 'pending').length,
    }
  } catch (e) {
    console.warn('getRound2Progress failed:', e)
    return { total: 0, answered: 0, skipped: 0, pending: 0 }
  }
}

/**
 * Check if project has enough first round answers for analysis
 */
export async function checkFirstRoundReadiness(projectId: string): Promise<{
  ready: boolean
  currentCount: number
  requiredCount: number
}> {
  try {
    // 简化查询：只统计有转录文本的回答数量
    const { data, error, count } = await supabase
      .from('answer_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .not('transcript_text', 'is', null)

    if (error) {
      console.warn('checkFirstRoundReadiness error:', error.message)
      return { ready: false, currentCount: 0, requiredCount: 3 }
    }

    const currentCount = count || 0
    const requiredCount = 3

    return {
      ready: currentCount >= requiredCount,
      currentCount,
      requiredCount,
    }
  } catch (e) {
    console.warn('checkFirstRoundReadiness failed:', e)
    return { ready: false, currentCount: 0, requiredCount: 3 }
  }
}

/**
 * Get question type label in Chinese
 */
export function getQuestionTypeLabel(type: Round2Question['question_type']): string {
  const labels: Record<string, string> = {
    conflict: '冲突',
    sensory: '感官',
    quote: '金句',
    general: '补充',
  }
  return labels[type] || type
}

/**
 * Get question type color
 */
export function getQuestionTypeColor(type: Round2Question['question_type']): string {
  const colors: Record<string, string> = {
    conflict: '#dc2626', // red
    sensory: '#2563eb', // blue
    quote: '#7c3aed', // purple
    general: '#64748b', // gray
  }
  return colors[type] || colors.general
}
