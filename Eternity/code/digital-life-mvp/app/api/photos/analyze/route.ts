import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const geminiApiKey = process.env.GEMINI_API_KEY!

export async function POST(req: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // 获取请求数据
    const formData = await req.formData()
    const imageFile = formData.get('image') as File | null
    const imageUrl = formData.get('imageUrl') as string | null

    if (!imageFile && !imageUrl) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      )
    }

    console.log('[Photo Analyze] Starting analysis...')

    // 获取图片数据
    let base64Image: string
    let mimeType: string

    if (imageFile) {
      // 从文件获取
      const arrayBuffer = await imageFile.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      base64Image = btoa(binary)
      mimeType = imageFile.type || 'image/jpeg'
    } else if (imageUrl) {
      // 从 URL 获取
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch image from URL' },
          { status: 400 }
        )
      }
      const imageBlob = await imageResponse.blob()
      const arrayBuffer = await imageBlob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      base64Image = btoa(binary)
      mimeType = imageBlob.type || 'image/jpeg'
    } else {
      return NextResponse.json({ error: 'No valid image source' }, { status: 400 })
    }

    console.log('[Photo Analyze] Image loaded, size:', base64Image.length, 'type:', mimeType)

    // 使用 Gemini Vision API 分析照片
    const model = 'gemini-2.0-flash-exp'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    const analysisPrompt = `请仔细分析这张照片，并以JSON格式返回以下信息：

{
  "description": "照片的详细描述（包括场景、人物、活动等）",
  "people_count": 照片中的人数,
  "people_description": "对照片中人物的描述（年龄、性别、关系猜测等）",
  "location_type": "地点类型（如：家庭、学校、公园、餐厅、旅游景点等）",
  "location_guess": "可能的地点名称或描述",
  "time_period": "照片可能拍摄的年代或时期（如：1990年代、2000年初等）",
  "occasion": "可能的场合或事件（如：生日聚会、毕业典礼、家庭聚餐、旅行等）",
  "emotions": "照片传达的情感或氛围",
  "keywords": ["关键词1", "关键词2", "关键词3"],
  "suggested_caption": "建议的照片描述文字"
}

注意：
1. 只返回JSON，不要有其他文字
2. 如果某项无法确定，请给出合理的猜测
3. 使用简体中文`

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: analysisPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generation_config: { 
        temperature: 0.3,
        response_mime_type: 'application/json',
      },
    }

    console.log('[Photo Analyze] Calling Gemini API...')

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
      console.error('[Photo Analyze] Gemini API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 500 }
      )
    }

    const result = await response.json()
    let analysisText = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    // 清理可能的 markdown 代码块标记
    analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let analysis: any
    try {
      analysis = JSON.parse(analysisText)
    } catch (e) {
      console.error('[Photo Analyze] Failed to parse JSON:', analysisText)
      // 尝试提取 JSON
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        return NextResponse.json(
          { error: 'Failed to parse analysis result', raw: analysisText },
          { status: 500 }
        )
      }
    }

    console.log('[Photo Analyze] Analysis result:', analysis)

    // 获取问题库
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('id, question_text, category')
      .in('scope', ['global', 'user'])
      .order('category', { ascending: true })

    if (questionsError) {
      console.error('[Photo Analyze] Failed to fetch questions:', questionsError)
      return NextResponse.json({ analysis, matchedQuestions: [] })
    }

    // 使用 Gemini 进行问题匹配
    const matchPrompt = `根据以下照片分析结果，从问题列表中选择最相关的5个问题。

照片分析：
${JSON.stringify(analysis, null, 2)}

问题列表：
${questions?.map((q, i) => `${i + 1}. [${q.id}] ${q.question_text}`).join('\n')}

请返回最相关的5个问题ID，按相关性从高到低排序。只返回JSON数组格式：
["question_id_1", "question_id_2", "question_id_3", "question_id_4", "question_id_5"]

选择标准：
1. 优先选择与照片场景、人物、活动直接相关的问题
2. 考虑照片可能记录的人生阶段或重要时刻
3. 如果照片涉及特定人物关系（如祖孙、父母子女），选择相关问题`

    const matchBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: matchPrompt }],
        },
      ],
      generation_config: { 
        temperature: 0.2,
        response_mime_type: 'application/json',
      },
    }

    const matchResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(matchBody),
    })

    let matchedQuestionIds: string[] = []
    if (matchResponse.ok) {
      const matchResult = await matchResponse.json()
      let matchText = matchResult?.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
      matchText = matchText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      
      try {
        matchedQuestionIds = JSON.parse(matchText)
      } catch (e) {
        console.error('[Photo Analyze] Failed to parse matched questions:', matchText)
      }
    }

    // 获取匹配的问题详情
    const matchedQuestions = questions
      ?.filter(q => matchedQuestionIds.includes(q.id))
      .sort((a, b) => matchedQuestionIds.indexOf(a.id) - matchedQuestionIds.indexOf(b.id))
      || []

    console.log('[Photo Analyze] Matched questions:', matchedQuestions.map(q => q.id))

    return NextResponse.json({
      analysis,
      matchedQuestions,
      suggestedCaption: analysis.suggested_caption || analysis.description,
    })

  } catch (error: any) {
    console.error('[Photo Analyze] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
