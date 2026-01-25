import { JSONContent } from '@tiptap/react'

// Tiptap 富文本内容类型
export interface RichTextContent {
  type: 'doc'
  content: JSONContent[]
}

// 扩展后的章节结构 (V2)
export interface OutlineSectionV2 {
  title: string
  title_rich?: RichTextContent
  bullets: string[]
  bullets_rich?: RichTextContent[]
  quotes?: Array<{ text: string; source_id: string }>
  quotes_rich?: Array<{ text_rich: RichTextContent; source_id: string }>
  source_ids: string[]
  order?: number
}

// 扩展后的大纲结构 (V2)
export interface OutlineJSONV2 {
  title: string
  title_rich?: RichTextContent
  book_title?: string
  author_name?: string
  generatedAt: string
  totalSessions: number
  sections: OutlineSectionV2[]
  schema_version?: 2
}

// 辅助函数：纯文本转 Tiptap JSON
export function textToRichContent(text: string): RichTextContent {
  return {
    type: 'doc',
    content: text ? [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }
    ] : []
  }
}

// 辅助函数：Tiptap JSON 转纯文本
export function richContentToText(content: RichTextContent | undefined): string {
  if (!content?.content) return ''
  return content.content
    .map(node => extractText(node))
    .join('\n')
}

function extractText(node: JSONContent): string {
  if (node.type === 'text') return (node.text as string) || ''
  if (node.content) return (node.content as JSONContent[]).map(extractText).join('')
  return ''
}

// 创建空的富文本章节
export function createEmptySection(order: number): OutlineSectionV2 {
  return {
    title: '',
    title_rich: textToRichContent(''),
    bullets: [],
    bullets_rich: [],
    quotes: [],
    quotes_rich: [],
    source_ids: [],
    order
  }
}

// 创建空的富文本要点
export function createEmptyBullet(): RichTextContent {
  return textToRichContent('')
}
