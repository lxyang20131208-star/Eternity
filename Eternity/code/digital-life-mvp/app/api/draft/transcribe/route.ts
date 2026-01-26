import { NextRequest, NextResponse } from 'next/server'

const geminiApiKey = process.env.GEMINI_API_KEY!

export async function POST(req: NextRequest) {
  try {
    // 获取音频数据
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      )
    }

    console.log('[Draft Transcribe] Starting transcription, file size:', audioFile.size, 'type:', audioFile.type)

    // 将文件转换为 base64
    const arrayBuffer = await audioFile.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    const base64Audio = btoa(binary)

    console.log('[Draft Transcribe] Audio converted to base64, length:', base64Audio.length)

    // 调用 Gemini API
    const model = 'gemini-2.0-flash-exp'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    const prompt =
      `请将以下音频转写成纯文本。\n` +
      `规则：\n` +
      `- 只输出转写的文本内容。\n` +
      `- 不要添加标题、项目符号或解释。\n` +
      `- 保持语音的原始语言。\n` +
      `- 对于中文内容：始终使用简体中文。\n` +
      `- 从头到尾转写完整的音频内容。`

    // 根据文件类型确定 MIME 类型，确保使用 Gemini 支持的格式
    let mimeType = audioFile.type || 'audio/webm'
    // 处理各种可能的 MIME 类型格式
    if (mimeType.includes('webm')) {
      mimeType = 'audio/webm'
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      mimeType = 'audio/mp4'
    } else if (mimeType.includes('wav')) {
      mimeType = 'audio/wav'
    } else if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      mimeType = 'audio/mp3'
    } else if (mimeType.includes('ogg')) {
      mimeType = 'audio/ogg'
    } else if (mimeType === 'application/octet-stream' || !mimeType) {
      // 如果是未知类型，默认使用 webm（浏览器录音最常见的格式）
      mimeType = 'audio/webm'
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
      generation_config: { temperature: 0 },
    }

    console.log('[Draft Transcribe] Calling Gemini API with mimeType:', mimeType)

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
      console.error('[Draft Transcribe] Gemini API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}`, details: errorText },
        { status: 500 }
      )
    }

    const result = await response.json()
    const transcript = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!transcript) {
      console.error('[Draft Transcribe] Empty transcript from Gemini')
      return NextResponse.json(
        { error: 'Empty transcript from Gemini' },
        { status: 500 }
      )
    }

    console.log('[Draft Transcribe] Transcription successful, length:', transcript.length)

    return NextResponse.json({ transcript })
  } catch (error: any) {
    console.error('[Draft Transcribe] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
