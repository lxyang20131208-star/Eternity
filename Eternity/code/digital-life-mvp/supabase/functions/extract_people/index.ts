// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractedPerson {
  name: string
  aliases?: string[]
  relationship?: string
  description?: string
  confidence: number
  mentions: number
  contexts: string[]
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json()

    if (!projectId) {
      throw new Error('projectId is required')
    }

    // Initialize Supabase client with service role (bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize Gemini AI
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured')
    }
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    console.log(`[Extract People] Starting extraction for project ${projectId}`)

    // 1. 从大纲中获取最新版本
    const { data: outlines, error: outlinesError } = await supabase
      .from('biography_outlines')
      .select('id, outline_json, version')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .not('outline_json', 'is', null)
      .order('version', { ascending: false })
      .limit(1)

    if (outlinesError) throw outlinesError

    if (!outlines || outlines.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          extracted: 0,
          newPeople: 0,
          updatedPeople: 0,
          message: 'No outlines found. Please generate an outline first.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const outline = outlines[0]
    const outlineJson = outline.outline_json

    // 2. 将大纲内容聚合为文本
    let outlineText = ''
    if (outlineJson.sections && Array.isArray(outlineJson.sections)) {
      outlineText = outlineJson.sections
        .map((section: any, idx: number) => {
          const bullets = Array.isArray(section.bullets) ? section.bullets.join('\n  - ') : ''
          return `[第 ${idx + 1} 章: ${section.title}]\n  - ${bullets}`
        })
        .join('\n\n')
    }

    if (!outlineText.trim()) {
      return new Response(
        JSON.stringify({
          success: true,
          extracted: 0,
          newPeople: 0,
          updatedPeople: 0,
          message: 'Outline is empty',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Extract People] Processing outline (${outlineText.length} chars)`)

    // 3. 构造AI提示词
    const prompt = `你是一个传记知识图谱专家。请从以下用户的传记大纲中，提取所有被提到的人物。

要求：
1. **以用户为中心**：用户是这个传记的主人公（"我"），请识别所有被提到的其他人物
2. **人物信息**：
   - name: 人物的姓名（尽可能完整）
   - aliases: 别称/昵称数组（如 ["妈妈", "母亲"]）
   - relationship: 与用户的关系（如"父亲"、"母亲"、"大学同学"等）
   - description: 一句话描述这个人（从上下文推断）
   - confidence: 置信度 0.0-1.0（明确提到全名的为高置信度）
   - mentions: 在大纲中提到的次数
   - contexts: 提到该人物的上下文片段（最多3个代表性片段，每个<100字）

3. **去重与合并**：
   - 同一个人的多种叫法应合并（如"妈妈"、"母亲"是同一人）
   - 不确定是否同一人时，可保留为多个实体

4. **排除模糊指代**：
   - 忽略泛指（如"大家"、"人们"）

**用户传记大纲：**
${outlineText}

请以 JSON 数组格式返回，仅返回JSON，不要其他文字：
[
  {
    "name": "李明",
    "aliases": ["小李", "李老师"],
    "relationship": "大学导师",
    "description": "计算机系教授，对我的职业生涯影响深远",
    "confidence": 0.9,
    "mentions": 3,
    "contexts": ["李老师在大学时...", "在李明的指导下..."]
  }
]`

    // 4. 调用 Gemini API
    let extractedPeople: ExtractedPerson[] = []
    let retries = 0
    const maxRetries = 3

    while (retries < maxRetries) {
      try {
        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        console.log(`[Extract People] AI Response (${responseText.length} chars)`)

        // 解析 JSON
        const jsonMatch = responseText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          extractedPeople = JSON.parse(jsonMatch[0])
          console.log(`[Extract People] Extracted ${extractedPeople.length} people`)
          break
        } else {
          throw new Error('No valid JSON array found in AI response')
        }
      } catch (error) {
        retries++
        console.error(`[Extract People] Attempt ${retries} failed:`, error.message)
        if (retries >= maxRetries) {
          throw new Error(`AI extraction failed after ${maxRetries} retries: ${error.message}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries))
      }
    }

    // 5. 插入/更新人物到数据库
    let newPeopleCount = 0
    let updatedPeopleCount = 0

    for (const person of extractedPeople) {
      try {
        // 检查人物是否已存在
        const { data: existing } = await supabase
          .from('people')
          .select('id, name, aliases, importance_score, confidence_score')
          .eq('project_id', projectId)
          .eq('name', person.name)
          .maybeSingle()

        if (existing) {
          // 更新现有人物
          const updatedAliases = Array.from(
            new Set([...(existing.aliases || []), ...(person.aliases || [])])
          )
          const updatedScore = (existing.importance_score || 0) + person.mentions

          await supabase
            .from('people')
            .update({
              aliases: updatedAliases,
              relationship_to_user: person.relationship || existing.relationship_to_user,
              bio_snippet: person.description || existing.bio_snippet,
              importance_score: updatedScore,
              confidence_score: Math.max(person.confidence, existing.confidence_score || 0),
              extraction_status: 'confirmed',
            })
            .eq('id', existing.id)

          updatedPeopleCount++
          console.log(`[Extract People] Updated: ${person.name}`)
        } else {
          // 插入新人物
          const { error: insertError } = await supabase.from('people').insert({
            project_id: projectId,
            name: person.name,
            aliases: person.aliases || [],
            relationship_to_user: person.relationship,
            bio_snippet: person.description,
            importance_score: person.mentions,
            confidence_score: person.confidence,
            extraction_status: 'pending',
            metadata: {
              contexts: person.contexts,
              extracted_from: 'outline',
              outline_version: outline.version,
              extracted_at: new Date().toISOString(),
            },
          })

          if (insertError) {
            console.error(`[Extract People] Error inserting ${person.name}:`, insertError)
          } else {
            newPeopleCount++
            console.log(`[Extract People] Inserted: ${person.name}`)
          }
        }
      } catch (personError) {
        console.error(`[Extract People] Error processing person ${person.name}:`, personError)
      }
    }

    console.log(`[Extract People] Completed: ${newPeopleCount} new, ${updatedPeopleCount} updated`)

    return new Response(
      JSON.stringify({
        success: true,
        extracted: extractedPeople.length,
        newPeople: newPeopleCount,
        updatedPeople: updatedPeopleCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Extract People] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
