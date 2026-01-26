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

export async function POST(req: NextRequest) {
  try {
    // Verify session
    const userId = await verifyElderSession(req)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const questionId = formData.get('question_id') as string
    const audioFile = formData.get('audio_file') as File
    const durationMs = parseInt(formData.get('duration_ms') as string || '0')

    if (!questionId || !audioFile) {
      return NextResponse.json(
        { error: 'Missing question_id or audio_file' },
        { status: 400 }
      )
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large (max 50MB)' },
        { status: 400 }
      )
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

    // Upload audio to storage
    const timestamp = Date.now()
    const fileName = `${projectId}/${questionId}/${timestamp}.webm`

    console.log('[API upload] Uploading audio:', fileName, 'Size:', audioFile.size)

    const { error: uploadError } = await supabase.storage
      .from('audio_files')
      .upload(fileName, audioFile, {
        contentType: audioFile.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('[API upload] Upload error:', uploadError)
      throw uploadError
    }

    // Create answer session record
    const { data: session, error: sessionError } = await supabase
      .from('answer_sessions')
      .insert({
        project_id: projectId,
        question_id: questionId,
        audio_file_path: fileName,
        duration_seconds: Math.round(durationMs / 1000),
        status: 'uploaded',
        recording_method: 'elder_entry',
      })
      .select()
      .single()

    if (sessionError) {
      console.error('[API upload] Session creation error:', sessionError)
      throw sessionError
    }

    console.log('[API upload] Upload successful:', session.id)

    // Note: Transcription will be triggered by the existing system
    // No need to manually trigger it here

    return NextResponse.json({
      answer_id: session.id,
      audio_url: fileName,
      status: 'uploaded',
    })
  } catch (error: any) {
    console.error('[API upload] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
