import { NextRequest, NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp'

type PolishAction = 'fix_grammar' | 'expand' | 'shorten' | 'translate_en' | 'translate_zh' | 'improve_style' | 'remove_fillers'

const actionPrompts: Record<PolishAction, (text: string) => string> = {
  fix_grammar: (text) => `Fix any spelling and grammar errors in the following text. Keep the original meaning and tone. Only output the corrected text, no explanations.\n\nText: "${text}"`,

  expand: (text) => `Expand the following text to be more detailed and descriptive. Add specific details, emotions, and context while keeping the original voice. Output only the expanded text.\n\nText: "${text}"`,

  shorten: (text) => `Condense the following text to be more concise while keeping the key information and emotional essence. Output only the shortened text.\n\nText: "${text}"`,

  translate_en: (text) => `Translate the following text to English. Keep the tone and style. Output only the translation.\n\nText: "${text}"`,

  translate_zh: (text) => `将以下文本翻译成简体中文。保持语气和风格。只输出翻译后的文本。\n\n文本: "${text}"`,

  improve_style: (text) => `Improve the writing style of the following text to be more engaging and literary, like a professional biography. Keep the same meaning and facts. Output only the improved text.\n\nText: "${text}"`,

  remove_fillers: (text) => `Remove filler words and verbal tics (like "um", "uh", "like", "you know", "嗯", "啊", "那个", "就是") from the following text while keeping the meaning intact. Output only the cleaned text.\n\nText: "${text}"`,
}

export async function POST(req: NextRequest) {
  try {
    const { text, action } = await req.json()

    if (!text || !action) {
      return NextResponse.json({ error: 'Missing text or action' }, { status: 400 })
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
    }

    const promptFn = actionPrompts[action as PolishAction]
    if (!promptFn) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const prompt = promptFn(text)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API error:', errText)
      return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
    }

    const data = await response.json()
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Clean up any quotes that might wrap the result
    const cleanResult = result.replace(/^["']|["']$/g, '').trim()

    return NextResponse.json({ result: cleanResult })
  } catch (error: any) {
    console.error('Polish API error:', error)
    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 })
  }
}
