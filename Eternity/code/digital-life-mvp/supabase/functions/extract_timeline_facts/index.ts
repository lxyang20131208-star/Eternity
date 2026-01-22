// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TimelineFact {
  quote: string
  summary: string
  inferred_year?: number
  age_mentioned?: number
  stage_mentioned?: string
  confidence: number
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

    // 获取出生年份
    const { data: project } = await supabase
      .from('projects')
      .select('birth_year')
      .eq('id', projectId)
      .single()

    const birthYear = project?.birth_year

    // 获取回答
    const { data: sessions, error } = await supabase
      .from('answer_sessions')
      .select('id, question_id, transcript_text')
      .eq('project_id', projectId)
      .not('transcript_text', 'is', null)
      .limit(100)

    if (error) throw error
    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        extracted: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const answersText = sessions.map(s => s.transcript_text).join('\n\n')

    const prompt = `你是时间轴事实抽取专家。从回答中提取所有可定位在时间线上的事件。

${birthYear ? `用户出生年份: ${birthYear}` : ''}

要求：
1. 提取时间表达式：
   - 明确日期："2008年"、"2008年6月"
   - 年龄表达："七岁时"、"20岁那年"${birthYear ? '（转换为年份）' : ''}
   - 阶段表达："小学时"、"大学期间"
2. 每个事实包含：
   - quote: 原文引用（<200字）
   - summary: 一句话摘要
   - inferred_year: 推断年份（如有）
   - age_mentioned: 提到的年龄（如有）
   - stage_mentioned: 提到的阶段（如有）
   - confidence: 0.0-1.0

回答内容：
${answersText}

仅返回JSON数组：
[
  {
    "quote": "我七岁上的小学...",
    "summary": "开始上小学",
    "inferred_year": ${birthYear ? birthYear + 7 : 'null'},
    "age_mentioned": 7,
    "stage_mentioned": "小学",
    "confidence": 0.9
  }
]`

    let facts: TimelineFact[] = []
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      facts = JSON.parse(jsonMatch[0])
    }

    let inserted = 0
    for (const fact of facts) {
      const session = sessions[0] // 简化版：关联第一个session
      const inferredStart = fact.inferred_year ? new Date(fact.inferred_year, 0, 1).toISOString() : null
      const timePrecision = fact.inferred_year ? 'year' : 'fuzzy'

      const { data: timeRef, error: timeRefError } = await supabase
        .from('time_refs')
        .insert({
          project_id: projectId,
          type: inferredStart ? 'exact' : 'fuzzy',
          start_date: inferredStart,
          end_date: null,
          text: fact.summary || fact.quote,
          confidence: fact.confidence ?? 0.5
        })
        .select('id')
        .single()

      if (timeRefError) throw timeRefError

      await supabase.from('events').insert({
        project_id: projectId,
        title: fact.summary || '未命名事件',
        summary: fact.summary,
        time_ref_id: timeRef?.id ?? null,
        tags: [],
        evidence: [
          {
            text: fact.quote,
            source: 'timeline_extract',
            confidence: fact.confidence ?? 0.5
          }
        ],
        verified: false,
        metadata: {
          source: 'timeline_fact_extracts',
          time_precision: timePrecision,
          age_mentioned: fact.age_mentioned ?? null,
          stage_mentioned: fact.stage_mentioned ?? null
        }
      })

      await supabase.from('timeline_fact_extracts').insert({
        project_id: projectId,
        question_id: session.question_id,
        answer_session_id: session.id,
        quote: fact.quote,
        summary: fact.summary,
        inferred_time_start: inferredStart,
        time_precision: timePrecision,
        age_mentioned: fact.age_mentioned,
        stage_mentioned: fact.stage_mentioned,
        confidence: fact.confidence,
        status: 'inferred'
      })
      inserted++
    }

    return new Response(JSON.stringify({
      success: true,
      extracted: facts.length,
      inserted
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[Extract Timeline] Error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
