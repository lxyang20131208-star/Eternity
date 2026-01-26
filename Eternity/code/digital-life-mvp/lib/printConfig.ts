/**
 * 印刷级书籍排版配置
 * Professional Book Layout Configuration for Print
 */

export interface PrintConfig {
  // 页面尺寸配置
  pageSize: {
    width: number;      // 成品宽度（mm）
    height: number;     // 成品高度（mm）
    bleed: number;      // 出血尺寸（mm）
    trim: boolean;      // 是否显示裁切线
  };
  
  // 版心配置（页边距）
  margins: {
    top: number;        // 上边距（mm）
    bottom: number;     // 下边距（mm）
    inner: number;      // 内侧/装订侧（mm）
    outer: number;      // 外侧（mm）
  };
  
  // 正文排版
  body: {
    fontSize: number;          // 字号（pt）
    lineHeight: number;        // 行距倍数
    align: 'justify' | 'left'; // 对齐方式
    indent: string;            // 首行缩进
    paragraphSpacing: number;  // 段落间距（pt）
  };
  
  // 章节样式
  chapter: {
    titleFontSize: number;     // 章标题字号（pt）
    numberFontSize: number;    // 章序号字号（pt）
    topSpacing: number;        // 章首上留白（mm）
    bottomSpacing: number;     // 标题下留白（mm）
    dropCap: boolean;          // 首字下沉
    dropCapLines: number;      // 下沉行数
  };
  
  // 页眉页脚
  header: {
    enabled: boolean;
    fontSize: number;          // 字号（pt）
    content: 'book' | 'chapter' | 'none';
  };
  
  footer: {
    enabled: boolean;
    pageNumberPosition: 'center' | 'outer' | 'inner';
    fontSize: number;          // 字号（pt）
  };
  
  // 印刷规格
  print: {
    dpi: number;              // 图片分辨率要求
    colorMode: 'CMYK' | 'RGB';
    embedFonts: boolean;      // 嵌入字体
    pdfStandard: 'PDF/X-1a' | 'PDF/X-4' | 'standard';
    blackTextK100: boolean;   // 纯黑文字使用K100
  };
}

// 预设配置
export const PRINT_PRESETS: Record<string, PrintConfig> = {
  // A5标准配置（148×210mm）
  a5Standard: {
    pageSize: {
      width: 148,
      height: 210,
      bleed: 3,
      trim: false,
    },
    margins: {
      top: 20,    // 略微减小上边距 (原25)
      bottom: 20, // 略微减小下边距 (原25)
      inner: 24,  // 调整装订边距 (原28 -> 24)
      outer: 18,  // 调整外侧边距 (原20 -> 18)
    },
    body: {
      fontSize: 10.5,
      lineHeight: 1.6,
      align: 'justify',
      indent: '2em',
      paragraphSpacing: 0,
    },
    chapter: {
      titleFontSize: 18,
      numberFontSize: 12,
      topSpacing: 25,
      bottomSpacing: 15,
      dropCap: false, // User requested to disable drop caps
      dropCapLines: 3,
    },
    header: {
      enabled: true,
      fontSize: 9,
      content: 'chapter',
    },
    footer: {
      enabled: true,
      pageNumberPosition: 'outer',
      fontSize: 10,
    },
    print: {
      dpi: 300,
      colorMode: 'CMYK',
      embedFonts: true,
      pdfStandard: 'PDF/X-1a',
      blackTextK100: true,
    },
  },
  
  // A4配置（210×297mm）
  a4Standard: {
    pageSize: {
      width: 210,
      height: 297,
      bleed: 3,
      trim: false,
    },
    margins: {
      top: 25,
      bottom: 25,
      inner: 25,
      outer: 20,
    },
    body: {
      fontSize: 11,
      lineHeight: 1.6,
      align: 'justify',
      indent: '2em',
      paragraphSpacing: 0,
    },
    chapter: {
      titleFontSize: 20,
      numberFontSize: 14,
      topSpacing: 30,
      bottomSpacing: 18,
      dropCap: true,
      dropCapLines: 3,
    },
    header: {
      enabled: true,
      fontSize: 10,
      content: 'chapter',
    },
    footer: {
      enabled: true,
      pageNumberPosition: 'outer',
      fontSize: 11,
    },
    print: {
      dpi: 300,
      colorMode: 'CMYK',
      embedFonts: true,
      pdfStandard: 'PDF/X-1a',
      blackTextK100: true,
    },
  },
  
  // 简易配置（无出血，适合家庭打印）
  simpleA4: {
    pageSize: {
      width: 210,
      height: 297,
      bleed: 0,
      trim: false,
    },
    margins: {
      top: 20,
      bottom: 20,
      inner: 20,
      outer: 20,
    },
    body: {
      fontSize: 11,
      lineHeight: 1.5,
      align: 'justify',
      indent: '2em',
      paragraphSpacing: 0,
    },
    chapter: {
      titleFontSize: 18,
      numberFontSize: 12,
      topSpacing: 20,
      bottomSpacing: 12,
      dropCap: false,
      dropCapLines: 2,
    },
    header: {
      enabled: false,
      fontSize: 9,
      content: 'none',
    },
    footer: {
      enabled: true,
      pageNumberPosition: 'center',
      fontSize: 10,
    },
    print: {
      dpi: 150,
      colorMode: 'RGB',
      embedFonts: true,
      pdfStandard: 'standard',
      blackTextK100: false,
    },
  },
};

/**
 * 生成印刷就绪的CSS样式
 */
export function generatePrintCSS(config: PrintConfig, bookTitle: string): string {
  const { pageSize, margins, body, chapter, header, footer } = config;
  
  // 计算实际页面尺寸（含出血）
  const pageWidth = pageSize.width + pageSize.bleed * 2;
  const pageHeight = pageSize.height + pageSize.bleed * 2;
  
  // 计算版心尺寸
  const contentWidth = pageSize.width - margins.inner - margins.outer;
  const contentHeight = pageSize.height - margins.top - margins.bottom;
  
  return `
    @page {
      size: ${pageWidth}mm ${pageHeight}mm;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: "Source Han Serif SC", "Noto Serif SC", "SimSun", serif;
      font-size: ${body.fontSize}pt;
      line-height: ${body.lineHeight};
      color: #000000;
      background: white;
    }
    
    .page {
      position: relative;
      width: ${pageWidth}mm;
      height: ${pageHeight}mm;
      background: white;
      page-break-after: always;
      overflow: hidden;
    }
    
    ${pageSize.bleed > 0 ? `
    .page::before {
      content: '';
      position: absolute;
      top: ${pageSize.bleed}mm;
      left: ${pageSize.bleed}mm;
      right: ${pageSize.bleed}mm;
      bottom: ${pageSize.bleed}mm;
      border: 0.1mm solid rgba(0, 0, 0, 0.1);
      pointer-events: none;
      display: ${pageSize.trim ? 'block' : 'none'};
    }` : ''}
    
    .content-area {
      position: absolute;
      top: ${pageSize.bleed + margins.top}mm;
      bottom: ${pageSize.bleed + margins.bottom}mm;
      width: ${contentWidth}mm;
      height: ${contentHeight}mm;
    }
    
    .page.left .content-area {
      left: ${pageSize.bleed + margins.outer}mm;
      right: ${pageSize.bleed + margins.inner}mm;
    }
    
    .page.right .content-area {
      left: ${pageSize.bleed + margins.inner}mm;
      right: ${pageSize.bleed + margins.outer}mm;
    }
    
    /* 页眉 */
    ${header.enabled ? `
    .header {
      position: absolute;
      top: ${pageSize.bleed + margins.top / 2}mm;
      left: ${pageSize.bleed + margins.inner}mm;
      right: ${pageSize.bleed + margins.outer}mm;
      font-size: ${header.fontSize}pt;
      text-align: center;
      color: #666;
    }
    
    .page.left .header {
      left: ${pageSize.bleed + margins.outer}mm;
      right: ${pageSize.bleed + margins.inner}mm;
      text-align: left;
    }
    
    .page.right .header {
      text-align: right;
    }` : ''}
    
    /* 页脚页码 */
    ${footer.enabled ? `
    .footer {
      position: absolute;
      bottom: ${pageSize.bleed + margins.bottom / 2}mm;
      font-size: ${footer.fontSize}pt;
      color: #333;
    }
    
    .footer.center {
      left: 50%;
      transform: translateX(-50%);
    }
    
    .footer.outer.left {
      left: ${pageSize.bleed + margins.outer}mm;
    }
    
    .footer.outer.right {
      right: ${pageSize.bleed + margins.outer}mm;
    }
    
    .footer.inner.left {
      left: ${pageSize.bleed + margins.inner}mm;
    }
    
    .footer.inner.right {
      right: ${pageSize.bleed + margins.inner}mm;
    }` : ''}
    
    /* 正文段落 - 统一样式 */
    p {
      text-align: ${body.align};
      text-indent: ${body.indent};
      margin: 0;
      padding: 0;
      line-height: ${body.lineHeight};
      margin-bottom: ${body.paragraphSpacing}pt;
      /* 防止段落被截断 */
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
      orphans: 3;
      widows: 3;
    }

    /* 章节内容区域 */
    .chapter-content {
      /* 确保内容区域正确分页 */
    }

    /* 所有段落（包括首段）使用统一的首行缩进 */
    .chapter-content p {
      text-indent: ${body.indent};
    }

    /* 章节标题 */
    .chapter-title-page {
      padding-top: ${chapter.topSpacing}mm;
      text-align: center;
      /* 标题区域不分页 */
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }

    .chapter-number {
      font-size: ${chapter.numberFontSize}pt;
      color: #666;
      margin-bottom: 8pt;
      font-weight: normal;
    }

    .chapter-title {
      font-size: ${chapter.titleFontSize}pt;
      font-weight: bold;
      margin-bottom: ${chapter.bottomSpacing}mm;
      line-height: 1.4;
    }

    /* 首字下沉 - 仅影响首字母样式，不影响缩进 */
    ${chapter.dropCap ? `
    .first-para::first-letter {
      float: left;
      font-size: ${body.fontSize * 2.5}pt;
      line-height: ${chapter.dropCapLines * body.lineHeight * body.fontSize}pt;
      font-weight: bold;
      margin-right: 0.1em;
      margin-top: 0.05em;
    }
    /* 首段仍保持统一缩进 */
    .first-para {
      text-indent: ${body.indent};
    }` : ''}
    
    /* 封面页 */
    .title-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      height: 100%;
    }
    
    .title-page h1 {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 20pt;
    }
    
    .title-page .subtitle {
      font-size: 14pt;
      color: #666;
      margin-bottom: 40pt;
    }
    
    /* 目录 */
    .toc {
      padding-top: 30mm;
    }
    
    .toc-title {
      font-size: 20pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 25pt;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 8pt 0;
      border-bottom: 0.5pt dotted #ccc;
      text-indent: 0 !important;
    }
    
    .toc-chapter {
      flex: 1;
    }
    
    .toc-page {
      margin-left: 20pt;
      font-variant-numeric: tabular-nums;
    }
    
    /* 防止孤行寡行 */
    .content-area p {
      orphans: 2;
      widows: 2;
    }
    
    /* 打印优化 */
    @media print {
      .page {
        page-break-after: always;
      }
    }
  `;
}

/**
 * PDF自检报告
 */
export interface PDFCheckReport {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: {
    pageSize: string;
    totalPages: number;
    hasBleed: boolean;
    fontEmbedding: string;
    colorMode: string;
    estimatedFileSize: string;
  };
}

/**
 * 执行PDF预检
 */
export function checkPDFReadiness(
  config: PrintConfig,
  pageCount: number,
  images: { width: number; height: number; dpi: number }[]
): PDFCheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 检查页面尺寸
  if (config.pageSize.bleed === 0 && config.print.pdfStandard !== 'standard') {
    warnings.push('印刷版本建议设置出血（3mm）');
  }
  
  // 检查版心
  if (config.margins.inner <= config.margins.outer) {
    warnings.push('装订侧边距应大于外侧边距，防止内容被装订遮挡');
  }
  
  // 检查图片DPI
  const lowDpiImages = images.filter(img => img.dpi < config.print.dpi);
  if (lowDpiImages.length > 0) {
    warnings.push(`${lowDpiImages.length} 张图片分辨率不足 ${config.print.dpi}dpi，可能影响印刷质量`);
  }
  
  // 检查字体嵌入（jsPDF限制）
  if (config.print.embedFonts) {
    warnings.push('当前PDF生成器使用标准字体，请确保印刷厂支持字体替换');
  }
  
  // 检查颜色模式（jsPDF限制）
  if (config.print.colorMode === 'CMYK') {
    warnings.push('当前PDF使用RGB颜色空间，印刷前需要色彩转换');
  }
  
  const passed = errors.length === 0;
  
  return {
    passed,
    errors,
    warnings,
    info: {
      pageSize: `${config.pageSize.width}×${config.pageSize.height}mm ${config.pageSize.bleed > 0 ? `(+${config.pageSize.bleed}mm出血)` : ''}`,
      totalPages: pageCount,
      hasBleed: config.pageSize.bleed > 0,
      fontEmbedding: config.print.embedFonts ? '嵌入' : '未嵌入',
      colorMode: config.print.colorMode,
      estimatedFileSize: `约 ${Math.round(pageCount * 0.5)}MB`,
    },
  };
}
