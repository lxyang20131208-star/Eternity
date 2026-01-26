/**
 * Vivliostyle 专业图书排版引擎
 * 使用 CSS Paged Media 规范，支持智能分页和图片排版
 */

import { supabase as defaultSupabase } from './supabaseClient';
import { SupabaseClient } from '@supabase/supabase-js';

// ============ 类型定义 ============

export interface BookChapter {
  title: string;
  content: string;
  sourceIds: string[];  // 关联的 answer_session IDs
  chapterId?: string;   // 章节 ID (通常是索引)
  outlineId?: string;   // 大纲 ID
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
  sourceIds: string[],
  outlineId?: string,
  chapterId?: string,
  supabaseClient?: SupabaseClient
): Promise<ChapterPhoto[]> {
  const supabase = supabaseClient || defaultSupabase;
  try {
    const questionIds = new Set<string>();

    console.log('[getChapterPhotos] Fetching for sourceIds:', sourceIds, 'OutlineId:', outlineId);

    // 1. 从 answer_sessions 获取 question_ids
    if (sourceIds && sourceIds.length > 0) {
      // Validate UUIDs
      const validSourceIds = sourceIds.filter(id => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      );

      if (validSourceIds.length > 0) {
        const { data: sessions, error: sessionError } = await supabase
          .from('answer_sessions')
          .select('question_id')
          .in('id', validSourceIds);
        
        if (sessionError) {
          console.error('[getChapterPhotos] Session query error:', sessionError);
        }

        if (sessions) {
          sessions.forEach(s => {
            if (s.question_id) questionIds.add(String(s.question_id));
          });
        }
      } else {
        console.warn('[getChapterPhotos] No valid UUIDs in sourceIds:', sourceIds);
      }
    }

    // 2. 从 chapter_question_links 获取 question_ids
    if (outlineId && chapterId) {
      // Validate UUID for outlineId
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outlineId)) {
        const { data: links, error: linkError } = await supabase
          .from('chapter_question_links')
          .select('question_id')
          .eq('outline_version_id', outlineId)
          .eq('chapter_id', chapterId);
        
        if (linkError) {
          console.error('[getChapterPhotos] Link query error:', linkError);
        }

        if (links) {
          links.forEach(l => {
            if (l.question_id) questionIds.add(String(l.question_id));
          });
        }
      } else {
        console.warn('[getChapterPhotos] Invalid outlineId UUID:', outlineId);
      }
    }

    if (questionIds.size === 0) {
      console.log('[getChapterPhotos] No question IDs found for chapter');
      return [];
    }

    const questionIdList = Array.from(questionIds);

    // 3. 根据 question_ids 获取照片 (使用新的 photo_memories 系统)
    const { data: photos, error: photoError } = await supabase
      .from('photo_memories')
      .select(`
        photo_url,
        caption,
        linked_question_id,
        photo_people(
          people_roster(name)
        )
      `)
      .in('linked_question_id', questionIdList)
      .eq('annotation_status', 'complete')
      .order('created_at', { ascending: true });

    if (photoError) {
      console.warn('[getChapterPhotos] Photo query error:', photoError.message);
      return [];
    }

    // 没有照片是正常情况
    if (!photos || photos.length === 0) {
      return [];
    }

    return photos.map(p => {
      // 提取人物姓名
      const personNames = p.photo_people
        ? (p.photo_people as any[])
            .map(pp => pp.people_roster?.name)
            .filter(Boolean)
        : [];

      return {
        url: p.photo_url,
        personNames: personNames,
        caption: p.caption || '',
        questionId: p.linked_question_id,
      };
    });
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
  chapters: BookChapter[],
  supabaseClient?: SupabaseClient
): Promise<Map<number, ChapterPhoto[]>> {
  const photoMap = new Map<number, ChapterPhoto[]>();

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const photos = await getChapterPhotos(
      projectId,
      chapter.sourceIds,
      chapter.outlineId,
      chapter.chapterId,
      supabaseClient
    );
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
  chapterPhotos: Map<number, ChapterPhoto[]>,
  mode: 'client' | 'server' = 'client'
): string {
  const pageSize = PAGE_SIZES[config.pageSize];
  const photoSizeConfig = PHOTO_SIZES[config.photoSize];

  const css = generateVivliostyleCSS(config, pageSize);

  // Client-side specific scripts and styles
  const clientScripts = mode === 'client' ? `
    /* Loading Overlay 样式 */
    #loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: white;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      font-family: system-ui, -apple-system, sans-serif;
      transition: opacity 0.5s;
    }
    
    #loading-overlay.hidden {
      opacity: 0;
      pointer-events: none;
    }

    .loading-content {
      text-align: center;
      max-width: 400px;
      padding: 40px;
    }

    .spinner-large {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(0, 0, 0, 0.1);
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 30px;
    }

    .loading-title {
      font-size: 24px;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 16px;
    }

    .loading-text {
      font-size: 16px;
      color: #666;
      margin-bottom: 8px;
    }

    .sub-text {
      font-size: 13px;
      color: #999;
      margin-top: 20px;
    }

    .progress-bar {
      width: 100%;
      height: 6px;
      background: #f0f0f0;
      border-radius: 3px;
      margin-top: 20px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #3498db;
      width: 0%;
      transition: width 0.3s ease;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* 打印时绝对隐藏 */
    @media print {
      #loading-overlay { display: none !important; }
      #status-bar { display: none !important; }
    }
  ` : '';

  const clientJS = mode === 'client' ? `
  <script>
    // 定义全局变量
    let overlay, progressFill, loadingText, printBtn;
    let images = [];
    let total = 0;
    let loaded = 0;
    let printTriggered = false;

    // 手动打印函数 - 提前定义
    window.triggerPrint = () => {
      if (printTriggered) return;
      printTriggered = true;
      
      console.log('Triggering print sequence...');
      
      const overlayEl = document.getElementById('loading-overlay');
      const fillEl = document.querySelector('.progress-fill');
      const textEl = document.querySelector('.loading-text');
      
      // 更新 UI 状态
      if (textEl) textEl.textContent = '✅ 渲染完成，正在唤起打印...';
      if (fillEl) fillEl.style.width = '100%';
      
      // 延迟一点时间让用户看到完成状态，然后隐藏遮罩并打印
      setTimeout(() => {
        if (overlayEl) {
          overlayEl.classList.add('hidden');
          setTimeout(() => {
            overlayEl.style.display = 'none';
            console.log('Calling window.print()');
            window.print();
          }, 500);
        } else {
           window.print();
        }
      }, 800);
    };

    // 关闭预览函数
    window.closePreview = () => {
        // 如果是在 iframe 中
        if (window.frameElement && window.parent) {
            try {
                // 通知父窗口移除 iframe
                const event = new CustomEvent('close-preview-iframe');
                window.parent.dispatchEvent(event);
                // 备用：直接尝试移除
                window.parent.document.body.removeChild(window.frameElement);
            } catch(e) {
                console.error('Error closing iframe:', e);
            }
        } else {
            // 如果是在新窗口中
            window.close();
        }
    };

    // 立即启动超时保护（不等待 load 事件）
    // 60秒强制打印
    setTimeout(() => {
      if (!printTriggered) {
         console.warn('Global timeout reached (60s), forcing print...');
         const textEl = document.querySelector('.loading-text');
         if (textEl) textEl.textContent = '⚠️ 加载时间较长，正在尝试打印...';
         window.triggerPrint();
      }
    }, 60000);

    // 监听 DOM 内容加载（不需要等待图片）
    document.addEventListener('DOMContentLoaded', () => {
      overlay = document.getElementById('loading-overlay');
      progressFill = document.querySelector('.progress-fill');
      loadingText = document.querySelector('.loading-text');
      printBtn = document.getElementById('manual-print-btn');
      
      images = Array.from(document.querySelectorAll('img'));
      total = images.length;
      
      console.log('DOM Ready. Found ' + total + ' images.');

      if (printBtn) {
        printBtn.addEventListener('click', window.triggerPrint);
      }

      // 如果没有图片，模拟进度条
      if (total === 0) {
        let fakeProgress = 0;
        const interval = setInterval(() => {
            fakeProgress += 10;
            if (progressFill) progressFill.style.width = \`\${fakeProgress}%\`;
            if (fakeProgress >= 100) {
                clearInterval(interval);
                window.triggerPrint();
            }
        }, 100);
      } else {
        // 绑定图片加载事件
        images.forEach(img => {
          if (img.complete) {
            updateProgress();
          } else {
            img.onload = updateProgress;
            img.onerror = updateProgress;
          }
        });
      }
    });

    // 即使 DOMContentLoaded 触发了，load 事件也是一个很好的双重检查点
    window.addEventListener('load', () => {
      console.log('Window Load event fired');
      // 检查是否所有图片都处理完了，防止漏网之鱼
      // 但不在这里触发打印，除非之前的逻辑失效
    });

    function updateProgress() {
      loaded++;
      const percent = Math.round((loaded / total) * 100);
      
      if (progressFill) {
         progressFill.style.width = \`\${percent}%\`;
      }
      
      if (loadingText) {
         loadingText.textContent = \`正在加载图片资源 (\${loaded}/\${total})...\`;
      }

      if (loaded >= total) {
        console.log('All images loaded.');
        // 所有图片加载完成
        setTimeout(() => {
          window.triggerPrint();
        }, 500);
      }
    }
  </script>` : '';

  const overlayHTML = mode === 'client' ? `
  <div id="loading-overlay">
    <div class="loading-content">
      <div class="spinner-large"></div>
      <div class="loading-title">正在生成打印版式</div>
      <div class="loading-text">正在分析文档结构...</div>
      <div class="progress-bar"><div class="progress-fill"></div></div>
      <div class="sub-text">文档内容较多，可能需要 1-2 分钟<br>请保持窗口打开，直到打印对话框弹出</div>
    </div>
  </div>

  <div id="status-bar" style="display:none;">
    <!-- 保留结构但默认隐藏，逻辑上已被 Overlay 取代 -->
    <button id="manual-print-btn">立即打印 (Ctrl+P)</button>
    <button onclick="window.closePreview()" style="margin-left:10px; background:#e74c3c; border:none; color:white; padding:4px 12px; border-radius:4px; cursor:pointer;">关闭预览</button>
  </div>
  ` : '';

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(config.title)}</title>
  <style>
${css}
${clientScripts}
  </style>
${clientJS}
</head>
<body>
${overlayHTML}
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
  console.log('[generateVivliostyleCSS] Config used:', {
    pageSize: config.pageSize,
    actualSize: pageSize,
    margins: config.margins
  });

  const { margins, fontSize, lineHeight } = config;

  // 计算版心尺寸
  const contentWidth = pageSize.width - margins.inner - margins.outer;

  return `
    /* ========== CSS Paged Media 规范 ========== */
    @page {
      size: ${pageSize.width}mm ${pageSize.height}mm;
      /* 移除 @page 边距，改用 body padding 模拟 */
      margin: 0; 
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
      background: white;
      /* 使用 padding 模拟页边距，这是最稳妥的兼容方案 */
      padding: ${margins.top}mm ${margins.outer}mm ${margins.bottom}mm ${margins.inner}mm;
      width: ${pageSize.width}mm;
      min-height: ${pageSize.height}mm;
      margin: 0 auto;
    }

    /* ========== 屏幕预览样式 ========== */
    @media screen {
      .book-content {
        width: ${pageSize.width}mm;
        max-width: none;
        margin: 0 auto;
        background: white;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        padding: ${margins.top}mm ${margins.outer}mm ${margins.bottom}mm ${margins.inner}mm;
        /* 在屏幕上模拟物理尺寸 */
        min-height: ${pageSize.height}mm;
        box-sizing: border-box; /* 关键修复：确保 padding 包含在 width 内 */
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
      /* 强制设置页面尺寸，边距设为0 */
      @page {
        size: ${pageSize.width}mm ${pageSize.height}mm;
        margin: 0 !important;
      }

      html, body {
        width: ${pageSize.width}mm !important;
        height: auto !important;
        overflow: visible !important;
        background: white !important;
        margin: 0 !important;
        /* 关键：打印时使用 padding 作为边距 */
        padding: ${margins.top}mm ${margins.outer}mm ${margins.bottom}mm ${margins.inner}mm !important;
      }

      /* 强制内容容器尺寸 */
      .book-content {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none;
        overflow: visible !important;
      }

      /* 如果浏览器忽略 @page margin，我们可以尝试用 padding 模拟，但通常 @page 更准确 */
      /* 备选方案：如果用户反馈边距还是不对，可以尝试将 padding 移到 body 上，但这会影响分页 */
      
      .page-break {
        display: none;
      }

      .print-hint {
        display: none;
      }

      /* 打印时强制隐藏加载遮罩 */
      #loading-overlay {
        display: none !important;
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
    ${config.subtitle ? `<p class="subtitle">${escapeHtml(config.subtitle)}</p>` : ''}
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
    : (photo.caption || ''); // Fallback to photo.caption if no person names

  return `
      <div class="photo-container">
        <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(caption)}" />
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
      : (photo.caption || ''); // Fallback to photo.caption if no person names

    html += `
          <div class="photo-item">
            <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(caption)}" />
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
 * 使用 iframe 在当前页面进行打印，替代 window.open
 * 解决弹窗拦截、Blob URL 失效和加载不稳定问题
 */
export function printToPDF(html: string): void {
  // 1. 创建全屏 iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '100vw';
  iframe.style.height = '100vh';
  iframe.style.border = 'none';
  iframe.style.zIndex = '2147483647'; // 最高层级
  iframe.style.backgroundColor = 'white';
  iframe.id = 'print-preview-iframe';
  
  // 2. 添加到文档流
  document.body.appendChild(iframe);
  
  // 3. 监听关闭事件（供 HTML 内部调用）
  const closeHandler = () => {
    try {
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
        window.removeEventListener('close-preview-iframe', closeHandler);
    } catch (e) {
        console.warn('Error removing iframe:', e);
    }
  };
  window.addEventListener('close-preview-iframe', closeHandler);

  // 4. 写入内容
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
      alert('无法创建打印预览窗口，请重试');
      return;
  }
  
  doc.open();
  doc.write(html);
  doc.close();
  
  // 5. 焦点转移
  if (iframe.contentWindow) {
      iframe.contentWindow.focus();
  }
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
