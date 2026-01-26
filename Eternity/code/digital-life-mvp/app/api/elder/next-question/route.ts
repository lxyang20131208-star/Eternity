import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

async function verifyElderSession(req: NextRequest) {
  const sessionToken = req.cookies.get('elder_session')?.value

  if (!sessionToken) {
    return null
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET)
    const { payload } = await jwtVerify(sessionToken, secret)
    return payload.userId as string
  } catch (error) {
    console.error('[verifyElderSession] Invalid session:', error)
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    // Verify session
    const userId = await verifyElderSession(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user's project
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (!projects || projects.length === 0) {
      return NextResponse.json({ error: 'No project found' }, { status: 404 })
    }

    const projectId = projects[0].id

    // Get all questions (global + user-specific)
    const { data: allQuestions } = await supabase
      .from('questions')
      .select('id, text, chapter')
      .or(`scope.eq.global,and(scope.eq.user,owner_user_id.eq.${userId})`)
      .order('chapter', { ascending: true })

    if (!allQuestions || allQuestions.length === 0) {
      return NextResponse.json({ error: 'No questions found' }, { status: 404 })
    }

    // Get answered questions
    const { data: answeredSessions } = await supabase
      .from('answer_sessions')
      .select('question_id')
      .eq('project_id', projectId)
      .not('audio_file_path', 'is', null)

    const answeredQuestionIds = new Set(
      (answeredSessions || []).map(s => s.question_id)
    )

    // Find first unanswered question
    const unansweredQuestions = allQuestions.filter(
      q => !answeredQuestionIds.has(q.id)
    )

    if (unansweredQuestions.length === 0) {
      return NextResponse.json({
        done: true,
        message: '所有问题都已回答完毕！',
        total_count: allQuestions.length,
        answered_count: answeredQuestionIds.size,
      })
    }

    const nextQuestion = unansweredQuestions[0]

    return NextResponse.json({
      question_id: nextQuestion.id,
      question_text: nextQuestion.text,
      question_order: allQuestions.findIndex(q => q.id === nextQuestion.id) + 1,
      already_done_count: answeredQuestionIds.size,
      remaining_count: unansweredQuestions.length,
      total_count: allQuestions.length,
    })
  } catch (error: any) {
    console.error('[API next-question] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
