// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface ChapterAnalysis {
  chapter_name: string
  has_conflicts: boolean
  has_sensory_details: boolean
  has_quotes: boolean
  conflicts_found: Array<{ text: string; strength: string }>
  sensory_details_found: Array<{ text: string; type: string }>
  quotes_found: Array<{ text: string; speaker: string }>
  missing_elements: Array<{ type: string; description: string; severity: string }>
}

interface AnalysisResult {
  chapters: ChapterAnalysis[]
  overall_score: {
    conflict: number
    sensory: number
    quote: number
  }
  suggested_question_count: number
}

interface GeneratedQuestion {
  question_text: string
  question_text_en: string
  question_type: 'conflict' | 'sensory' | 'quote' | 'general'
  related_chapter: string
  missing_element_description: string
  media_prompt: string
  suggested_media_type: 'photo' | 'video' | 'both' | 'none'
  priority: number
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 分析内容缺失并生成第二轮问题
 */
async function analyzeAndGenerateQuestions(
  apiKey: string,
  model: string,
  transcripts: Array<{ chapter: string; text: string; question_id: string }>,
  languageRule: string
): Promise<{ analysis: AnalysisResult; questions: GeneratedQuestion[] }> {

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  // 按章节组织内容
  const chapterContents: Record<string, string[]> = {}
  transcripts.forEach(t => {
    const ch = t.chapter || '未分章节'
    if (!chapterContents[ch]) chapterContents[ch] = []
    chapterContents[ch].push(t.text)
  })

  const contentByChapter = Object.entries(chapterContents)
    .map(([ch, texts]) => `【${ch}】\n${texts.join('\n---\n')}`)
    .join('\n\n========\n\n')

  const isChineseOutput = languageRule === 'zh-CN'

  const prompt = isChineseOutput ? `
你是一位资深传记文学主编，负责分析口述历史的内容质量。

你的任务是：
1. 分析以下按章节组织的访谈记录
2. 评估每个章节是否包含足够的：
   - **冲突(Conflict)**：内心挣扎、人际冲突、与环境的冲突、关键转折点
   - **感官细节(Sensory details)**：视觉、听觉、嗅觉、触觉、味觉的描写
   - **金句(Quotes)**：有力量的原话、感人的表达、独特的见解
3. 基于缺失的内容，生成补充问题

【重要】问题数量规则：
- 每个章节至少生成 5 个相关问题
- 总问题数量在 30-40 个之间
- 确保每种类型（冲突、感官细节、金句）都有充足的问题
- 问题要具体、深入，能够挖掘出生动的细节

请输出以下 JSON 格式（不要输出任何其他内容）：` : `
You are a senior biographical editor responsible for analyzing the quality of oral history content.

Your task is:
1. Analyze the following interview records organized by chapter
2. Evaluate whether each chapter contains enough of:
   - **Conflicts**: Internal struggles, interpersonal conflicts, conflicts with environment, turning points
   - **Sensory Details**: Descriptions of sight, sound, smell, touch, taste
   - **Quotes**: Powerful original quotes, moving expressions, unique insights
3. Based on missing content, generate supplementary questions

【Important】Question count rules:
- Generate at least 5 relevant questions per chapter
- Total question count between 30-40
- Ensure sufficient questions for each type (conflict, sensory details, quotes)
- Questions must be specific and deep, capable of uncovering vivid details

Output in the following JSON format (do not output anything else):`
{
  "analysis": {
    "chapters": [
      {
        "chapter_name": "章节名",
        "has_conflicts": true,
        "has_sensory_details": false,
        "has_quotes": true,
        "conflicts_found": [{"text": "找到的冲突描述", "strength": "strong"}],
        "sensory_details_found": [{"text": "找到的细节", "type": "visual"}],
        "quotes_found": [{"text": "金句内容", "speaker": "说话者"}],
        "missing_elements": [{"type": "sensory", "description": "缺少对环境的感官描写", "severity": "high"}]
      }
    ],
    "overall_score": {
      "conflict": 75,
      "sensory": 30,
      "quote": 60
    },
    "suggested_question_count": 5
  },
  "questions": [
    {
      "question_text": "补充问题（中文）",
      "question_text_en": "Supplementary question (English)",
      "question_type": "sensory",
      "related_chapter": "关联章节名",
      "missing_element_description": "这个问题要补充什么缺失内容",
      "media_prompt": "建议上传：描述当时场景的照片，或相关人物的合影",
      "suggested_media_type": "photo",
      "priority": 8
    }
  ]
}

问题设计原则：
1. **冲突类问题**：挖掘内心矛盾、关键决策时刻、与他人的分歧
   - 例："在那个决定离开的夜晚，你内心经历了怎样的挣扎？"
   - 例："当父母反对时，你是如何说服他们的？中间有过争执吗？"

2. **感官细节类问题**：唤起具体的感官记忆
   - 例："那个房间是什么样子的？阳光从哪边照进来？有什么特别的味道？"
   - 例："当时你穿着什么？那件衣服摸起来是什么感觉？"

3. **金句类问题**：引出原汁原味的表达
   - 例："你还记得当时他/她说了什么原话吗？用的是什么语气？"
   - 例："如果用一句话总结那段经历，你会怎么说？"

访谈记录：
${contentByChapter}
` : `
You are a senior biography editor analyzing oral history content quality.

Your task:
1. Analyze the interview transcripts organized by chapter
2. Evaluate each chapter for:
   - **Conflict**: Internal struggles, interpersonal conflicts, environmental conflicts, turning points
   - **Sensory details**: Visual, auditory, olfactory, tactile, gustatory descriptions
   - **Quotes**: Powerful original words, touching expressions, unique insights
3. Generate follow-up questions based on missing content

【Important】Question count rules:
- Generate at least 5 questions per chapter
- Total questions should be 30-40
- Ensure sufficient questions for each type (conflict, sensory, quotes)
- Questions should be specific and deep to elicit vivid details

Output ONLY the following JSON format:
{
  "analysis": {
    "chapters": [
      {
        "chapter_name": "Chapter name",
        "has_conflicts": true,
        "has_sensory_details": false,
        "has_quotes": true,
        "conflicts_found": [{"text": "conflict description", "strength": "strong"}],
        "sensory_details_found": [{"text": "detail found", "type": "visual"}],
        "quotes_found": [{"text": "quote content", "speaker": "speaker"}],
        "missing_elements": [{"type": "sensory", "description": "what's missing", "severity": "high"}]
      }
    ],
    "overall_score": {
      "conflict": 75,
      "sensory": 30,
      "quote": 60
    },
    "suggested_question_count": 5
  },
  "questions": [
    {
      "question_text": "补充问题（中文）",
      "question_text_en": "Supplementary question (English)",
      "question_type": "sensory",
      "related_chapter": "Related chapter name",
      "missing_element_description": "What this question aims to supplement",
      "media_prompt": "Suggested: Upload photos of the scene or people involved",
      "suggested_media_type": "photo",
      "priority": 8
    }
  ]
}

Interview transcripts:
${contentByChapter}
`

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  }

  let retries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(`${url}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`Gemini API error: ${resp.status} - ${errText}`)
      }

      const respJson = await resp.json()
      const rawText = respJson?.candidates?.[0]?.content?.parts?.[0]?.text || ""
      const cleanedText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()

      return JSON.parse(cleanedText)
    } catch (e: any) {
      lastError = e
      console.error(`Attempt ${attempt} failed:`, e.message)
      if (attempt < retries) {
        await sleep(2000 * attempt)
      }
    }
  }

  throw lastError || new Error("Failed to analyze content after retries")
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { project_id, language_rule = 'zh-CN' } = body

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Auth check
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash-exp"

    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user owns project
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", project_id)
      .eq("owner_id", user.id)
      .maybeSingle()

    if (projErr || !project) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fetch first round answers with question info
    const { data: sessions, error: sessErr } = await supabase
      .from("answer_sessions")
      .select("id, question_id, transcript_text, created_at")
      .eq("project_id", project_id)
      .or("round_number.eq.1,round_number.is.null")
      .not("transcript_text", "is", null)
      .order("created_at", { ascending: true })

    if (sessErr) throw sessErr

    if (!sessions || sessions.length < 3) {
      return new Response(
        JSON.stringify({
          error: "至少需要 3 个第一轮回答才能分析",
          min_required: 3,
          current: sessions?.length || 0
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get question details for chapters
    const questionIds = [...new Set(sessions.map(s => s.question_id))]
    const { data: questions } = await supabase
      .from("questions")
      .select("id, chapter")
      .in("id", questionIds)

    const questionChapterMap: Record<string, string> = {}
    questions?.forEach(q => {
      questionChapterMap[String(q.id)] = q.chapter || '未分章节'
    })

    // Prepare transcripts
    const transcripts = sessions.map(s => ({
      chapter: questionChapterMap[String(s.question_id)] || '未分章节',
      text: s.transcript_text || '',
      question_id: String(s.question_id)
    }))

    // Analyze and generate questions
    const { analysis, questions: generatedQuestions } = await analyzeAndGenerateQuestions(
      geminiApiKey,
      geminiModel,
      transcripts,
      language_rule
    )

    // Delete existing round 2 data (for re-analysis)
    // First delete round2_questions (they reference question_rounds)
    await supabase
      .from("round2_questions")
      .delete()
      .eq("project_id", project_id)

    // Delete content_analysis
    await supabase
      .from("content_analysis")
      .delete()
      .eq("project_id", project_id)

    // Delete question_rounds for round 2
    await supabase
      .from("question_rounds")
      .delete()
      .eq("project_id", project_id)
      .eq("round_number", 2)

    // Create round record
    const { data: round, error: roundErr } = await supabase
      .from("question_rounds")
      .insert({
        project_id,
        round_number: 2,
        status: 'active',
        total_questions: generatedQuestions.length,
        answered_questions: 0
      })
      .select()
      .single()

    if (roundErr) throw roundErr

    // Save analysis
    const { data: analysisRecord, error: analysisErr } = await supabase
      .from("content_analysis")
      .insert({
        project_id,
        round_id: round.id,
        analysis_json: analysis,
        analyzed_sessions_count: sessions.length,
        total_transcript_chars: transcripts.reduce((sum, t) => sum + t.text.length, 0),
        ai_model_used: geminiModel,
        status: 'done'
      })
      .select()
      .single()

    if (analysisErr) throw analysisErr

    // Save generated questions (with deduplication)
    const validMediaTypes = ['photo', 'video', 'both', 'none']
    const validQuestionTypes = ['conflict', 'sensory', 'quote', 'general']

    // Deduplicate questions by question_text
    const seenTexts = new Set<string>()
    const uniqueQuestions = generatedQuestions.filter(q => {
      const text = (q.question_text || '').trim().toLowerCase()
      if (!text || seenTexts.has(text)) {
        return false
      }
      seenTexts.add(text)
      return true
    })

    const questionsToInsert = uniqueQuestions.map((q, idx) => ({
      project_id,
      round_id: round.id,
      question_text: q.question_text || '补充问题',
      question_text_en: q.question_text_en || null,
      question_type: validQuestionTypes.includes(q.question_type) ? q.question_type : 'general',
      related_chapter: q.related_chapter || null,
      missing_element_description: q.missing_element_description || null,
      media_prompt: q.media_prompt || null,
      suggested_media_type: validMediaTypes.includes(q.suggested_media_type) ? q.suggested_media_type : 'none',
      priority: q.priority || (uniqueQuestions.length - idx),
      status: 'pending'
    }))

    const { data: insertedQuestions, error: qErr } = await supabase
      .from("round2_questions")
      .insert(questionsToInsert)
      .select()

    if (qErr) throw qErr

    // Update round with actual question count after deduplication
    await supabase
      .from("question_rounds")
      .update({ total_questions: uniqueQuestions.length })
      .eq("id", round.id)

    return new Response(
      JSON.stringify({
        success: true,
        round_id: round.id,
        analysis_id: analysisRecord.id,
        analysis: analysis,
        questions: insertedQuestions,
        question_count: uniqueQuestions.length
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (e: any) {
    console.error("Error:", e)
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
