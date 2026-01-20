// Chapter Expansion API Utilities

import { supabase } from './supabaseClient'
import type { AuthorStyle } from './biographyOutlineApi'

export interface ExpandedChapter {
  title: string
  content: string  // Full prose text
  quotes: string[]
}

export interface ExpandedBiography {
  outline_id: string
  author_style: AuthorStyle
  expanded_at: string
  chapters: ExpandedChapter[]
}

/**
 * Call backend to expand a batch of chapters
 */
async function expandChapterBatch(
  projectId: string,
  outlineId: string,
  authorStyle: AuthorStyle,
  chapterIndices: number[],
  accessToken: string
): Promise<ExpandedChapter[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  }

  const functionUrl = `${supabaseUrl}/functions/v1/expand_biography_chapters`

  console.log('[expandChapterBatch] Calling:', functionUrl, 'indices:', chapterIndices)

  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        outline_id: outlineId,
        author_style: authorStyle,
        chapter_indices: chapterIndices,
      }),
    })
  } catch (fetchError: any) {
    console.error('[expandChapterBatch] Fetch failed:', fetchError)
    // Network error - Edge Function might not be deployed
    throw new Error(
      `无法连接到章节生成服务。请检查：\n` +
      `1. Edge Function 'expand_biography_chapters' 是否已部署\n` +
      `2. 网络连接是否正常\n` +
      `原始错误: ${fetchError.message}`
    )
  }

  const responseText = await response.text()
  let result: any = {}

  try {
    result = responseText ? JSON.parse(responseText) : {}
  } catch {
    throw new Error(`服务器返回无效响应: ${responseText.slice(0, 100)}`)
  }

  if (!response.ok) {
    const errorMsg = result.error || `HTTP ${response.status}`
    console.error('[expandChapterBatch] API error:', errorMsg)
    throw new Error(errorMsg)
  }

  console.log('[expandChapterBatch] Success, chapters:', result.chapters?.length)
  return result.chapters || []
}

/**
 * Expand outline into full biography chapters (with batching to avoid timeout)
 */
export async function expandBiographyChapters(
  projectId: string,
  outlineId: string,
  authorStyle: AuthorStyle = 'default',
  totalChapters: number = 10,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ success: boolean; chapters?: ExpandedChapter[]; error?: string }> {
  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr || !session) {
      throw new Error('Not authenticated')
    }

    const BATCH_SIZE = 5 // Process 5 chapters at a time
    const allChapters: ExpandedChapter[] = []
    const totalBatches = Math.ceil(totalChapters / BATCH_SIZE)

    console.log(`Expanding ${totalChapters} chapters in ${totalBatches} batches`)

    for (let batch = 0; batch < totalBatches; batch++) {
      const startIdx = batch * BATCH_SIZE
      const endIdx = Math.min(startIdx + BATCH_SIZE, totalChapters)
      const indices = Array.from({ length: endIdx - startIdx }, (_, i) => startIdx + i)

      const message = `正在生成第 ${startIdx + 1}-${endIdx} 章 (共 ${totalChapters} 章)...`
      console.log(message)

      if (onProgress) {
        onProgress(startIdx, totalChapters, message)
      }

      try {
        const batchChapters = await expandChapterBatch(
          projectId,
          outlineId,
          authorStyle,
          indices,
          session.access_token
        )
        allChapters.push(...batchChapters)
      } catch (batchErr: any) {
        console.error(`Batch ${batch + 1} failed:`, batchErr)
        // Add placeholder chapters for failed batch
        for (let i = startIdx; i < endIdx; i++) {
          allChapters.push({
            title: `第${i + 1}章`,
            content: `[章节生成失败: ${batchErr.message}]`,
            quotes: []
          })
        }
      }

      // Delay between batches
      if (batch < totalBatches - 1) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }

    if (onProgress) {
      onProgress(totalChapters, totalChapters, '完成！')
    }

    return {
      success: true,
      chapters: allChapters,
    }
  } catch (e: any) {
    console.error('Expand chapters failed:', e)
    return {
      success: false,
      error: e.message || String(e),
    }
  }
}

/**
 * Get cached expanded chapters from outline
 */
export async function getExpandedChapters(
  outlineId: string
): Promise<ExpandedBiography | null> {
  try {
    const { data, error } = await supabase
      .from('biography_outlines')
      .select('expanded_json')
      .eq('id', outlineId)
      .maybeSingle()

    if (error) throw error
    return data?.expanded_json || null
  } catch (e) {
    console.error('Failed to get expanded chapters:', e)
    return null
  }
}

/**
 * Generate full biography text from expanded chapters
 */
export function chaptersToFullText(chapters: ExpandedChapter[]): string {
  let fullText = ''

  chapters.forEach((chapter, idx) => {
    fullText += `\n\n${'='.repeat(40)}\n`
    fullText += `第${idx + 1}章  ${chapter.title}\n`
    fullText += `${'='.repeat(40)}\n\n`
    fullText += chapter.content
    fullText += '\n'
  })

  return fullText.trim()
}

/**
 * Generate HTML for book-style PDF
 */
export function chaptersToBookHtml(
  chapters: ExpandedChapter[],
  bookTitle: string = '我的传记',
  authorStyle: AuthorStyle = 'default'
): string {
  const styleNames: Record<AuthorStyle, string> = {
    default: '经典传记',
    hemingway: '海明威风格',
    capote: '卡波特风格',
    zweig: '茨威格风格',
    zhangailing: '张爱玲风格',
    didion: '琼·狄迪恩风格',
    kundera: '昆德拉风格',
    fitzgerald: '菲茨杰拉德风格',
  }

  let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4;
      margin: 25mm 20mm 30mm 20mm;
    }

    body {
      font-family: "Noto Serif SC", "Source Han Serif SC", "SimSun", "STSong", Georgia, serif;
      font-size: 11pt;
      line-height: 1.9;
      color: #1a1a1a;
      text-align: justify;
    }

    /* Title Page */
    .title-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      text-align: center;
    }

    .book-title {
      font-size: 36pt;
      font-weight: 400;
      letter-spacing: 8px;
      margin-bottom: 40px;
      color: #2c2c2c;
    }

    .book-subtitle {
      font-size: 14pt;
      color: #666;
      margin-bottom: 20px;
    }

    .book-date {
      font-size: 11pt;
      color: #999;
      margin-top: 60px;
    }

    /* Table of Contents */
    .toc-page {
      page-break-after: always;
    }

    .toc-title {
      font-size: 18pt;
      text-align: center;
      margin-bottom: 40px;
      letter-spacing: 4px;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px dotted #ccc;
    }

    .toc-chapter {
      color: #333;
    }

    .toc-page-num {
      color: #666;
    }

    /* Chapter Styles */
    .chapter {
      page-break-before: always;
    }

    .chapter:first-of-type {
      page-break-before: auto;
    }

    .chapter-header {
      text-align: center;
      margin-bottom: 50px;
      padding-top: 60px;
    }

    .chapter-number {
      font-size: 12pt;
      color: #888;
      letter-spacing: 3px;
      margin-bottom: 15px;
    }

    .chapter-title {
      font-size: 20pt;
      font-weight: 400;
      color: #2c2c2c;
      letter-spacing: 2px;
    }

    .chapter-content {
      text-indent: 2em;
    }

    .chapter-content p {
      margin: 0 0 1.5em 0;
      text-indent: 2em;
    }

    /* First paragraph drop cap */
    .chapter-content p:first-of-type::first-letter {
      float: left;
      font-size: 3.5em;
      line-height: 0.8;
      padding-right: 8px;
      padding-top: 4px;
      color: #2c2c2c;
    }

    /* Quote styling */
    blockquote, .quote {
      margin: 2em 3em;
      padding-left: 1em;
      border-left: 2px solid #ccc;
      font-style: italic;
      color: #444;
    }

    /* Page numbers (for print) */
    @media print {
      .page-number {
        position: fixed;
        bottom: 15mm;
        width: 100%;
        text-align: center;
        font-size: 10pt;
        color: #999;
      }
    }

    /* Separator */
    .separator {
      text-align: center;
      margin: 3em 0;
      color: #ccc;
      letter-spacing: 1em;
    }
  </style>
</head>
<body>
  <!-- Title Page -->
  <div class="title-page">
    <h1 class="book-title">${bookTitle}</h1>
    <p class="book-subtitle">${styleNames[authorStyle]}</p>
    <p class="book-date">${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</p>
  </div>

  <!-- Table of Contents -->
  <div class="toc-page">
    <h2 class="toc-title">目  录</h2>
    ${chapters.map((ch, idx) => `
    <div class="toc-item">
      <span class="toc-chapter">第${idx + 1}章  ${ch.title}</span>
      <span class="toc-page-num">${idx + 3}</span>
    </div>
    `).join('')}
  </div>

  <!-- Chapters -->
  ${chapters.map((chapter, idx) => `
  <div class="chapter">
    <div class="chapter-header">
      <div class="chapter-number">第 ${idx + 1} 章</div>
      <h2 class="chapter-title">${chapter.title}</h2>
    </div>
    <div class="chapter-content">
      ${formatChapterContent(chapter.content)}
    </div>
  </div>
  `).join('')}

</body>
</html>
`

  return html
}

/**
 * Format chapter content with proper paragraphs
 */
function formatChapterContent(content: string): string {
  // Split by double newlines or single newlines with indentation
  const paragraphs = content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  return paragraphs.map(p => `<p>${p}</p>`).join('\n')
}

/**
 * Export expanded biography to different formats
 */
export async function exportBiography(
  chapters: ExpandedChapter[],
  format: 'html' | 'txt' | 'md',
  bookTitle: string = '我的传记',
  authorStyle: AuthorStyle = 'default'
): Promise<Blob> {
  if (format === 'html') {
    const html = chaptersToBookHtml(chapters, bookTitle, authorStyle)
    return new Blob([html], { type: 'text/html;charset=utf-8' })
  }

  if (format === 'txt') {
    const text = chaptersToFullText(chapters)
    return new Blob([text], { type: 'text/plain;charset=utf-8' })
  }

  // Markdown format
  let md = `# ${bookTitle}\n\n`
  md += `*${new Date().toLocaleDateString('zh-CN')}*\n\n`
  md += `---\n\n`

  chapters.forEach((chapter, idx) => {
    md += `## 第${idx + 1}章 ${chapter.title}\n\n`
    md += chapter.content.split('\n\n').map(p => p.trim()).join('\n\n')
    md += '\n\n---\n\n'
  })

  return new Blob([md], { type: 'text/markdown;charset=utf-8' })
}
