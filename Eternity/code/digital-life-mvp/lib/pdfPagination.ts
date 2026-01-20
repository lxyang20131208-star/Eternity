/**
 * PDF智能分页引擎
 * 在渲染前预计算每页内容，确保段落不被截断
 */

export interface PageContent {
  pageNumber: number;
  type: 'cover' | 'toc' | 'chapter-start' | 'chapter-continue';
  chapterNumber?: number;
  chapterTitle?: string;
  paragraphs: string[];
  isChapterStart?: boolean;
}

export interface PaginationConfig {
  pageWidth: number;      // mm
  pageHeight: number;     // mm
  marginTop: number;      // mm
  marginBottom: number;   // mm
  marginInner: number;    // mm
  marginOuter: number;    // mm
  fontSize: number;       // pt
  lineHeight: number;     // multiplier
  chapterTopSpacing: number;  // mm - space at top of chapter start
  chapterTitleHeight: number; // mm - height of chapter title block
}

/**
 * 计算页面可用高度（mm）
 */
export function getUsableHeight(config: PaginationConfig, isChapterStart: boolean): number {
  const totalHeight = config.pageHeight - config.marginTop - config.marginBottom;
  if (isChapterStart) {
    return totalHeight - config.chapterTopSpacing - config.chapterTitleHeight;
  }
  return totalHeight;
}

/**
 * 估算段落高度（mm）
 * 基于字符数和页面宽度估算
 */
export function estimateParagraphHeight(
  text: string,
  config: PaginationConfig
): number {
  // 可用宽度（mm）
  const usableWidth = config.pageWidth - config.marginInner - config.marginOuter;

  // pt 转 mm: 1pt = 0.3528mm
  const fontSizeMm = config.fontSize * 0.3528;
  const lineHeightMm = fontSizeMm * config.lineHeight;

  // 估算每行字符数（中文字符宽度约等于字号）
  const charsPerLine = Math.floor(usableWidth / fontSizeMm);

  // 计算需要多少行
  const charCount = text.length;
  const lines = Math.ceil(charCount / charsPerLine);

  // 段落高度 = 行数 × 行高 + 段落间距
  const paragraphSpacing = 2; // mm
  return lines * lineHeightMm + paragraphSpacing;
}

/**
 * 将章节内容分页
 */
export function paginateChapter(
  chapterNumber: number,
  chapterTitle: string,
  content: string,
  config: PaginationConfig,
  startPageNumber: number
): PageContent[] {
  const pages: PageContent[] = [];

  // 分割段落
  const paragraphs = content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    // 空章节，只创建标题页
    pages.push({
      pageNumber: startPageNumber,
      type: 'chapter-start',
      chapterNumber,
      chapterTitle,
      paragraphs: ['（本章内容待补充）'],
      isChapterStart: true,
    });
    return pages;
  }

  let currentPage: PageContent = {
    pageNumber: startPageNumber,
    type: 'chapter-start',
    chapterNumber,
    chapterTitle,
    paragraphs: [],
    isChapterStart: true,
  };

  let currentHeight = 0;
  let usableHeight = getUsableHeight(config, true);

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraHeight = estimateParagraphHeight(para, config);

    // 检查是否能放入当前页
    if (currentHeight + paraHeight <= usableHeight) {
      // 可以放入当前页
      currentPage.paragraphs.push(para);
      currentHeight += paraHeight;
    } else {
      // 放不下，需要新页
      // 先保存当前页（如果有内容）
      if (currentPage.paragraphs.length > 0) {
        pages.push(currentPage);
      }

      // 创建新页
      currentPage = {
        pageNumber: startPageNumber + pages.length,
        type: 'chapter-continue',
        chapterNumber,
        chapterTitle,
        paragraphs: [para],
        isChapterStart: false,
      };

      // 新页的可用高度（非章节起始页）
      usableHeight = getUsableHeight(config, false);
      currentHeight = paraHeight;
    }
  }

  // 保存最后一页
  if (currentPage.paragraphs.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

/**
 * 将整本书分页
 */
export function paginateBook(
  chapters: Array<{ title: string; content: string }>,
  config: PaginationConfig
): PageContent[] {
  const allPages: PageContent[] = [];

  // 封面（页码1）
  allPages.push({
    pageNumber: 1,
    type: 'cover',
    paragraphs: [],
  });

  // 目录（页码2）
  allPages.push({
    pageNumber: 2,
    type: 'toc',
    paragraphs: chapters.map((ch, i) => `第${i + 1}章  ${ch.title}`),
  });

  // 章节内容
  let nextPageNumber = 3;

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const chapterPages = paginateChapter(
      i + 1,
      chapter.title,
      chapter.content,
      config,
      nextPageNumber
    );

    allPages.push(...chapterPages);
    nextPageNumber += chapterPages.length;
  }

  return allPages;
}

/**
 * 生成单页HTML
 */
export function generatePageHTML(
  page: PageContent,
  config: PaginationConfig,
  bookTitle: string,
  totalPages: number
): string {
  const { pageWidth, pageHeight, marginTop, marginBottom, marginInner, marginOuter } = config;
  const isLeftPage = page.pageNumber % 2 === 0;

  // 内容区域位置
  const contentLeft = isLeftPage ? marginOuter : marginInner;
  const contentWidth = pageWidth - marginInner - marginOuter;
  const contentHeight = pageHeight - marginTop - marginBottom;

  let contentHTML = '';

  if (page.type === 'cover') {
    contentHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        text-align: center;
      ">
        <h1 style="font-size: 28pt; font-weight: bold; margin-bottom: 20pt;">${escapeHtml(bookTitle)}</h1>
        <p style="font-size: 14pt; color: #666;">家族传记</p>
        <p style="font-size: 12pt; color: #999; margin-top: 40pt;">${new Date().getFullYear()}</p>
      </div>
    `;
  } else if (page.type === 'toc') {
    contentHTML = `
      <div style="padding-top: 30mm;">
        <h2 style="font-size: 20pt; font-weight: bold; text-align: center; margin-bottom: 25pt;">目录</h2>
        ${page.paragraphs.map((item, idx) => `
          <div style="
            display: flex;
            justify-content: space-between;
            padding: 8pt 0;
            border-bottom: 0.5pt dotted #ccc;
            font-size: ${config.fontSize}pt;
          ">
            <span>${escapeHtml(item)}</span>
            <span>${idx + 3}</span>
          </div>
        `).join('')}
      </div>
    `;
  } else if (page.type === 'chapter-start') {
    contentHTML = `
      <div style="padding-top: ${config.chapterTopSpacing}mm; text-align: center; margin-bottom: 15mm;">
        <div style="font-size: 12pt; color: #666; margin-bottom: 8pt;">第 ${page.chapterNumber} 章</div>
        <h2 style="font-size: 18pt; font-weight: bold;">${escapeHtml(page.chapterTitle || '')}</h2>
      </div>
      <div style="font-size: ${config.fontSize}pt; line-height: ${config.lineHeight}; text-align: justify;">
        ${page.paragraphs.map(p => `<p style="text-indent: 2em; margin: 0 0 0.8em 0;">${escapeHtml(p)}</p>`).join('')}
      </div>
    `;
  } else {
    // chapter-continue
    contentHTML = `
      <div style="font-size: ${config.fontSize}pt; line-height: ${config.lineHeight}; text-align: justify;">
        ${page.paragraphs.map(p => `<p style="text-indent: 2em; margin: 0 0 0.8em 0;">${escapeHtml(p)}</p>`).join('')}
      </div>
    `;
  }

  // 页眉（非封面和目录）
  const headerHTML = (page.type !== 'cover' && page.type !== 'toc') ? `
    <div style="
      position: absolute;
      top: ${marginTop / 2}mm;
      left: ${contentLeft}mm;
      right: ${pageWidth - contentLeft - contentWidth}mm;
      font-size: 9pt;
      color: #666;
      text-align: ${isLeftPage ? 'left' : 'right'};
    ">${escapeHtml(page.chapterTitle || bookTitle)}</div>
  ` : '';

  // 页脚页码（非封面）
  const footerHTML = page.type !== 'cover' ? `
    <div style="
      position: absolute;
      bottom: ${marginBottom / 2}mm;
      left: 0;
      right: 0;
      font-size: 10pt;
      color: #333;
      text-align: center;
    ">${page.pageNumber}</div>
  ` : '';

  return `
    <div class="page" data-page="${page.pageNumber}" style="
      position: relative;
      width: ${pageWidth}mm;
      height: ${pageHeight}mm;
      background: white;
      overflow: hidden;
      box-sizing: border-box;
    ">
      ${headerHTML}
      ${footerHTML}
      <div style="
        position: absolute;
        top: ${marginTop}mm;
        left: ${contentLeft}mm;
        width: ${contentWidth}mm;
        height: ${contentHeight}mm;
        overflow: hidden;
      ">
        ${contentHTML}
      </div>
    </div>
  `;
}

/**
 * 生成完整的书籍HTML（用于PDF导出）
 */
export function generatePaginatedBookHTML(
  chapters: Array<{ title: string; content: string }>,
  config: PaginationConfig,
  bookTitle: string
): string {
  const pages = paginateBook(chapters, config);

  const pagesHTML = pages.map(page =>
    generatePageHTML(page, config, bookTitle, pages.length)
  ).join('\n');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(bookTitle)}</title>
  <style>
    @page {
      size: ${config.pageWidth}mm ${config.pageHeight}mm;
      margin: 0;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Source Han Serif SC", "Noto Serif SC", "SimSun", serif;
      color: #000;
      background: white;
    }

    .page {
      page-break-after: always;
    }

    .page:last-child {
      page-break-after: auto;
    }
  </style>
</head>
<body>
  ${pagesHTML}
</body>
</html>
  `;
}

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
