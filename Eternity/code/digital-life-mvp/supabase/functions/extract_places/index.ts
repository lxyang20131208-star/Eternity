// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractedPlace {
  place_text: string
  evidence_snippet: string
  confidence: number
  contexts: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json()
    if (!projectId) throw new Error('projectId is required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured')

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    console.log(`[Extract Places] Starting for project ${projectId}`)

    // 获取回答内容
    const { data: sessions, error } = await supabase
      .from('answer_sessions')
      .select('id, question_id, transcript_text')
      .eq('project_id', projectId)
      .not('transcript_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        extracted: 0,
        message: 'No answers found'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const answersText = sessions.map((s, idx) =>
      `[回答 ${idx + 1}]\n${s.transcript_text}`
    ).join('\n\n')

    const prompt = `你是地点抽取专家。从以下回答中提取所有提到的地点。

要求：
1. 识别所有地点：城市、国家、街道、建筑、景点等
2. 每个地点包含：
   - place_text: 地点原文
   - evidence_snippet: 证据片段（<100字）
   - confidence: 0.0-1.0
   - contexts: 出现该地点的上下文（最多3个）
3. 去重合并（如"北京"和"北京市"）
4. 排除模糊指代（如"那里"、"这边"）

回答内容：
${answersText}

仅返回JSON数组：
[
  {
    "place_text": "北京",
    "evidence_snippet": "我在北京上的大学...",
    "confidence": 0.95,
    "contexts": ["..."]
  }
]`

    let extractedPlaces: ExtractedPlace[] = []
    let retries = 0

    while (retries < 3) {
      try {
        const result = await model.generateContent(prompt)
        const responseText = result.response.text()
        const jsonMatch = responseText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          extractedPlaces = JSON.parse(jsonMatch[0])
          break
        } else {
          throw new Error('No valid JSON found')
        }
      } catch (error) {
        retries++
        if (retries >= 3) throw error
        await new Promise(resolve => setTimeout(resolve, 1000 * retries))
      }
    }

    let newPlaces = 0
    let updatedPlaces = 0

    for (const place of extractedPlaces) {
      try {
        const { data: existing } = await supabase
          .from('places')
          .select('id')
          .eq('project_id', projectId)
          .eq('name', place.place_text)
          .maybeSingle()

        if (!existing) {
          await supabase.from('places').insert({
            project_id: projectId,
            name: place.place_text,
            description: place.evidence_snippet,
            metadata: { contexts: place.contexts, confidence: place.confidence }
          })
          newPlaces++
        }
      } catch (err) {
        console.error(`Error processing place ${place.place_text}:`, err)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      extracted: extractedPlaces.length,
      newPlaces,
      updatedPlaces
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[Extract Places] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
