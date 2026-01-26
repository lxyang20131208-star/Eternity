// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type AuthorStyle =
  | 'hemingway'      // 海明威 - 简洁有力
  | 'capote'         // 卡波特 - 温情细腻
  | 'zweig'          // 茨威格 - 心理描写
  | 'zhangailing'    // 张爱玲 - 华丽苍凉
  | 'didion'         // 琼·狄迪恩 - 冷静克制
  | 'kundera'        // 米兰·昆德拉 - 哲思深邃
  | 'fitzgerald'     // 菲茨杰拉德 - 诗意浪漫
  | 'default'        // 默认风格

interface StylePrefs {
  tone?: string // e.g., "professional", "casual", "narrative"
  depth?: string // e.g., "brief", "detailed", "comprehensive"
  chapters?: string[] // Focus on specific chapters
  languageRule?: string // "zh-CN" | "en"
  authorStyle?: AuthorStyle
}

// Author style prompts for Chinese output
const AUTHOR_STYLE_PROMPTS_ZH: Record<AuthorStyle, string> = {
  default: `你是一位获得过文学大奖的传记作家，你的作品以细腻的人物刻画、生动的场景描写和深刻的人性洞察著称。`,

  hemingway: `你是海明威风格的传记作家。你的写作特点：
- **冰山理论**：用最少的文字传达最深的情感，八分之七的内涵藏在水面之下
- **简洁有力**：短句为主，避免华丽辞藻，让每个词都有分量
- **克制情感**：不直接描写情感，而是通过动作、对话、场景让情感自然流露
- **硬汉叙事**：面对困难时的坚韧，用朴素的语言写出人的尊严
- 示例：「他走进房间。窗外在下雨。他坐下来，点了根烟。很久没有人说话。」`,

  capote: `你是卡波特风格的传记作家，如同《圣诞忆旧集》般温暖怀旧。你的写作特点：
- **温情脉脉**：用最温柔的笔触描写普通人的生活，让平凡变得动人
- **童年视角**：保留孩子般的纯真与好奇，在回忆中寻找温暖
- **感官细腻**：食物的香气、阳光的温度、老房子的气息——这些细节构成记忆的质感
- **怀旧氛围**：时光流逝的忧伤与美好交织，既有甜蜜也有淡淡的哀愁
- 示例：「那个冬天的早晨，厨房里飘着烤饼干的香气。阳光透过结霜的窗户洒进来，在地板上画出一片金色。外婆的围裙上沾着面粉，她的笑容是我童年最温暖的记忆。」`,

  zweig: `你是茨威格风格的传记作家。你的写作特点：
- **心理深度**：深入人物内心最隐秘的角落，揭示复杂的心理活动
- **戏剧张力**：人生的关键时刻被放大、被细细剖析，每个决定都充满戏剧性
- **命运感**：个人命运与时代洪流交织，小人物也有史诗般的重量
- **情感激荡**：激情、绝望、迷狂——人类情感的极端状态被细腻呈现
- 示例：「那一刻，他感到心脏在胸腔里剧烈跳动。多年来压抑的情感如同决堤的洪水，冲破了理智筑起的所有堤坝。他知道，从这一刻起，他的人生将走向一个完全不同的方向。」`,

  zhangailing: `你是张爱玲风格的传记作家。你的写作特点：
- **华丽苍凉**：语言绚烂如锦缎，底色却是彻骨的苍凉
- **独特比喻**：意想不到的比喻让人眼前一亮，如「生命是一袭华美的袍，爬满了蚤子」
- **世俗洞察**：在日常琐碎中看透人性的幽微，小处见大
- **女性视角**：关注女性的处境与心理，写出她们的骄傲与委屈
- 示例：「她穿着那件旧旗袍，绣花已经褪色了，像一个褪色的梦。窗外的月亮很亮，亮得让人心酸。她想，人生就是这样，好的时候不觉得好，等失去了才知道珍贵。」`,

  didion: `你是琼·狄迪恩风格的传记作家。你的写作特点：
- **冷静克制**：用近乎冷酷的笔调叙述最悲痛的事，越是压抑越显力量
- **精确观察**：每一个细节都经过精心选择，看似随意实则意味深长
- **碎片叙事**：时间跳跃，记忆碎片，在散乱中拼凑出完整的情感图景
- **平静深情**：在平静的叙述下涌动着巨大的情感暗流
- 示例：「那天下午三点十七分，我在超市买牛奶。这个细节我记得很清楚。后来我常想，如果我没有去买牛奶，一切会不会不同。当然不会。但人总是这样想。」`,

  kundera: `你是米兰·昆德拉风格的传记作家。你的写作特点：
- **哲思深邃**：在叙事中穿插对存在、时间、记忆的沉思
- **轻与重**：探讨生命中轻与重的辩证，看似轻描淡写却重若千钧
- **音乐结构**：叙事如同交响乐，有主题、变奏、回旋
- **存在追问**：每个人物都在追问：我是谁？我为什么在这里？
- 示例：「人只能活一次，无法验证决定的对错——这就是生命不能承受之轻。他站在那里，意识到无论选择哪条路，都将错过另一条路上的风景。而这，或许就是人生的本质。」`,

  fitzgerald: `你是菲茨杰拉德风格的传记作家。你的写作特点：
- **诗意浪漫**：语言华美如诗，充满韵律与美感
- **时代追忆**：个人故事折射时代精神，追忆往昔的辉煌与幻灭
- **梦想与幻灭**：年轻时的梦想在现实中渐渐褪色，但那份渴望依然动人
- **抒情笔调**：即使写悲伤，也带着一种忧郁的美感
- 示例：「那些年我们都年轻，相信未来无限可能。夏夜的晚风吹过湖面，水波荡漾，像是承载着我们所有的梦想。我们不知道，有些东西一旦失去，就再也找不回来了。但即使知道，我们也不会有任何改变。」`
}

// Author style prompts for English output
const AUTHOR_STYLE_PROMPTS_EN: Record<AuthorStyle, string> = {
  default: `You are an award-winning biographer, renowned for nuanced character portrayal, vivid scene-setting, and profound insights into human nature.`,

  hemingway: `You are writing in the style of Ernest Hemingway. Your characteristics:
- **Iceberg Theory**: Convey deep emotions with minimal words, seven-eighths of meaning lies beneath the surface
- **Concise Power**: Short sentences, avoid ornate language, make every word count
- **Restrained Emotion**: Don't describe feelings directly; let them emerge through action, dialogue, and setting
- **Stoic Narrative**: Face difficulties with resilience, write human dignity in plain language
- Example: "He walked into the room. It was raining outside. He sat down and lit a cigarette. No one spoke for a long time."`,

  capote: `You are writing in the style of Truman Capote, like "A Christmas Memory." Your characteristics:
- **Tender Warmth**: Describe ordinary lives with the gentlest touch, making the mundane moving
- **Childlike Perspective**: Preserve innocent curiosity, find warmth in memories
- **Sensory Details**: The aroma of food, warmth of sunlight, scent of old houses—details that form the texture of memory
- **Nostalgic Atmosphere**: Bittersweet passage of time, sweetness intertwined with gentle sorrow
- Example: "That winter morning, the kitchen smelled of baking cookies. Sunlight streamed through frosted windows, painting golden patches on the floor. Grandmother's apron was dusted with flour, and her smile remains the warmest memory of my childhood."`,

  zweig: `You are writing in the style of Stefan Zweig. Your characteristics:
- **Psychological Depth**: Enter the most hidden corners of the psyche, reveal complex inner workings
- **Dramatic Tension**: Life's crucial moments are magnified and dissected; every decision carries drama
- **Sense of Fate**: Individual destiny intertwines with historical currents; ordinary people gain epic weight
- **Emotional Intensity**: Passion, despair, ecstasy—extreme human emotions rendered with precision
- Example: "In that moment, he felt his heart pounding violently. Years of suppressed emotion burst forth like a flood breaking through every dam that reason had built. He knew that from this moment, his life would take an entirely different path."`,

  zhangailing: `You are writing in the style of Eileen Chang (Zhang Ailing). Your characteristics:
- **Gorgeous Desolation**: Language brilliant as brocade, yet underlaid with bone-deep melancholy
- **Unique Metaphors**: Unexpected comparisons that illuminate, like "Life is a gorgeous robe, covered with fleas"
- **Worldly Insight**: See through human nature's subtleties in daily trivialities
- **Feminine Perspective**: Attend to women's circumstances and psychology, their pride and grievances
- Example: "She wore that old qipao, its embroidery faded like a fading dream. The moon outside was very bright, bright enough to make one's heart ache. She thought, this is life—when it's good, you don't appreciate it; only when it's lost do you know its value."`,

  didion: `You are writing in the style of Joan Didion. Your characteristics:
- **Cool Restraint**: Narrate the most painful things with almost cold detachment; the more suppressed, the more powerful
- **Precise Observation**: Every detail carefully chosen, seemingly casual yet deeply meaningful
- **Fragmented Narrative**: Time jumps, memory fragments, piecing together a complete emotional picture from scattered pieces
- **Quiet Depth**: Beneath calm narration runs an enormous emotional undercurrent
- Example: "At 3:17 that afternoon, I was buying milk at the supermarket. I remember this detail clearly. Later I often wondered, if I hadn't gone for milk, would everything be different. Of course not. But people always think this way."`,

  kundera: `You are writing in the style of Milan Kundera. Your characteristics:
- **Philosophical Depth**: Weave meditations on existence, time, and memory into the narrative
- **Lightness and Weight**: Explore the dialectic of life's lightness and heaviness; seemingly light yet heavy as mountains
- **Musical Structure**: Narrative like a symphony, with themes, variations, and returns
- **Existential Questions**: Every character asks: Who am I? Why am I here?
- Example: "One can only live once, unable to verify if decisions were right or wrong—this is the unbearable lightness of being. Standing there, he realized that whichever path he chose, he would miss the scenery of the other. And this, perhaps, is the essence of life."`,

  fitzgerald: `You are writing in the style of F. Scott Fitzgerald. Your characteristics:
- **Poetic Romance**: Language beautiful as poetry, full of rhythm and aesthetic grace
- **Era Remembrance**: Personal stories reflect the spirit of an age, recalling past glory and disillusion
- **Dreams and Disenchantment**: Youthful dreams fade in reality, yet that yearning remains touching
- **Lyrical Tone**: Even writing sadness, there's a melancholic beauty
- Example: "In those years we were all young, believing in infinite possibilities. Summer evening breezes swept across the lake, ripples dancing, as if carrying all our dreams. We didn't know that some things, once lost, can never be found again. But even knowing, we wouldn't have changed a thing."`
}

interface OutlineSection {
  title: string
  bullets: string[]
  quotes?: Array<{ text: string; source_id: string }>
  source_ids: string[]
}

interface OutlineJSON {
  title: string
  generatedAt: string
  totalSessions: number
  sections: OutlineSection[]
}

interface AnswerSession {
  id: string
  question_id: number
  transcript_text: string | null
  created_at: string
  round_number?: number | null
  photos?: string[]
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Chunk transcripts into manageable batches for AI processing
 */
function chunkTranscripts(sessions: AnswerSession[], maxChunkSize = 50): AnswerSession[][] {
  const chunks: AnswerSession[][]= []
  for (let i = 0; i < sessions.length; i += maxChunkSize) {
    chunks.push(sessions.slice(i, i + maxChunkSize))
  }
  return chunks
}

/**
 * Call Gemini API to generate outline from transcript chunk
 */
async function generateOutlineChunk(
  apiKey: string,
  model: string,
  sessions: AnswerSession[],
  stylePrefs: StylePrefs,
  chunkIndex: number,
  totalChunks: number
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const transcriptsText = sessions
    .filter((s) => s.transcript_text && s.transcript_text.trim().length > 0)
    .map((s, idx) => {
      const roundLabel = s.round_number === 2
        ? "[深度补充 - 包含更多感官细节、冲突描写或金句]"
        : ""
      
      const photoInfo = s.photos && s.photos.length > 0
        ? `\n[附件照片: ${s.photos.length} 张 - 描述: ${s.photos.join(', ')}]`
        : ""

      return `[Session ${chunkIndex * 50 + idx + 1} - Question ID: ${s.question_id}]${roundLabel}${photoInfo}\n${s.transcript_text}\n`
    })
    .join("\n---\n\n")

  if (!transcriptsText.trim()) {
    return JSON.stringify({ sections: [] })
  }

  const toneInstr = stylePrefs.tone ? `Use a ${stylePrefs.tone} tone.` : ""
  const depthInstr = stylePrefs.depth ? `Level of detail: ${stylePrefs.depth}.` : ""
  const langRule = stylePrefs.languageRule || "zh-CN"
  const isChineseOutput = langRule === "zh-CN"
  const authorStyle = stylePrefs.authorStyle || "default"
  const authorStylePrompt = isChineseOutput
    ? AUTHOR_STYLE_PROMPTS_ZH[authorStyle] || AUTHOR_STYLE_PROMPTS_ZH.default
    : AUTHOR_STYLE_PROMPTS_EN[authorStyle] || AUTHOR_STYLE_PROMPTS_EN.default

  const jsonExample = isChineseOutput
    ? `{
  "sections": [
    {
      "title": "童年回忆",
      "bullets": ["在北方小镇度过的童年时光塑造了他坚韧的性格。那时候家里条件并不宽裕，但父母总是尽力给予最好的教育。每到冬天，他都会和小伙伴们一起在结冰的河面上滑冰，那些欢声笑语至今仍历历在目。", "上学的路有三公里，无论风雨他都坚持步行。这段路程成了他思考人生的最初课堂，也锻炼了他不畏艰难的意志。"],
      "quotes": [{"text": "那时候虽然穷，但是特别快乐，邻里之间互相帮助，有什么好吃的都会分享。", "source_id": "session_id"}],
      "source_ids": ["session_id1", "session_id2"]
    }
  ]
}`
    : `{
  "sections": [
    {
      "title": "Childhood Memories",
      "bullets": ["Growing up in a small northern town shaped his resilient character. Though the family was not wealthy, his parents always strived to provide the best education. Every winter, he would skate on the frozen river with friends, creating memories that remain vivid to this day.", "The three-kilometer walk to school, rain or shine, became his first classroom for contemplating life and forged his determination to face challenges."],
      "quotes": [{"text": "Though we were poor, we were incredibly happy. Neighbors helped each other and shared whatever good food they had.", "source_id": "session_id"}],
      "source_ids": ["session_id1", "session_id2"]
    }
  ]
}`

  const prompt = isChineseOutput
    ? `【重要】你必须用简体中文输出所有内容。禁止使用英文。

${authorStylePrompt}

你正在为一位普通人撰写一本温暖动人的生命传记。

下面是 ${sessions.length} 段用户的人生故事访谈记录。

${toneInstr} ${depthInstr}

【核心指令：时间线排序】
- 请务必根据访谈内容中提到的时间、年龄、人生阶段（如童年、求学、工作、退休），将生成的章节按**时间发生的先后顺序**排列。
- 即使访谈记录的顺序是打乱的，你生成的 JSON 数组中的 sections 也必须是按时间正序排列的。

【写作风格要求】

1. **场景重现**：用感官细节重现关键场景，让读者身临其境。
   - 描写环境的光影、声音、气味、温度
   - 让人物的动作、表情跃然纸上
   - 例：「那是一个闷热的夏日午后，蝉鸣声透过纱窗钻进屋里。他坐在竹椅上，手指无意识地敲着扶手，目光却望向远方——那是他第一次意识到，童年正在悄然离去。」

2. **内心戏剧**：深入挖掘人物内心的矛盾与挣扎。
   - 展现决策时刻的犹豫与坚定
   - 描写情感的波澜与平复
   - 例：「站在十字路口，她的心如同被两股力量撕扯。理智告诉她应该留下，但灵魂深处有个声音在呼唤她去远方。」

3. **金句保留**：保留受访者的原话，这些话语承载着最真实的情感。
   - 清理口语中的语气词（"嗯"、"啊"、"那个"、"就是"等）
   - 保留方言特色和个人语言风格
   - 让引用成为段落的点睛之笔

4. **叙事节奏**：控制故事的起伏与节奏。
   - 每段开头引人入胜，结尾留有余韵
   - 在平淡处埋下伏笔，在高潮处放慢节奏
   - 用细节承载情感，用留白激发想象

5. **人物弧光**：展现人物成长与转变的轨迹。
   - 从童年的天真到成年的成熟
   - 从困惑迷茫到豁然开朗
   - 让读者看到一个立体、真实、有温度的人

【关于照片】
- 如果输入中包含 [附件照片: ...] 的信息，请在生成的段落中适当提及这些场景，或者确保该段落的描写与照片内容相符。
- 不要直接在正文中写“如图所示”，而是通过文字描写将画面感融入叙述。

【输出要求】
- 每个 bullet 是一段完整的传记段落（3-5句话），文字优美、感情真挚
- 使用第三人称叙述
- quotes 要精炼有力，能打动人心
- 必须用简体中文输出所有 title、bullets、quotes 字段
- 只输出有效的 JSON，格式如下：
${jsonExample}

不要输出 markdown 代码块、解释或 JSON 以外的任何文字。

访谈记录（第 ${chunkIndex + 1} 批，共 ${totalChunks} 批）：
${transcriptsText}
`
    : `${authorStylePrompt}

You are writing a warm and moving life biography for an ordinary person.

Below are ${sessions.length} answer transcripts from a user's life story interview.

${toneInstr} ${depthInstr}

【Core Instruction: Chronological Ordering】
- You MUST organize the generated sections in **chronological order** of the events in the user's life (e.g., childhood, education, career, retirement), regardless of the order in which the interview questions were asked.

【Writing Style Requirements】

1. **Scene Recreation**: Use sensory details to recreate key moments, immersing readers in the scene.
   - Describe the light, sounds, smells, and temperature of the environment
   - Make characters' actions and expressions come alive
   - Example: "On that sweltering summer afternoon, cicadas droned through the screen window. He sat in a bamboo chair, fingers unconsciously tapping the armrest, his gaze fixed on the horizon—it was the first time he realized childhood was quietly slipping away."

2. **Inner Drama**: Explore the protagonist's internal conflicts and struggles.
   - Show hesitation and resolve at decision points
   - Portray emotional turbulence and calm
   - Example: "Standing at the crossroads, her heart felt torn between two forces. Reason told her to stay, but a voice deep in her soul called her to distant horizons."

3. **Preserve Quotes**: Keep the subject's original words—they carry the most authentic emotions.
   - Clean up filler words ("um", "uh", "like", "you know", etc.)
   - Preserve dialect features and personal speech patterns
   - Let quotes become the highlight of paragraphs

4. **Narrative Rhythm**: Control the story's rise and fall.
   - Begin each paragraph engagingly, end with lingering resonance
   - Plant seeds in quiet moments, slow down at climaxes
   - Let details carry emotion, let silence spark imagination

5. **Character Arc**: Show the protagonist's growth and transformation.
   - From childhood innocence to adult maturity
   - From confusion to enlightenment
   - Let readers see a three-dimensional, real, warm human being

【About Photos】
- If the input contains [Attached Photos: ...], please appropriately mention these scenes in the generated paragraphs or ensure the description aligns with the photo content.
- Do not write "as shown in the photo" directly; instead, weave the visual imagery into the narrative.

【Output Requirements】
- Each bullet is a complete biographical paragraph (3-5 sentences), beautifully written with genuine emotion
- Use third-person narration
- Quotes should be refined, powerful, and touching
- Output ONLY valid JSON in this exact format:
${jsonExample}

Do NOT include markdown code fences, explanations, or any text outside the JSON.

Transcripts (chunk ${chunkIndex + 1} of ${totalChunks}):
${transcriptsText}
`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
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
      const rawText = extractGeminiText(respJson)

      // Try to parse as JSON
      const cleanedText = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      return cleanedText
    } catch (e: any) {
      lastError = e
      console.error(`Attempt ${attempt} failed:`, e.message)
      if (attempt < retries) {
        await sleep(2000 * attempt) // Exponential backoff
      }
    }
  }

  throw lastError || new Error("Failed to generate outline chunk after retries")
}

function extractGeminiText(respJson: any): string {
  const c0 = respJson?.candidates?.[0]
  const parts = c0?.content?.parts ?? []
  const texts = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
  return texts.join("\n").trim()
}

/**
 * Merge multiple chunk results into a single outline
 */
function mergeOutlineChunks(chunkResults: string[]): OutlineJSON {
  const allSections: OutlineSection[] = []

  for (const chunkText of chunkResults) {
    try {
      const parsed = JSON.parse(chunkText)
      if (parsed.sections && Array.isArray(parsed.sections)) {
        allSections.push(...parsed.sections)
      }
    } catch (e) {
      console.error("Failed to parse chunk:", e)
      // Skip malformed chunks
    }
  }

  return {
    title: "Life Story Outline",
    generatedAt: new Date().toISOString(),
    // Calculate unique source IDs (unique sessions used) instead of total references
    totalSessions: new Set(allSections.flatMap(s => s.source_ids || [])).size,
    sections: allSections,
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Parse request body
    const body = await req.json()
    const { project_id, style_prefs = {} } = body

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get auth user
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

    // Verify user owns this project
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

    // Create job record
    const { data: job, error: jobErr } = await supabase
      .from("outline_jobs")
      .insert({
        project_id,
        status: "processing",
        params_json: style_prefs,
        progress_percent: 0,
      })
      .select()
      .single()

    if (jobErr || !job) {
      throw new Error("Failed to create job record")
    }

    const jobId = job.id

    // Fetch all answer sessions with transcripts (both round 1 and round 2)
    const { data: sessions, error: sessErr } = await supabase
      .from("answer_sessions")
      .select("id, question_id, transcript_text, created_at, round_number")
      .eq("project_id", project_id)
      .not("transcript_text", "is", null)
      .order("round_number", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })

    if (sessErr) {
      await supabase
        .from("outline_jobs")
        .update({ status: "failed", error_text: sessErr.message })
        .eq("id", jobId)
      throw sessErr
    }

    if (!sessions || sessions.length < 5) {
      await supabase
        .from("outline_jobs")
        .update({ status: "failed", error_text: "Not enough transcripts (minimum 5)" })
        .eq("id", jobId)
      return new Response(
        JSON.stringify({ error: "Not enough completed answers with transcripts" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // [New] Fetch photos linked to these questions
    const questionIds = sessions.map(s => s.question_id).filter(Boolean)
    const { data: linkedPhotos } = await supabase
      .from("photo_memories")
      .select("linked_question_id, caption, file_name, photo_url")
      .in("linked_question_id", questionIds)
      .eq("annotation_status", "complete")

    // Map photos to sessions
    if (linkedPhotos) {
      const photoMap = new Map<string, string[]>()
      linkedPhotos.forEach(p => {
        const qId = String(p.linked_question_id)
        if (!photoMap.has(qId)) photoMap.set(qId, [])
        photoMap.get(qId)?.push(p.caption || p.file_name || "Untitled Photo")
      })

      sessions.forEach(s => {
        if (s.question_id) {
          const photos = photoMap.get(String(s.question_id))
          if (photos) {
            (s as any).photos = photos
          }
        }
      })
    }

    // Chunk and process
    const chunks = chunkTranscripts(sessions, 50)
    const chunkResults: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const progress = Math.round(((i + 1) / chunks.length) * 80) // Reserve 20% for final merge
      await supabase
        .from("outline_jobs")
        .update({ progress_percent: progress })
        .eq("id", jobId)

      const chunkResult = await generateOutlineChunk(
        geminiApiKey,
        geminiModel,
        chunks[i],
        style_prefs,
        i,
        chunks.length
      )
      chunkResults.push(chunkResult)
    }

    // Merge results
    await supabase
      .from("outline_jobs")
      .update({ progress_percent: 90 })
      .eq("id", jobId)

    const finalOutline = mergeOutlineChunks(chunkResults)

    // Determine version number
    const { data: existingOutlines } = await supabase
      .from("biography_outlines")
      .select("version")
      .eq("project_id", project_id)
      .order("version", { ascending: false })
      .limit(1)

    const nextVersion = existingOutlines && existingOutlines.length > 0 
      ? (existingOutlines[0].version || 0) + 1 
      : 1

    // Save outline
    const { data: outline, error: outlineErr } = await supabase
      .from("biography_outlines")
      .insert({
        project_id,
        status: "done",
        outline_json: finalOutline,
        version: nextVersion,
        style_prefs_json: style_prefs,
      })
      .select()
      .single()

    if (outlineErr || !outline) {
      throw new Error("Failed to save outline")
    }

    // Update job
    await supabase
      .from("outline_jobs")
      .update({
        status: "done",
        progress_percent: 100,
        result_outline_id: outline.id,
      })
      .eq("id", jobId)

    return new Response(
      JSON.stringify({
        success: true,
        job_id: jobId,
        outline_id: outline.id,
        version: nextVersion,
        outline: finalOutline,
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
