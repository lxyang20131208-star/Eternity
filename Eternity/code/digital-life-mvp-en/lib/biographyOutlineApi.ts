// Biography Outline API Utilities

import { supabase } from './supabaseClient'

export type AuthorStyle =
  | 'hemingway'      // 海明威 - 简洁有力
  | 'capote'         // 卡波特 - 温情细腻
  | 'zweig'          // 茨威格 - 心理描写
  | 'zhangailing'    // 张爱玲 - 华丽苍凉
  | 'didion'         // 琼·狄迪恩 - 冷静克制
  | 'kundera'        // 米兰·昆德拉 - 哲思深邃
  | 'fitzgerald'     // 菲茨杰拉德 - 诗意浪漫
  | 'default'        // 默认风格

export interface StylePrefs {
  tone?: 'professional' | 'casual' | 'narrative'
  depth?: 'brief' | 'detailed' | 'comprehensive'
  chapters?: string[]
  languageRule?: 'zh-CN' | 'en'
  authorStyle?: AuthorStyle
}

export const AUTHOR_STYLES: Record<AuthorStyle, { name: string; nameEn: string; description: string }> = {
  default: {
    name: '经典传记',
    nameEn: 'Classic Biography',
    description: '平衡的叙事风格，兼顾文学性与可读性'
  },
  hemingway: {
    name: '海明威',
    nameEn: 'Hemingway',
    description: '简洁有力，冰山理论，用最少的文字传达最深的情感'
  },
  capote: {
    name: '卡波特',
    nameEn: 'Truman Capote',
    description: '温情细腻，如《圣诞忆旧集》般温暖怀旧的笔触'
  },
  zweig: {
    name: '茨威格',
    nameEn: 'Stefan Zweig',
    description: '深入人物内心，细腻的心理描写，戏剧性的转折'
  },
  zhangailing: {
    name: '张爱玲',
    nameEn: 'Eileen Chang',
    description: '华丽苍凉，独特的比喻，对人性幽微处的洞察'
  },
  didion: {
    name: '琼·狄迪恩',
    nameEn: 'Joan Didion',
    description: '冷静克制，精确观察，在平静叙述中蕴含深情'
  },
  kundera: {
    name: '米兰·昆德拉',
    nameEn: 'Milan Kundera',
    description: '哲思深邃，在叙事中穿插对生命本质的思考'
  },
  fitzgerald: {
    name: '菲茨杰拉德',
    nameEn: 'F. Scott Fitzgerald',
    description: '诗意浪漫，华美的语言，对时代与梦想的追忆'
  }
}

export interface OutlineSection {
  title: string
  bullets: string[]
  quotes?: Array<{ text: string; source_id: string }>
  source_ids: string[]
}

export interface OutlineJSON {
  title: string
  generatedAt: string
  totalSessions: number
  sections: OutlineSection[]
}

export interface BiographyOutline {
  id: string
  project_id: string
  status: 'pending' | 'processing' | 'done' | 'failed'
  outline_json: OutlineJSON | null
  version: number
  style_prefs_json: StylePrefs
  export_object_key: string | null
  error_text: string | null
  created_at: string
  updated_at: string
}

export interface OutlineJob {
  id: string
  project_id: string
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'
  params_json: StylePrefs
  result_outline_id: string | null
  progress_percent: number
  error_text: string | null
  created_at: string
  updated_at: string
}

/**
 * Trigger outline generation for a project
 */
export async function generateBiographyOutline(
  projectId: string,
  stylePrefs: StylePrefs = {}
): Promise<{ job_id: string; outline_id?: string; error?: string }> {
  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr || !session) {
      throw new Error('Not authenticated')
    }

    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate_biography_outline`
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        style_prefs: stylePrefs,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to generate outline')
    }

    return {
      job_id: result.job_id,
      outline_id: result.outline_id,
    }
  } catch (e: any) {
    return {
      job_id: '',
      error: e.message || String(e),
    }
  }
}

/**
 * Poll job status
 */
export async function getOutlineJobStatus(
  jobId: string
): Promise<OutlineJob | null> {
  try {
    const { data, error } = await supabase
      .from('outline_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (e) {
    console.error('Failed to get job status:', e)
    return null
  }
}

/**
 * Get outline by ID
 */
export async function getOutlineById(
  outlineId: string
): Promise<BiographyOutline | null> {
  try {
    const { data, error } = await supabase
      .from('biography_outlines')
      .select('*')
      .eq('id', outlineId)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (e) {
    console.error('Failed to get outline:', e)
    return null
  }
}

/**
 * List all outlines for a project
 */
export async function listProjectOutlines(
  projectId: string
): Promise<BiographyOutline[]> {
  try {
    const { data, error } = await supabase
      .from('biography_outlines')
      .select('*')
      .eq('project_id', projectId)
      .order('version', { ascending: false })

    if (error) throw error
    return data || []
  } catch (e) {
    const msg = (e as any)?.message || (typeof e === 'string' ? e : JSON.stringify(e))
    console.error('Failed to list outlines:', msg, { projectId })
    throw new Error(msg)
  }
}

/**
 * Get latest outline for a project
 */
export async function getLatestOutline(
  projectId: string
): Promise<BiographyOutline | null> {
  try {
    const { data, error } = await supabase
      .from('biography_outlines')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data
  } catch (e) {
    console.error('Failed to get latest outline:', e)
    return null
  }
}

/**
 * Delete an outline and its related job records
 */
export async function deleteOutline(outlineId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // First delete any outline_jobs that reference this outline
    const { error: jobsError } = await supabase
      .from('outline_jobs')
      .delete()
      .eq('result_outline_id', outlineId)

    if (jobsError) {
      console.warn('Failed to delete related jobs:', jobsError)
      // Continue anyway - the outline delete is more important
    }

    // Then delete the outline itself
    const { error } = await supabase
      .from('biography_outlines')
      .delete()
      .eq('id', outlineId)

    if (error) throw error
    return { success: true }
  } catch (e: any) {
    console.error('Failed to delete outline:', e)
    return { success: false, error: e?.message || 'Delete failed' }
  }
}

/**
 * Convert outline to Markdown
 */
export function outlineToMarkdown(outline: OutlineJSON): string {
  let md = `# ${outline.title}\n\n`
  md += `*Generated: ${new Date(outline.generatedAt).toLocaleString()}*\n\n`
  md += `*Total Sessions: ${outline.totalSessions}*\n\n`
  md += `---\n\n`

  for (const section of outline.sections) {
    md += `## ${section.title}\n\n`

    for (const bullet of section.bullets) {
      md += `- ${bullet}\n`
    }

    if (section.quotes && section.quotes.length > 0) {
      md += `\n### Notable Quotes\n\n`
      for (const quote of section.quotes) {
        md += `> "${quote.text}"\n>\n> — *Session ${quote.source_id}*\n\n`
      }
    }

    md += `\n`
  }

  return md
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (e) {
    console.error('Failed to copy to clipboard:', e)
    return false
  }
}

// ========== V2 Rich Text Support ==========

import type { OutlineJSONV2, OutlineSectionV2, RichTextContent } from './types/outline'
import { textToRichContent, richContentToText } from './types/outline'

export type { OutlineJSONV2, OutlineSectionV2, RichTextContent }
export { textToRichContent, richContentToText }

/**
 * Update outline content (overwrite current version)
 */
export async function updateOutlineContent(
  outlineId: string,
  outlineJson: OutlineJSONV2
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('biography_outlines')
      .update({
        outline_json: outlineJson,
        updated_at: new Date().toISOString()
      })
      .eq('id', outlineId)

    if (error) throw error
    return { success: true }
  } catch (e: any) {
    console.error('Failed to update outline:', e)
    return { success: false, error: e?.message || 'Update failed' }
  }
}

/**
 * Save as new version
 */
export async function saveAsNewVersion(
  projectId: string,
  outlineJson: OutlineJSONV2,
  stylePrefs: StylePrefs = {}
): Promise<{ success: boolean; outlineId?: string; version?: number; error?: string }> {
  try {
    // Get current max version
    const { data: existing } = await supabase
      .from('biography_outlines')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const newVersion = (existing?.version || 0) + 1

    // Insert new version
    const { data, error } = await supabase
      .from('biography_outlines')
      .insert({
        project_id: projectId,
        status: 'done',
        outline_json: outlineJson,
        version: newVersion,
        style_prefs_json: stylePrefs
      })
      .select('id, version')
      .single()

    if (error) throw error
    return { success: true, outlineId: data.id, version: data.version }
  } catch (e: any) {
    console.error('Failed to save new version:', e)
    return { success: false, error: e?.message || 'Save failed' }
  }
}

/**
 * Migrate plain text outline to rich text format
 */
export function migrateToRichText(outline: OutlineJSON): OutlineJSONV2 {
  return {
    ...outline,
    schema_version: 2,
    title_rich: textToRichContent(outline.title),
    sections: outline.sections.map((section, index) => ({
      ...section,
      title_rich: textToRichContent(section.title),
      bullets_rich: section.bullets.map(b => textToRichContent(b)),
      quotes_rich: section.quotes?.map(q => ({
        ...q,
        text_rich: textToRichContent(q.text)
      })),
      order: index
    }))
  }
}

/**
 * Convert V2 outline back to plain text (for compatibility)
 */
export function outlineV2ToPlainText(outline: OutlineJSONV2): OutlineJSON {
  return {
    title: outline.title_rich ? richContentToText(outline.title_rich) : outline.title,
    generatedAt: outline.generatedAt,
    totalSessions: outline.totalSessions,
    sections: outline.sections.map(section => ({
      title: section.title_rich ? richContentToText(section.title_rich) : section.title,
      bullets: section.bullets_rich
        ? section.bullets_rich.map(b => richContentToText(b))
        : section.bullets,
      quotes: section.quotes_rich
        ? section.quotes_rich.map(q => ({
            text: richContentToText(q.text_rich),
            source_id: q.source_id
          }))
        : section.quotes,
      source_ids: section.source_ids
    }))
  }
}

/**
 * Validate outline data structure
 */
export function validateOutline(outline: OutlineJSONV2): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!outline.title && !outline.title_rich) {
    errors.push('大纲必须有标题')
  }

  if (!outline.sections || outline.sections.length === 0) {
    errors.push('大纲至少需要一个章节')
  }

  outline.sections?.forEach((section, i) => {
    if (!section.title && !section.title_rich) {
      errors.push(`章节 ${i + 1} 缺少标题`)
    }
  })

  return { valid: errors.length === 0, errors }
}
