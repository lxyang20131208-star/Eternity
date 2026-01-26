import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { content, style } = await request.json()

    if (!content || !style) {
      return NextResponse.json(
        { error: 'Missing required fields: content, style' },
        { status: 400 }
      )
    }

    // 文风配置
    const stylePrompts: Record<string, string> = {
      'default': '用经典传记的平衡叙事风格，兼顾文学性与可读性。',
      'hemingway': '用海明威的风格：简洁有力，冰山理论，用最少的文字传达最深的情感。避免过多的修饰词，用简单的动词和名词，让情感隐含在细节中。',
      'capote': '用杜鲁门·卡波特的风格：温情细腻，如《圣诞忆旧集》般温暖怀旧的笔触。注重感官细节，用温暖的语调回忆往事。',
      'zweig': '用斯蒂芬·茨威格的风格：深入人物内心，细腻的心理描写，戏剧性的转折。关注��感变化和心理活动。',
      'zhangailing': '用张爱玲的风格：华丽苍凉，独特的比喻，对人性幽微处的洞察。用精致的语言表达岁月的流逝和记忆的珍贵。',
      'didion': '用琼·狄迪恩的风格：冷静克制，精确观察，在平静叙述中蕴含深情。用客观冷静的语调叙述，但情感深沉。',
      'kundera': '用米兰·昆德拉的风格：哲思深邃，在叙事中穿插对生命本质的思考。将个人经历上升到哲学思考。',
      'fitzgerald': '用F·斯科特·菲茨杰拉德的风格：诗意浪漫，华美的语言，对时代与梦想的追忆。用诗意的语言和浪漫的情怀。',
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 400 })
    }

    const systemPrompt = `你是一位专业的传记作家。${stylePrompts[style] || stylePrompts['default']}

请根据用户输入的内容，用指定的文风改写成一篇传记章节。

要求：
1. 保留原文的核心内容和情感
2. 用指定的文风进行改写，让文字更有文学性
3. 字数控制在原文的0.8-1.2倍之间
4. 必须返回纯JSON格式：{"title": "章节标题", "content": "改写后的内容"}
5. 标题要简洁有力，符合章节风格，不超过10个字
6. 内容要分段，用双换行符\\n\\n分隔段落
7. 不要添加原文没有的信息
8. 保持第一人称叙述`

    const userPrompt = `请将以下内容改写成传记章节：\n\n${content}`

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json'
        }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    // 尝试解析 JSON
    let result
    try {
      // 清理可能的 markdown 代码块标记
      const cleanedText = responseText.replace(/^```json\n?|\n?```$/g, '').trim()
      result = JSON.parse(cleanedText)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.error('Response text:', responseText)
      // 如果解析失败，返回默认格式
      result = {
        title: '第一章',
        content: content
      }
    }

    return NextResponse.json({
      title: result.title || '第一章',
      content: result.content || content,
    })
  } catch (error: any) {
    console.error('AI rewrite error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
