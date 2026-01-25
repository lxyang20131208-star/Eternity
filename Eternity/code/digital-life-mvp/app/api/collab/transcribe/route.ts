import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const geminiApiKey = process.env.GEMINI_API_KEY!

export async function POST(req: NextRequest) {
  try {
    const { commentId, audioStoragePath } = await req.json()

    console.log('[API transcribe] Starting transcription for comment:', commentId)

    if (!commentId || !audioStoragePath) {
      return NextResponse.json(
        { error: 'Missing commentId or audioStoragePath' },
        { status: 400 }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Download audio from storage
    const { data: audioData, error: downloadError } = await supabase.storage
      .from('collab-audio')
      .download(audioStoragePath)

    if (downloadError || !audioData) {
      console.error('[API transcribe] Download error:', downloadError)
      return NextResponse.json(
        { error: 'Failed to download audio' },
        { status: 500 }
      )
    }

    console.log('[API transcribe] Audio downloaded, size:', audioData.size)

    // Convert blob to base64
    const arrayBuffer = await audioData.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64Audio = btoa(binary)

    console.log('[API transcribe] Audio converted to base64, length:', base64Audio.length)

    // Call Gemini API
    const model = 'gemini-2.0-flash-exp'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    const prompt =
      `Please transcribe the following audio into plain text.\n` +
      `Rules:\n` +
      `- Output ONLY the transcript text.\n` +
      `- Do NOT add titles, bullet points, or explanations.\n` +
      `- Keep the original language of the speech (e.g., English stays English).\n` +
      `- For Chinese content: Always use Simplified Chinese (简体中文).\n` +
      `- Transcribe the ENTIRE audio from beginning to end.`

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'audio/m4a',
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generation_config: { temperature: 0 },
    }

    console.log('[API transcribe] Calling Gemini API...')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[API transcribe] Gemini API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 500 }
      )
    }

    const result = await response.json()
    const transcript = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!transcript) {
      return NextResponse.json(
        { error: 'Empty transcript from Gemini' },
        { status: 500 }
      )
    }

    console.log('[API transcribe] Transcription successful, length:', transcript.length)

    // Update comment with transcript
    const { error: updateError } = await supabase
      .from('collab_comments')
      .update({ transcript_text: transcript })
      .eq('id', commentId)

    if (updateError) {
      console.error('[API transcribe] Failed to update comment:', updateError)
      return NextResponse.json(
        { error: 'Failed to update comment' },
        { status: 500 }
      )
    }

    return NextResponse.json({ transcript })
  } catch (error: any) {
    console.error('[API transcribe] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
