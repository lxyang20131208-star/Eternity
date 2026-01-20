/**
 * Vivliostyle 专业图书排版引擎
 * 使用 CSS Paged Media 规范，支持智能分页和图片排版
 */

import { supabase } from './supabaseClient';

// ============ 类型定义 ============

export interface BookChapter {
  title: string;
  content: string;
  sourceIds: string[];  // 关联的 answer_session IDs
}

export interface ChapterPhoto {
  url: string;
  thumbUrl?: string;
  personNames: string[];
  caption?: string;
  questionId: string;
}

export interface BookConfig {
  title: string;
  subtitle?: string;
  author: string;         // 作者署名（必填）
  pageSize: 'A4' | 'A5' | 'B5' | 'Letter';
  fontSize: number;       // pt
  lineHeight: number;     // multiplier
  margins: {
    top: number;
    bottom: number;
    inner: number;
    outer: number;
  };
  includePhotos: boolean;
  photosPerChapter: number;  // 每章最多显示几张照片
  photoSize: 'small' | 'medium' | 'large' | 'full';
}

// 页面尺寸配置 (mm)
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  'A4': { width: 210, height: 297 },
  'A5': { width: 148, height: 210 },
  'B5': { width: 176, height: 250 },
  'Letter': { width: 216, height: 279 },
};

// 照片尺寸配置
const PHOTO_SIZES: Record<string, { width: string; maxHeight: string }> = {
  'small': { width: '40%', maxHeight: '80mm' },
  'medium': { width: '60%', maxHeight: '100mm' },
  'large': { width: '80%', maxHeight: '120mm' },
  'full': { width: '100%', maxHeight: '150mm' },
};

// ============ 数据获取 ============

/**
 * 根据章节的 source_ids 获取关联的照片
 */
export async function getChapterPhotos(
  projectId: string,
  sourceIds: string[]
): Promise<ChapterPhoto[]> {
  // 如果没有 source_ids，直接返回空数组（这是正常情况）
  if (!sourceIds || sourceIds.length === 0) {
    return [];
  }

  try {
    // 1. 先获取 answer_sessions 的 question_ids
    const { data: sessions, error: sessionError } = await supabase
      .from('answer_sessions')
      .select('id, question_id')
      .in('id', sourceIds);

    // 如果查询出错，记录错误但不中断流程
    if (sessionError) {
      console.warn('[getChapterPhotos] Session query error:', sessionError.message);
      return [];
    }

    // 没有找到 sessions 是正常情况（可能 source_ids 无效）
    if (!sessions || sessions.length === 0) {
      return [];
    }

    const questionIds = sessions
      .map(s => s.question_id)
      .filter((id): id is string => !!id);

    // 没有 question_ids 也是正常情况
    if (questionIds.length === 0) {
      return [];
    }

    // 2. 根据 question_ids 获取照片
    const { data: photos, error: photoError } = await supabase
      .from('answer_photos')
      .select('photo_url, person_names, question_id')
      .eq('project_id', projectId)
      .in('question_id', questionIds)
      .order('display_order', { ascending: true });

    if (photoError) {
      console.warn('[getChapterPhotos] Photo query error:', photoError.message);
      return [];
    }

    // 没有照片是正常情况
    if (!photos || photos.length === 0) {
      return [];
    }

    return photos.map(p => ({
      url: p.photo_url,
      personNames: p.person_names || [],
      questionId: p.question_id,
    }));
  } catch (e) {
    console.warn('[getChapterPhotos] Unexpected error:', e);
    return [];
  }
}

/**
 * 为所有章节批量获取照片
 */
export async function getAllChapterPhotos(
  projectId: string,
  chapters: BookChapter[]
): Promise<Map<number, ChapterPhoto[]>> {
  const photoMap = new Map<number, ChapterPhoto[]>();

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const photos = await getChapterPhotos(projectId, chapter.sourceIds);
    photoMap.set(i, photos);
  }

  return photoMap;
}

// ============ HTML 生成 ============

/**
 * 生成 Vivliostyle 兼容的书籍 HTML
 */
export function generateVivliostyleHTML(
  config: BookConfig,
  chapters: BookChapter[],
  chapterPhotos: Map<number, ChapterPhoto[]>
): string {
  const pageSize = PAGE_SIZES[config.pageSize];
  const photoSizeConfig = PHOTO_SIZES[config.photoSize];

  const css = generateVivliostyleCSS(config, pageSize);

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(config.title)}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="print-hint">
    📖 按 <strong>Ctrl+P</strong> (Mac: <strong>Cmd+P</strong>) 导出 PDF
  </div>
  <div class="book-content">
`;

  // 封面
  html += generateCoverPage(config);

  // 目录
  html += generateTOCPage(chapters);

  // 章节
  chapters.forEach((chapter, idx) => {
    const photos = chapterPhotos.get(idx) || [];
    const limitedPhotos = photos.slice(0, config.photosPerChapter);
    html += generateChapterHTML(chapter, idx + 1, limitedPhotos, config);
  });

  html += `
  </div>
</body>
</html>`;

  return html;
}

/**
 * 生成 Vivliostyle CSS（符合 CSS Paged Media 规范）
 */
function generateVivliostyleCSS(
  config: BookConfig,
  pageSize: { width: number; height: number }
): string {
  const { margins, fontSize, lineHeight } = config;

  // 计算版心尺寸
  const contentWidth = pageSize.width - margins.inner - margins.outer;

  return `
    /* ========== CSS Paged Media 规范 ========== */
    @page {
      size: ${pageSize.width}mm ${pageSize.height}mm;
      margin: ${margins.top}mm ${margins.outer}mm ${margins.bottom}mm ${margins.inner}mm;

      /* 页脚页码 */
      @bottom-center {
        content: counter(page);
        font-size: 10pt;
        color: #333;
      }
    }

    /* 封面页不显示页码 */
    @page cover {
      @bottom-center { content: none; }
    }

    /* 目录页使用罗马数字 */
    @page toc {
      @bottom-center {
        content: counter(page, lower-roman);
      }
    }

    /* 章节起始页 - 页码在底部居中 */
    @page chapter-start {
      @bottom-center {
        content: counter(page);
        font-size: 10pt;
      }
    }

    /* ========== 基础样式 ========== */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      font-size: ${fontSize}pt;
    }

    body {
      font-family: "Source Han Serif SC", "Noto Serif SC", "SimSun", "STSong", Georgia, serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      color: #1a1a1a;
      text-align: justify;
      background: #e8e8e8;
      padding: 20px;
      counter-reset: page 1;
    }

    /* ========== 屏幕预览样式 ========== */
    @media screen {
      .book-content {
        max-width: ${pageSize.width}mm;
        margin: 0 auto;
        background: white;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: ${margins.top}mm ${margins.outer}mm ${margins.bottom}mm ${margins.inner}mm;
      }

      .page-break {
        border-top: 2px dashed #ccc;
        margin: 30px 0;
        position: relative;
      }

      .page-break::after {
        content: '— 分页 —';
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        background: #e8e8e8;
        padding: 0 15px;
        color: #999;
        font-size: 12px;
      }
    }

    /* ========== 封面 ========== */
    .cover-page {
      page: cover;
      min-height: ${pageSize.height - margins.top - margins.bottom}mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      break-after: page;
    }

    .cover-page h1 {
      font-size: 32pt;
      font-weight: bold;
      margin-bottom: 20pt;
      letter-spacing: 0.1em;
    }

    .cover-page .subtitle {
      font-size: 14pt;
      color: #666;
      margin-bottom: 15pt;
    }

    .cover-page .author {
      font-size: 14pt;
      color: #444;
      margin-bottom: 40pt;
    }

    .cover-page .year {
      font-size: 12pt;
      color: #999;
    }

    /* ========== 目录 ========== */
    .toc-page {
      page: toc;
      padding-top: 20mm;
      break-after: page;
    }

    .toc-title {
      font-size: 20pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 25pt;
    }

    .toc-list {
      list-style: none;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 8pt 0;
      border-bottom: 0.5pt dotted #ccc;
    }

    .toc-item a {
      color: inherit;
      text-decoration: none;
      flex: 1;
    }

    .toc-item .toc-page-num {
      margin-left: 10pt;
      color: #666;
    }

    /* ========== 章节 ========== */
    .chapter {
      break-before: page;
      page: chapter-start;
    }

    .chapter-header {
      padding-top: 20mm;
      text-align: center;
      margin-bottom: 12mm;
    }

    .chapter-number {
      font-size: 12pt;
      color: #666;
      margin-bottom: 8pt;
    }

    .chapter-title {
      font-size: 18pt;
      font-weight: bold;
    }

    /* ========== 正文段落 ========== */
    .chapter-content p {
      text-indent: 2em;
      margin-bottom: 0.8em;
      text-align: justify;
      orphans: 2;
      widows: 2;
    }

    /* 防止段落在页面底部被截断 - 至少保留2行 */
    .chapter-content p {
      break-inside: avoid-page;
    }

    /* ========== 图片 ========== */
    .photo-container {
      break-inside: avoid;
      margin: 1.5em auto;
      text-align: center;
    }

    .photo-container img {
      max-width: ${PHOTO_SIZES[config.photoSize].width};
      max-height: ${PHOTO_SIZES[config.photoSize].maxHeight};
      object-fit: contain;
    }

    .photo-caption {
      font-size: 9pt;
      color: #666;
      margin-top: 6pt;
      font-style: italic;
    }

    .photo-group {
      break-inside: avoid;
      margin: 2em 0;
      padding: 1em;
      background: #fafafa;
      border-radius: 4pt;
    }

    .photo-group-title {
      font-size: 10pt;
      color: #888;
      margin-bottom: 1em;
      text-align: center;
    }

    .photo-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10pt;
    }

    .photo-grid .photo-item {
      flex: 0 0 45%;
      max-width: 45%;
    }

    .photo-grid .photo-item img {
      width: 100%;
      height: auto;
      max-height: 60mm;
      object-fit: cover;
    }

    /* ========== 引用 ========== */
    blockquote {
      margin: 1.5em 2em;
      padding-left: 1em;
      border-left: 2pt solid #ccc;
      font-style: italic;
      color: #444;
      break-inside: avoid;
    }

    /* ========== 打印提示 ========== */
    .print-hint {
      position: fixed;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 25px;
      border-radius: 10px;
      font-size: 14px;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }

    .print-hint strong {
      background: rgba(255,255,255,0.2);
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* ========== 打印优化 ========== */
    @media print {
      body {
        background: white;
        padding: 0;
      }

      .book-content {
        max-width: none;
        padding: 0;
        box-shadow: none;
      }

      .page-break {
        display: none;
      }

      .print-hint {
        display: none;
      }

      .cover-page {
        height: 100vh;
      }

      /* 确保段落不被截断 */
      p, .photo-container, .photo-group, blockquote {
        page-break-inside: avoid;
        break-inside: avoid;
      }

      /* 章节标题和第一段保持在一起 */
      .chapter-header {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  `;
}

/**
 * 生成封面页
 */
function generateCoverPage(config: BookConfig): string {
  return `
  <section class="cover-page">
    <h1>${escapeHtml(config.title)}</h1>
    ${config.subtitle ? `<p class="subtitle">${escapeHtml(config.subtitle)}</p>` : '<p class="subtitle">家族传记</p>'}
    ${config.author ? `<p class="author">${escapeHtml(config.author)} 著</p>` : ''}
    <p class="year">${new Date().getFullYear()}</p>
  </section>
`;
}

/**
 * 生成目录页
 */
function generateTOCPage(chapters: BookChapter[]): string {
  let html = `
  <section class="toc-page">
    <h2 class="toc-title">目录</h2>
`;

  chapters.forEach((chapter, idx) => {
    html += `
    <div class="toc-item">
      <a href="#chapter-${idx + 1}">第${idx + 1}章  ${escapeHtml(chapter.title)}</a>
    </div>
`;
  });

  html += `
  </section>
`;

  return html;
}

/**
 * 生成章节 HTML（包含图片）
 */
function generateChapterHTML(
  chapter: BookChapter,
  chapterNum: number,
  photos: ChapterPhoto[],
  config: BookConfig
): string {
  // 分割段落
  const paragraphs = chapter.content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  let html = `
  <section class="chapter" id="chapter-${chapterNum}">
    <div class="chapter-header">
      <div class="chapter-number">第 ${chapterNum} 章</div>
      <h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>
    </div>
    <div class="chapter-content">
`;

  // 计算图片插入位置（在外部定义，避免作用域问题）
  const photoInsertPositions = calculatePhotoPositions(paragraphs.length, photos.length);

  if (paragraphs.length === 0) {
    html += `      <p>（本章内容待补充）</p>\n`;
  } else {
    paragraphs.forEach((para, idx) => {
      // 先输出段落
      html += `      <p>${escapeHtml(para)}</p>\n`;

      // 检查是否需要在此位置插入图片
      if (config.includePhotos && photoInsertPositions.has(idx)) {
        const photoIndex = photoInsertPositions.get(idx)!;
        if (photoIndex < photos.length) {
          html += generatePhotoHTML(photos[photoIndex]);
        }
      }
    });
  }

  // 如果还有剩余图片，放在章节末尾
  const usedPhotoCount = photoInsertPositions.size;
  if (config.includePhotos && photos.length > usedPhotoCount) {
    const remainingPhotos = photos.slice(usedPhotoCount);
    if (remainingPhotos.length > 0) {
      html += generatePhotoGroup(remainingPhotos, '相关照片');
    }
  }

  html += `
    </div>
  </section>
`;

  return html;
}

/**
 * 计算图片插入位置
 * 返回 Map<段落索引, 图片索引>
 */
function calculatePhotoPositions(
  paragraphCount: number,
  photoCount: number
): Map<number, number> {
  const positions = new Map<number, number>();

  if (paragraphCount === 0 || photoCount === 0) {
    return positions;
  }

  // 最多在正文中插入 3 张图片，其余放到末尾
  const maxInlinePhotos = Math.min(3, photoCount);

  // 均匀分布
  const interval = Math.floor(paragraphCount / (maxInlinePhotos + 1));

  for (let i = 0; i < maxInlinePhotos; i++) {
    const position = (i + 1) * interval - 1;
    if (position < paragraphCount) {
      positions.set(position, i);
    }
  }

  return positions;
}

/**
 * 生成单张图片 HTML
 */
function generatePhotoHTML(photo: ChapterPhoto): string {
  const caption = photo.personNames.length > 0
    ? photo.personNames.join('、')
    : '';

  return `
      <div class="photo-container">
        <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(caption)}" loading="lazy" />
        ${caption ? `<p class="photo-caption">${escapeHtml(caption)}</p>` : ''}
      </div>
`;
}

/**
 * 生成图片组 HTML
 */
function generatePhotoGroup(photos: ChapterPhoto[], title: string): string {
  if (photos.length === 0) return '';

  let html = `
      <div class="photo-group">
        <p class="photo-group-title">${escapeHtml(title)}</p>
        <div class="photo-grid">
`;

  photos.forEach(photo => {
    const caption = photo.personNames.length > 0
      ? photo.personNames.join('、')
      : '';

    html += `
          <div class="photo-item">
            <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(caption)}" loading="lazy" />
            ${caption ? `<p class="photo-caption">${escapeHtml(caption)}</p>` : ''}
          </div>
`;
  });

  html += `
        </div>
      </div>
`;

  return html;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ============ 导出工具 ============

/**
 * 使用浏览器打印功能导出 PDF
 * 这是最简单的方案，利用浏览器原生支持的 CSS Paged Media
 */
export function printToPDF(html: string): void {
  // 方法1：使用 Blob URL（更可靠）
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(url);
    alert('请允许弹出窗口以导出 PDF');
    return;
  }

  // 等待内容加载完成后打印
  printWindow.onload = () => {
    // 给字体和内容一些时间渲染
    setTimeout(() => {
      printWindow.print();
      // 打印对话框关闭后清理 URL
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    }, 1000);
  };

  // 备用方案：如果 onload 没有触发（某些浏览器）
  setTimeout(() => {
    if (printWindow && !printWindow.closed) {
      // 检查文档是否已加载
      try {
        if (printWindow.document.readyState === 'complete') {
          // 已经加载完成，不需要再触发打印
        }
      } catch (e) {
        // 跨域错误，忽略
      }
    }
  }, 3000);
}

/**
 * 生成预览 HTML（在 iframe 中显示）
 */
export function createPreviewIframe(html: string, container: HTMLElement): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  container.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
  }

  return iframe;
}
