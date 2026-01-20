import { PrintConfig } from './printConfig';

/**
 * 生成专业排版的书籍HTML
 * 支持智能分页，确保段落不被截断
 */
export function generateBookHTML(
  config: PrintConfig,
  bookTitle: string,
  chapters: Array<{ title: string; content: string }>,
  includeCSS: string
): string {
  const { pageSize, margins, body, chapter, header, footer } = config;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${bookTitle}</title>
  <style>
    ${includeCSS}

    /* 智能分页样式 - 确保段落不被截断 */
    .chapter-content p {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }

    /* 章节标题区域不分页 */
    .chapter-title-page {
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }

    /* 确保章节从新页开始 */
    .chapter-page {
      break-before: always;
      page-break-before: always;
    }

    /* 第一个章节不需要强制分页 */
    .chapter-page:first-of-type {
      break-before: auto;
      page-break-before: auto;
    }
  </style>
</head>
<body>`;

  // 封面页
  html += generateTitlePage(bookTitle, pageSize.bleed);

  // 目录页
  html += generateTOC(chapters, pageSize.bleed);

  // 章节内容 - 使用智能分页
  chapters.forEach((chap, idx) => {
    const isOdd = (idx + 3) % 2 === 1; // 封面和目录占2页
    html += generateChapterPages(
      chap,
      idx + 1,
      chapters.length,
      isOdd ? 'right' : 'left',
      config,
      bookTitle
    );
  });

  html += `</body></html>`;
  return html;
}

/**
 * 生成封面页
 */
function generateTitlePage(bookTitle: string, bleed: number): string {
  return `
  <div class="page title-page" data-page="cover">
    <div class="content-area">
      <h1>${escapeHtml(bookTitle)}</h1>
      <p class="subtitle">家族传记</p>
      <p class="subtitle">${new Date().getFullYear()}</p>
    </div>
  </div>`;
}

/**
 * 生成目录页
 */
function generateTOC(
  chapters: Array<{ title: string }>,
  bleed: number
): string {
  let html = `
  <div class="page left toc-page" data-page="toc">
    <div class="content-area">
      <div class="toc">
        <h2 class="toc-title">目录</h2>`;

  chapters.forEach((chap, idx) => {
    // 简单页码计算：封面1页+目录1页+每章1页起始
    const pageNum = idx + 3;
    html += `
        <div class="toc-item">
          <span class="toc-chapter">第${idx + 1}章  ${escapeHtml(chap.title)}</span>
          <span class="toc-page">${pageNum}</span>
        </div>`;
  });

  html += `
      </div>
    </div>
  </div>`;

  return html;
}

/**
 * 生成章节页面
 * 使用CSS break-inside: avoid 确保段落不被截断
 */
function generateChapterPages(
  chapter: { title: string; content: string },
  chapterNum: number,
  totalChapters: number,
  side: 'left' | 'right',
  config: PrintConfig,
  bookTitle: string
): string {
  const { header, footer, chapter: chapterConfig } = config;

  // 页码计算
  const pageNum = chapterNum + 2; // 封面+目录

  let html = `
  <div class="page ${side} chapter-page" data-chapter="${chapterNum}">
    ${header.enabled ? generateHeader(header.content === 'book' ? bookTitle : chapter.title, side) : ''}
    ${footer.enabled ? generateFooter(pageNum, footer.pageNumberPosition, side) : ''}

    <div class="content-area">
      <div class="chapter-title-page">
        <div class="chapter-number">第 ${chapterNum} 章</div>
        <h2 class="chapter-title">${escapeHtml(chapter.title)}</h2>
      </div>

      <div class="chapter-content">
        ${formatChapterContent(chapter.content, chapterConfig.dropCap)}
      </div>
    </div>
  </div>`;

  return html;
}

/**
 * 生成页眉
 */
function generateHeader(text: string, side: 'left' | 'right'): string {
  return `<div class="header ${side}">${escapeHtml(text)}</div>`;
}

/**
 * 生成页脚（页码）
 */
function generateFooter(
  pageNum: number,
  position: 'center' | 'outer' | 'inner',
  side: 'left' | 'right'
): string {
  let posClass: string = position;
  if (position === 'outer') {
    posClass = `outer ${side}`;
  } else if (position === 'inner') {
    posClass = `inner ${side}`;
  }

  return `<div class="footer ${posClass}">${pageNum}</div>`;
}

/**
 * 格式化章节内容
 * 所有段落使用统一样式，首段缩进与普通段落一致
 */
function formatChapterContent(content: string, dropCap: boolean): string {
  // 分段
  const paragraphs = content
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) return '';

  let html = '';
  paragraphs.forEach((para, idx) => {
    // 所有段落使用统一样式，不对首段做特殊处理
    // 首字下沉仅在段落内部通过CSS伪元素实现，不影响缩进
    const className = idx === 0 && dropCap ? 'first-para' : '';
    html += `<p class="${className}">${escapeHtml(para)}</p>\n`;
  });

  return html;
}

/**
 * HTML转义
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
