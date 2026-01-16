// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type AuthorStyle = 'hemingway' | 'capote' | 'zweig' | 'zhangailing' | 'didion' | 'kundera' | 'fitzgerald' | 'default'

interface OutlineSection {
  title: string
  bullets: string[]
  quotes?: Array<{ text: string; source_id: string }>
}

interface ExpandedChapter {
  title: string
  content: string
  quotes: string[]
}

// Simplified author style prompts
const STYLE_PROMPTS: Record<AuthorStyle, string> = {
  default: '你是一位资深传记作家。',
  hemingway: '你是海明威风格的作家：简洁有力，用最少的文字传达最深的情感。',
  capote: '你是卡波特风格的作家：温情细腻，如《圣诞忆旧集》般温暖怀旧。',
  zweig: '你是茨威格风格的作家：深入心理描写，戏剧性的转折。',
  zhangailing: '你是张爱玲风格的作家：华丽苍凉，独特的比喻。',
  didion: '你是琼·狄迪恩风格的作家：冷静克制，精确观察。',
  kundera: '你是米兰·昆德拉风格的作家：哲思深邃，存在主义追问。',
  fitzgerald: '你是菲茨杰拉德风格的作家：诗意浪漫，华美的语言。'
}

function extractPlainText(richContent: any): string {
  if (!richContent) return ''
  if (typeof richContent === 'string') return richContent
  if (richContent.content && Array.isArray(richContent.content)) {
    return richContent.content
      .map((node: any) => {
        if (node.type === 'text') return node.text || ''
        if (node.content) return extractPlainText(node)
        return ''
      })
      .join('')
  }
  return ''
}

async function expandChapter(
  apiKey: string,
  section: OutlineSection,
  authorStyle: AuthorStyle,
  chapterIndex: number
): Promise<ExpandedChapter> {
  const bullets = section.bullets?.filter(b => b && b.trim()) || []

  if (bullets.length === 0) {
    return {
      title: section.title || `第${chapterIndex + 1}章`,
      content: `关于「${section.title}」的故事尚待补充...`,
      quotes: []
    }
  }

  const stylePrompt = STYLE_PROMPTS[authorStyle] || STYLE_PROMPTS.default
  const bulletsText = bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')

  const prompt = `${stylePrompt}

将以下大纲要点扩展成完整的传记章节「${section.title}」：

${bulletsText}

要求：
- 将每个要点扩展成2-3个段落
- 使用第三人称叙述
- 字数800-1500字
- 直接输出正文，不要标题或解释`

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent'

  const resp = await fetch(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    })
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Gemini API: ${resp.status} - ${errText.slice(0, 100)}`)
  }

  const data = await resp.json()
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return {
    title: section.title || `第${chapterIndex + 1}章`,
    content: content.trim() || '内容生成失败',
    quotes: section.quotes?.map(q => q.text) || []
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const headers = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const { project_id, outline_id, author_style = 'default', chapter_indices } = await req.json()

    if (!project_id || !outline_id) {
      return new Response(JSON.stringify({ error: 'project_id and outline_id required' }), { status: 400, headers })
    }

    console.log('Request:', { project_id, outline_id, author_style, chapter_indices })

    // Check env vars
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const geminiKey = Deno.env.get('GEMINI_API_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500, headers })
    }
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500, headers })
    }

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token)

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })
    }

    // Verify project access
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', project_id)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers })
    }

    // Get outline
    const { data: outline } = await supabase
      .from('biography_outlines')
      .select('outline_json')
      .eq('id', outline_id)
      .eq('project_id', project_id)
      .maybeSingle()

    if (!outline?.outline_json?.sections) {
      return new Response(JSON.stringify({ error: 'Outline not found or empty' }), { status: 404, headers })
    }

    // Parse sections (handle both V1 and V2 formats)
    const rawSections = outline.outline_json.sections
    const sections: OutlineSection[] = rawSections.map((s: any) => ({
      title: s.title_rich ? extractPlainText(s.title_rich) : (s.title || '未命名'),
      bullets: s.bullets_rich ? s.bullets_rich.map((b: any) => extractPlainText(b)) : (s.bullets || []),
      quotes: s.quotes || []
    }))

    // Determine which chapters to expand
    const indicesToExpand: number[] = (chapter_indices && Array.isArray(chapter_indices) && chapter_indices.length > 0)
      ? chapter_indices.filter((i: number) => i >= 0 && i < sections.length)
      : sections.map((_, i) => i)

    console.log(`Expanding ${indicesToExpand.length} chapters:`, indicesToExpand)

    // Expand chapters one by one
    const expandedChapters: ExpandedChapter[] = []

    for (const i of indicesToExpand) {
      try {
        console.log(`Expanding chapter ${i + 1}: ${sections[i].title}`)
        const chapter = await expandChapter(geminiKey, sections[i], author_style as AuthorStyle, i)
        expandedChapters.push(chapter)
      } catch (err: any) {
        console.error(`Chapter ${i + 1} failed:`, err.message)
        // If one chapter fails, add placeholder and continue
        expandedChapters.push({
          title: sections[i].title || `第${i + 1}章`,
          content: `[章节生成失败: ${err.message}]`,
          quotes: []
        })
      }

      // Small delay between API calls
      if (indicesToExpand.indexOf(i) < indicesToExpand.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // Only save to database if we expanded ALL chapters (not a batch)
    if (!chapter_indices || chapter_indices.length === 0) {
      const expandedJson = {
        outline_id,
        author_style,
        expanded_at: new Date().toISOString(),
        chapters: expandedChapters
      }

      await supabase
        .from('biography_outlines')
        .update({ expanded_json: expandedJson, updated_at: new Date().toISOString() })
        .eq('id', outline_id)
    }

    return new Response(JSON.stringify({
      success: true,
      chapters: expandedChapters,
      total: expandedChapters.length
    }), { status: 200, headers })

  } catch (err: any) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), { status: 500, headers })
  }
})
