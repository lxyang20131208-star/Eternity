'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { listProjectOutlines, BiographyOutline } from '@/lib/biographyOutlineApi';
import { richContentToText } from '@/lib/types/outline';
import type { RichTextContent } from '@/lib/types/outline';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  expandBiographyChapters,
  getExpandedChapters,
  chaptersToBookHtml,
  type ExpandedChapter,
} from '@/lib/chapterApi';
import { AUTHOR_STYLES, type AuthorStyle } from '@/lib/biographyOutlineApi';
import { BiographyEditor } from '@/app/components/BiographyEditor';
import { PRINT_PRESETS, generatePrintCSS, checkPDFReadiness, type PrintConfig } from '@/lib/printConfig';
import { generateBookHTML } from '@/lib/bookGenerator';

// Helper: Convert rich content to HTML string
function renderRichToHtml(content: RichTextContent | undefined, fallbackText: string): string {
  if (!content || !content.content || content.content.length === 0) {
    return escapeHtml(fallbackText);
  }
  try {
    return generateHTML(content, [StarterKit, Underline]);
  } catch {
    return escapeHtml(fallbackText);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Local storage keys
const LOCAL_PHOTOS_KEY = 'photoFlow.photos';
const LOCAL_NETWORK_KEY = 'familyNetwork.data';
const LOCAL_OUTLINE_ATTACHMENTS_KEY = 'outlineAttachments';

interface PhotoItem {
  id: string;
  previewUrl: string;
  remoteUrl: string;
  filename: string;
  taggedPeople: string[];
  sceneDescription: string;
  uploadedAt: string;
}

interface FamilyMember {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface Relationship {
  from: string;
  to: string;
  type: 'parent' | 'spouse' | 'sibling';
}

interface AttachmentNote {
  outlineVersion: number;
  sectionIndex: number;
  photoId: string;
  note: string;
}

export default function ExportPage() {
  // State: Auth & Project
  const [projectId, setProjectId] = useState<string | null>(null);
  
  // State: Outline
  const [outlines, setOutlines] = useState<BiographyOutline[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedOutline, setSelectedOutline] = useState<BiographyOutline | null>(null);

  // State: Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // State: Family Network
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // State: Attachments
  const [attachments, setAttachments] = useState<AttachmentNote[]>([]);

  // State: Export Options
  type BookTemplate = 'memoir' | 'photo-heavy' | 'minimal' | 'travel' | 'wedding' | 'memorial' | 'family-history';
  const [template, setTemplate] = useState<BookTemplate>('memoir');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeFamilyTree, setIncludeFamilyTree] = useState(true);
  const [includeTOC, setIncludeTOC] = useState(true);
  const [exportFormat, setExportFormat] = useState<'epub' | 'pdf'>('pdf');
  
  // 印刷配置
  const [printPreset, setPrintPreset] = useState<'a5Standard' | 'a4Standard' | 'simpleA4'>('a5Standard');
  const [printConfig, setPrintConfig] = useState<PrintConfig>(PRINT_PRESETS.a5Standard);
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [showPreflightCheck, setShowPreflightCheck] = useState(false);
  const [bookTitle, setBookTitle] = useState('我的传记');
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<Array<{ title: string; description: string }>>([]);

  // Template configurations
  const templateConfig: Record<BookTemplate, { name: string; icon: string; description: string; colors: { primary: string; secondary: string } }> = {
    memoir: { name: '回忆录', icon: '📖', description: '传统传记风格', colors: { primary: '#1a365d', secondary: '#2c5282' } },
    'photo-heavy': { name: '图片为主', icon: '📷', description: '以照片展示为主', colors: { primary: '#2d3748', secondary: '#4a5568' } },
    minimal: { name: '极简风格', icon: '📄', description: '简洁现代设计', colors: { primary: '#1a202c', secondary: '#2d3748' } },
    travel: { name: '旅行日志', icon: '✈️', description: '记录人生旅程', colors: { primary: '#234e52', secondary: '#285e61' } },
    wedding: { name: '婚礼纪念', icon: '💒', description: '浪漫婚礼风格', colors: { primary: '#702459', secondary: '#97266d' } },
    memorial: { name: '追思纪念', icon: '🕯️', description: '庄重追思风格', colors: { primary: '#1a202c', secondary: '#2d3748' } },
    'family-history': { name: '家族史记', icon: '🏛️', description: '记录家族传承', colors: { primary: '#744210', secondary: '#975a16' } },
  };

  // State: Export Progress
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // State: Chapter Expansion
  const [expandedChapters, setExpandedChapters] = useState<ExpandedChapter[] | null>(null);
  const [selectedAuthorStyle, setSelectedAuthorStyle] = useState<AuthorStyle>('default');
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  // State: PDF History
  interface PdfHistory {
    id: string;
    fileName: string;
    fileUrl: string;
    template: string;
    version: number;
    createdAt: string;
  }
  const [pdfHistory, setPdfHistory] = useState<PdfHistory[]>([]);

  // Initialize auth and project
  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: list } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1);

        const pid = list?.[0]?.id;
        if (pid) {
          setProjectId(pid);
        }
      } catch (err) {
        console.error('Auth init failed:', err);
      }
    }
    init();
  }, []);

  // Load outlines
  useEffect(() => {
    if (!projectId) return;
    listProjectOutlines(projectId).then((data) => {
      setOutlines(data);
      if (data.length > 0 && !selectedVersion) {
        setSelectedVersion(data[0].version);
        setSelectedOutline(data[0]);
      }
    });
  }, [projectId, selectedVersion]);
  
  // Sync print preset changes
  useEffect(() => {
    setPrintConfig(PRINT_PRESETS[printPreset]);
  }, [printPreset]);

  // Load photos
  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_PHOTOS_KEY);
    if (raw) {
      try {
        const parsed: PhotoItem[] = JSON.parse(raw);
        // Filter blob URLs
        const filtered = parsed.filter(
          (p) => !(p.previewUrl || p.remoteUrl).startsWith('blob:')
        );
        setPhotos(filtered);
      } catch (err) {
        console.error('Failed to load photos:', err);
      }
    }
  }, []);

  // Load family network
  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_NETWORK_KEY);
    if (raw) {
      try {
        const { members: m, relationships: r } = JSON.parse(raw);
        setMembers(m || []);
        setRelationships(r || []);
      } catch (err) {
        console.error('Failed to load family network:', err);
      }
    }
  }, []);

  // Load PDF history
  useEffect(() => {
    const raw = localStorage.getItem('pdfHistory');
    if (raw) {
      try {
        setPdfHistory(JSON.parse(raw));
      } catch (err) {
        console.error('Failed to load PDF history:', err);
      }
    }
  }, []);

  // Load attachments
  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_OUTLINE_ATTACHMENTS_KEY);
    if (raw) {
      try {
        setAttachments(JSON.parse(raw));
      } catch (err) {
        console.error('Failed to load attachments:', err);
      }
    }
  }, []);

  // Load cached expanded chapters when outline changes
  useEffect(() => {
    if (!selectedOutline?.id) {
      setExpandedChapters(null);
      return;
    }
    getExpandedChapters(selectedOutline.id).then((data) => {
      if (data?.chapters) {
        setExpandedChapters(data.chapters);
        setSelectedAuthorStyle(data.author_style || 'default');
      } else {
        setExpandedChapters(null);
      }
    });
  }, [selectedOutline?.id]);

  // Handle chapter expansion
  const handleExpandChapters = async () => {
    if (!projectId || !selectedOutline?.id) return;

    setExpanding(true);
    setExpandProgress('正在准备...');

    try {
      const totalChapters = selectedOutline.outline_json?.sections?.length || 0;

      const result = await expandBiographyChapters(
        projectId,
        selectedOutline.id,
        selectedAuthorStyle,
        totalChapters,
        (current, total, message) => {
          setExpandProgress(message);
        }
      );

      if (result.success && result.chapters) {
        setExpandedChapters(result.chapters);
        setExpandProgress('完成！');

        // Save merged result to database
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase
            .from('biography_outlines')
            .update({
              expanded_json: {
                outline_id: selectedOutline.id,
                author_style: selectedAuthorStyle,
                expanded_at: new Date().toISOString(),
                chapters: result.chapters
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedOutline.id);
        }
      } else {
        alert(result.error || '展开失败');
        setExpandProgress('');
      }
    } catch (err: any) {
      console.error('Expand failed:', err);
      alert(err.message || '展开失败');
      setExpandProgress('');
    } finally {
      setExpanding(false);
    }
  };

  // Handle saving edited chapters
  const handleSaveEditedChapters = async (editedChapters: ExpandedChapter[]) => {
    setExpandedChapters(editedChapters);

    // Save to database
    if (selectedOutline?.id) {
      try {
        await supabase
          .from('biography_outlines')
          .update({
            expanded_json: {
              outline_id: selectedOutline.id,
              author_style: selectedAuthorStyle,
              expanded_at: new Date().toISOString(),
              chapters: editedChapters
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedOutline.id);
      } catch (err) {
        console.error('Failed to save edited chapters:', err);
      }
    }

    setShowEditor(false);
  };

  // Switch outline version
  const handleVersionChange = (version: number) => {
    setSelectedVersion(version);
    const outline = outlines.find((o) => o.version === version);
    setSelectedOutline(outline || null);
  };

  // Count stats
  const getStats = () => {
    const sectionCount = selectedOutline?.outline_json?.sections?.length || 0;
    const photoCount = photos.length;
    const memberCount = members.length;
    const attachmentCount = attachments.filter(
      (a) => selectedVersion !== null && a.outlineVersion === selectedVersion
    ).length;

    return { sectionCount, photoCount, memberCount, attachmentCount };
  };

  // Helper: Render HTML element to canvas and add to PDF
  const renderPageToPdf = async (
    pdf: jsPDF,
    content: HTMLElement,
    isFirstPage: boolean = false
  ) => {
    const canvas = await html2canvas(content, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Calculate dimensions to fit the page
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    if (!isFirstPage) {
      pdf.addPage();
    }

    // If content is taller than one page, we need to split it
    if (imgHeight > pageHeight) {
      let remainingHeight = imgHeight;
      let yOffset = 0;

      while (remainingHeight > 0) {
        if (yOffset > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgWidth, imgHeight);
        yOffset += pageHeight;
        remainingHeight -= pageHeight;
      }
    } else {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    }
  };

  // Helper: Generate safe filename from book title
  const generateSafeFileName = (title: string): string => {
    return title
      .replace(/[\\/:*?"<>|]/g, '_') // Replace invalid filename chars
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .substring(0, 50); // Limit length
  };

  // AI Generate Book Title
  const handleGenerateBookTitle = async () => {
    if (!selectedOutline) {
      alert('请先选择一个大纲版本');
      return;
    }

    setGeneratingTitle(true);
    setTitleSuggestions([]);

    try {
      const response = await fetch('/api/ai/generate-book-title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          outlineData: selectedOutline.outline_json,
          personName: selectedOutline.outline_json?.sections?.[0]?.title || '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate title');
      }

      const data = await response.json();
      setTitleSuggestions(data.titles || []);
      setShowTitleSuggestions(true);
    } catch (error) {
      console.error('Generate title error:', error);
      alert('生成书名失败，请重试');
    } finally {
      setGeneratingTitle(false);
    }
  };

  // Export to PDF
  const handleExport = async () => {
    if (!selectedOutline) {
      alert('请先选择一个大纲版本');
      return;
    }

    if (exportFormat === 'epub') {
      alert('EPUB格式暂不支持，请选择PDF格式');
      return;
    }

    // If we have expanded chapters, use the professional book export
    if (expandedChapters && expandedChapters.length > 0) {
      await handleBookExport();
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('正在准备导出...');

    try {
      // Create a hidden container for rendering
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '210mm'; // A4 width
      container.style.fontFamily = '"Microsoft YaHei", "SimHei", "Noto Sans SC", sans-serif';
      document.body.appendChild(container);

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Step 1: Create title page
      setProgress(10);
      setStatusMessage('正在生成封面...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const titlePage = document.createElement('div');
      titlePage.style.cssText = `
        width: 210mm;
        min-height: 297mm;
        padding: 40mm 20mm;
        box-sizing: border-box;
        background: #fff;
        color: #000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
      `;
      titlePage.innerHTML = `
        <h1 style="font-size: 48px; margin-bottom: 40px; font-weight: bold;">${escapeHtml(bookTitle)}</h1>
        <p style="font-size: 20px; margin: 10px 0; color: #333;">版本: ${selectedVersion}</p>
        <p style="font-size: 20px; margin: 10px 0; color: #333;">模板: ${templateConfig[template].icon} ${templateConfig[template].name}</p>
        <p style="font-size: 18px; margin: 30px 0; color: #666;">生成时间: ${new Date().toLocaleDateString('zh-CN')}</p>
      `;
      container.appendChild(titlePage);
      await renderPageToPdf(pdf, titlePage, true);
      container.removeChild(titlePage);

      // Step 2: Create table of contents if enabled
      if (includeTOC && selectedOutline.outline_json?.sections) {
        setProgress(25);
        setStatusMessage('正在生成目录...');
        await new Promise((resolve) => setTimeout(resolve, 200));

        const tocPage = document.createElement('div');
        tocPage.style.cssText = `
          width: 210mm;
          min-height: 297mm;
          padding: 30mm 25mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
        `;

        let tocContent = '<h2 style="font-size: 32px; text-align: center; margin-bottom: 30px; font-weight: bold;">目录</h2>';
        tocContent += '<div style="font-size: 16px; line-height: 2;">';
        selectedOutline.outline_json.sections.forEach((section, idx) => {
          const title = section.title || `章节 ${idx + 1}`;
          tocContent += `<p style="margin: 8px 0; padding-left: 20px;">${idx + 1}. ${title}</p>`;
        });
        tocContent += '</div>';
        tocPage.innerHTML = tocContent;

        container.appendChild(tocPage);
        await renderPageToPdf(pdf, tocPage);
        container.removeChild(tocPage);
      }

      // Step 3: Add family tree section if enabled
      if (includeFamilyTree && members.length > 0) {
        setProgress(40);
        setStatusMessage('正在添加家族关系...');
        await new Promise((resolve) => setTimeout(resolve, 200));

        const familyPage = document.createElement('div');
        familyPage.style.cssText = `
          width: 210mm;
          min-height: 297mm;
          padding: 30mm 25mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
        `;

        let familyContent = '<h2 style="font-size: 28px; text-align: center; margin-bottom: 25px; font-weight: bold;">家族成员</h2>';
        familyContent += '<div style="font-size: 15px; line-height: 1.8;">';
        members.forEach((member) => {
          familyContent += `<p style="margin: 6px 0;">• ${member.name}</p>`;
        });

        if (relationships.length > 0) {
          familyContent += '<h3 style="font-size: 20px; margin-top: 30px; margin-bottom: 15px;">家族关系:</h3>';
          relationships.forEach((rel) => {
            const fromMember = members.find((m) => m.id === rel.from)?.name || rel.from;
            const toMember = members.find((m) => m.id === rel.to)?.name || rel.to;
            const relType = rel.type === 'parent' ? '父母' : rel.type === 'spouse' ? '配偶' : '兄弟姐妹';
            familyContent += `<p style="margin: 6px 0;">• ${fromMember} — ${relType} — ${toMember}</p>`;
          });
        }
        familyContent += '</div>';
        familyPage.innerHTML = familyContent;

        container.appendChild(familyPage);
        await renderPageToPdf(pdf, familyPage);
        container.removeChild(familyPage);
      }

      // Step 4: Add chapters
      if (selectedOutline.outline_json?.sections) {
        const totalSections = selectedOutline.outline_json.sections.length;

        for (let idx = 0; idx < totalSections; idx++) {
          const progressValue = 50 + Math.floor((idx / totalSections) * 40);
          setProgress(progressValue);
          setStatusMessage(`正在组装章节 ${idx + 1}/${totalSections}...`);
          await new Promise((resolve) => setTimeout(resolve, 100));

          const section = selectedOutline.outline_json.sections[idx];
          const chapterPage = document.createElement('div');
          chapterPage.style.cssText = `
            width: 210mm;
            min-height: 297mm;
            padding: 30mm 25mm;
            box-sizing: border-box;
            background: #fff;
            color: #000;
          `;

          // Support both V2 (rich text) and V1 (plain text) formats
          const sectionAny = section as any;
          const titleHtml = sectionAny.title_rich
            ? renderRichToHtml(sectionAny.title_rich, section.title)
            : escapeHtml(section.title || `章节 ${idx + 1}`);

          let chapterContent = `<h2 style="font-size: 26px; text-align: center; margin-bottom: 25px; font-weight: bold;">第${idx + 1}章: ${titleHtml}</h2>`;
          chapterContent += '<div style="font-size: 14px; line-height: 1.9;">';

          // Add bullets (support rich text)
          if (sectionAny.bullets_rich && sectionAny.bullets_rich.length > 0) {
            sectionAny.bullets_rich.forEach((bulletRich: RichTextContent, bulletIdx: number) => {
              const bulletHtml = renderRichToHtml(bulletRich, section.bullets[bulletIdx] || '');
              chapterContent += `<div style="margin: 10px 0; text-indent: 2em;">• ${bulletHtml}</div>`;
            });
          } else if (section.bullets && section.bullets.length > 0) {
            section.bullets.forEach((bullet) => {
              chapterContent += `<p style="margin: 10px 0; text-indent: 2em;">• ${escapeHtml(bullet)}</p>`;
            });
          }

          // Add quotes (support rich text)
          if (sectionAny.quotes_rich && sectionAny.quotes_rich.length > 0) {
            chapterContent += '<div style="margin-top: 25px; padding-left: 20px; border-left: 3px solid #ccc;">';
            sectionAny.quotes_rich.forEach((quoteRich: { text_rich: RichTextContent; source_id: string }, quoteIdx: number) => {
              const quoteHtml = renderRichToHtml(quoteRich.text_rich, section.quotes?.[quoteIdx]?.text || '');
              chapterContent += `<div style="margin: 12px 0; font-style: italic; color: #555;">"${quoteHtml}"</div>`;
            });
            chapterContent += '</div>';
          } else if (section.quotes && section.quotes.length > 0) {
            chapterContent += '<div style="margin-top: 25px; padding-left: 20px; border-left: 3px solid #ccc;">';
            section.quotes.forEach((quote) => {
              chapterContent += `<p style="margin: 12px 0; font-style: italic; color: #555;">"${escapeHtml(quote.text)}"</p>`;
            });
            chapterContent += '</div>';
          }

          // Add attachment info
          if (includePhotos) {
            const sectionAttachments = attachments.filter(
              (a) => selectedVersion !== null && a.outlineVersion === selectedVersion && a.sectionIndex === idx
            );
            if (sectionAttachments.length > 0) {
              chapterContent += `<div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px;">`;
              chapterContent += `<p style="color: #666; font-size: 13px;">[本章节包含 ${sectionAttachments.length} 张照片附件]</p>`;
              sectionAttachments.forEach((att) => {
                if (att.note) {
                  chapterContent += `<p style="margin: 5px 0; color: #444; font-size: 13px;">  - ${att.note}</p>`;
                }
              });
              chapterContent += '</div>';
            }
          }

          chapterContent += '</div>';
          chapterPage.innerHTML = chapterContent;

          container.appendChild(chapterPage);
          await renderPageToPdf(pdf, chapterPage);
          container.removeChild(chapterPage);
        }
      }

      // Cleanup
      document.body.removeChild(container);

      // Step 5: Generate and download PDF
      setProgress(95);
      setStatusMessage('正在生成PDF文件...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const safeTitle = generateSafeFileName(bookTitle);
      const fileName = `${safeTitle}_v${selectedVersion}_${template}.pdf`;
      
      // Get PDF as blob
      const pdfBlob = pdf.output('blob');
      
      // Try to upload to Supabase Storage
      let uploadSuccess = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('📤 开始上传PDF，用户登录状态:', !!session, '项目ID:', projectId);
        
        if (session && projectId) {
          const timestamp = Date.now();
          const storagePath = `pdfs/${projectId}/${timestamp}_${fileName}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('biography-exports')
            .upload(storagePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: false
            });
          
          if (uploadError) {
            console.error('❌ PDF上传失败:', uploadError);
          } else if (uploadData) {
            const { data: urlData } = supabase.storage
              .from('biography-exports')
              .getPublicUrl(storagePath);
            
            console.log('✅ PDF上传成功，URL:', urlData.publicUrl);
            
            // Save to history
            const newHistory: PdfHistory = {
              id: crypto.randomUUID(),
              fileName,
              fileUrl: urlData.publicUrl,
              template,
              version: selectedVersion || 0,
              createdAt: new Date().toISOString()
            };
            
            const updatedHistory = [newHistory, ...pdfHistory];
            setPdfHistory(updatedHistory);
            localStorage.setItem('pdfHistory', JSON.stringify(updatedHistory));
            console.log('💾 PDF历史已保存，当前历史记录数:', updatedHistory.length);
            uploadSuccess = true;
          }
        } else {
          console.warn('⚠️ 无法上传PDF: 用户未登录或缺少项目ID');
        }
      } catch (err) {
        console.error('❌ PDF上传异常:', err);
      }
      
      // Still download locally
      pdf.save(fileName);

      setProgress(100);
      setStatusMessage('✅ PDF已生成！');

      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setStatusMessage('');
        const message = uploadSuccess 
          ? `✅ 导出成功！\n\nPDF文件：${fileName}\n已保存到下载文件夹，并在左侧"已生成的PDF"区域可查看历史记录。`
          : `✅ PDF已下载！\n\n文件：${fileName}\n已保存到下载文件夹。\n\n⚠️ 云端保存失败，历史记录仅保存在本地浏览器中。`;
        alert(message);
      }, 1000);

    } catch (error) {
      console.error('PDF export failed:', error);
      alert('导出失败，请重试');
      setExporting(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  // Professional book-style PDF export using expanded chapters
  const handleBookExport = async () => {
    if (!expandedChapters || expandedChapters.length === 0) {
      alert('请先生成完整传记文本');
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('正在生成专业排版的传记...');

    try {
      // Step 1: Generate book HTML with print config
      setProgress(10);
      setStatusMessage('正在应用印刷排版规则...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const chapters = expandedChapters.map((ch) => ({
        title: ch.title,
        content: ch.expandedText || ch.originalBullets.join('\n\n'),
      }));

      // Generate CSS
      const cssStyles = generatePrintCSS(printConfig, bookTitle);
      
      // Generate HTML
      const bookHtml = generateBookHTML(printConfig, bookTitle, chapters, cssStyles);

      // Step 2: Create hidden iframe for rendering
      setProgress(20);
      setStatusMessage('正在渲染页面...');
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = `${printConfig.pageSize.width + printConfig.pageSize.bleed * 2}mm`;
      iframe.style.height = `${printConfig.pageSize.height + printConfig.pageSize.bleed * 2}mm`;
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Failed to create iframe');

      iframeDoc.open();
      iframeDoc.write(bookHtml);
      iframeDoc.close();

      // Wait for fonts and images to load
      setProgress(30);
      setStatusMessage('正在加载字体...');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Step 3: Create PDF with correct dimensions
      const pageWidthMm = printConfig.pageSize.width + printConfig.pageSize.bleed * 2;
      const pageHeightMm = printConfig.pageSize.height + printConfig.pageSize.bleed * 2;

      const pdf = new jsPDF({
        orientation: pageHeightMm > pageWidthMm ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [pageWidthMm, pageHeightMm],
        compress: true,
      });

      // Get all pages
      const pages = iframeDoc.querySelectorAll('.page');
      const totalPages = pages.length;

      setProgress(40);
      setStatusMessage(`正在生成 ${totalPages} 页内容...`);

      // Render each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i] as HTMLElement;
        const progressValue = 40 + Math.floor((i / totalPages) * 50);
        setProgress(progressValue);
        setStatusMessage(`正在渲染第 ${i + 1}/${totalPages} 页...`);

        if (i > 0) {
          pdf.addPage();
        }

        // Calculate DPI for canvas (higher for print)
        const scaleFactor = printConfig.print.dpi / 96; // 96 DPI is browser default

        const canvas = await html2canvas(page, {
          scale: scaleFactor,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          // Calculate pixel dimensions
          width: pageWidthMm * 3.7795275591, // mm to px at 96dpi
          height: pageHeightMm * 3.7795275591,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMm, pageHeightMm);
      }

      // Cleanup
      document.body.removeChild(iframe);

      // Step 4: Save and upload PDF
      setProgress(95);
      setStatusMessage('正在保存文件...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const safeTitle = generateSafeFileName(bookTitle);
      const presetName = printPreset.replace('Standard', '').toUpperCase();
      const styleName = AUTHOR_STYLES[selectedAuthorStyle]?.nameEn || 'default';
      const fileName = `${safeTitle}_${presetName}_${styleName}_v${selectedVersion}.pdf`;
      
      // Get PDF as blob
      const pdfBlob = pdf.output('blob');
      
      // Try to upload to Supabase Storage
      let uploadSuccess = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('📤 开始上传PDF，用户登录状态:', !!session, '项目ID:', projectId);
        
        if (session && projectId) {
          const timestamp = Date.now();
          const storagePath = `pdfs/${projectId}/${timestamp}_${fileName}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('biography-exports')
            .upload(storagePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: false
            });
          
          if (uploadError) {
            console.error('❌ PDF上传失败:', uploadError);
          } else if (uploadData) {
            const { data: urlData } = supabase.storage
              .from('biography-exports')
              .getPublicUrl(storagePath);
            
            console.log('✅ PDF上传成功，URL:', urlData.publicUrl);
            
            // Save to history
            const newHistory: PdfHistory = {
              id: crypto.randomUUID(),
              fileName,
              fileUrl: urlData.publicUrl,
              template: `${presetName}-${styleName}`,
              version: selectedVersion || 0,
              createdAt: new Date().toISOString()
            };
            
            const updatedHistory = [newHistory, ...pdfHistory];
            setPdfHistory(updatedHistory);
            localStorage.setItem('pdfHistory', JSON.stringify(updatedHistory));
            console.log('💾 PDF历史已保存，当前历史记录数:', updatedHistory.length);
            uploadSuccess = true;
          }
        } else {
          console.warn('⚠️ 无法上传PDF: 用户未登录或缺少项目ID');
        }
      } catch (err) {
        console.error('❌ PDF上传异常:', err);
      }
      
      // Still download locally
      pdf.save(fileName);

      setProgress(100);
      setStatusMessage('✅ PDF已生成！');

      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setStatusMessage('');
        const message = uploadSuccess 
          ? `✅ 导出成功！\n\nPDF文件：${fileName}\n已保存到下载文件夹，并在左侧"已生成的PDF"区域可查看历史记录。`
          : `✅ PDF已下载！\n\n文件：${fileName}\n已保存到下载文件夹。\n\n⚠️ 云端保存失败，历史记录仅保存在本地浏览器中。`;
        alert(message);
      }, 1000);

    } catch (error) {
      console.error('Book export failed:', error);
      alert('导出失败，请重试');
      setExporting(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  const stats = getStats();

  // Build quick lookup tables for attachments and photos
  const photoMap = new Map<string, PhotoItem>(photos.map((p) => [p.id, p]));
  const sectionPhotos = selectedOutline?.outline_json?.sections?.map((section, idx) => {
    const att = attachments.filter(
      (a) => selectedVersion !== null && a.outlineVersion === selectedVersion && a.sectionIndex === idx
    );
    const thumbs = att
      .map((a) => photoMap.get(a.photoId))
      .filter((p): p is PhotoItem => !!p)
      .map((p) => p.previewUrl || p.remoteUrl || '');
    return {
      title: section.title || `章节 ${idx + 1}`,
      count: att.length,
      thumbs,
    };
  }) ?? [];

  return (
    <>
      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(to bottom right, #000814, #001d3d)',
          color: '#fff',
          padding: 20,
        }}
      >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 6 }}>
            📖 电子书导出引擎
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' }}>
            Inspired by Bookwright & Affinity Publisher
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/outline-annotate"
            className="cyber-btn"
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            ← 返回标注
          </Link>
          <Link
            href="/"
            className="cyber-btn"
            style={{
              padding: '8px 14px',
              fontSize: 12,
              borderRadius: 4,
              textDecoration: 'none',
            }}
          >
            ← 主页
          </Link>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px', gap: 20 }}>
        {/* Left: Version Selector */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ fontSize: 14, marginBottom: 12, color: '#00d4ff' }}>
            选择大纲版本
          </h3>
          {outlines.map((o) => (
            <button
              key={o.version}
              onClick={() => handleVersionChange(o.version)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: 8,
                background:
                  selectedVersion === o.version
                    ? 'rgba(0, 212, 255, 0.15)'
                    : 'rgba(255, 255, 255, 0.03)',
                border:
                  selectedVersion === o.version
                    ? '1px solid rgba(0, 212, 255, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 6,
                color: selectedVersion === o.version ? '#00d4ff' : '#fff',
                fontSize: 13,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600 }}>{o.version}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                {o.outline_json?.sections?.length || 0} 章节
              </div>
            </button>
          ))}
          {outlines.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
              暂无大纲数据
            </p>
          )}

          {/* Edit Links Hint */}
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              fontSize: 11,
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
              需要修改内容？
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href="/outline-edit" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                → 大纲文字编辑
              </Link>
              <Link href="/outline-annotate" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                → 照片标注
              </Link>
              <Link href="/family" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                → 家族成员
              </Link>
            </div>
          </div>

          {/* PDF History */}
          {pdfHistory.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.2)',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 10 }}>
                📥 已生成的 PDF
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pdfHistory.slice(0, 5).map((pdf) => (
                  <div
                    key={pdf.id}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(0, 0, 0, 0.2)',
                      borderRadius: 4,
                      fontSize: 10,
                    }}
                  >
                    <div style={{ color: '#fff', marginBottom: 4, fontWeight: 500 }}>
                      v{pdf.version} · {pdf.template}
                    </div>
                    <div style={{ color: 'rgba(255, 255, 255, 0.5)', marginBottom: 6 }}>
                      {new Date(pdf.createdAt).toLocaleString()}
                    </div>
                    <a
                      href={pdf.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        borderRadius: 4,
                        color: '#22c55e',
                        fontSize: 10,
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                      }}
                    >
                      下载 PDF ↓
                    </a>
                  </div>
                ))}
                {pdfHistory.length > 5 && (
                  <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', marginTop: 4 }}>
                    +{pdfHistory.length - 5} 个更多
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Export Settings */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: 24,
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <h2 style={{ fontSize: 18, marginBottom: 20 }}>导出设置</h2>

          {/* Stats Card */}
          <div
            style={{
              background: 'rgba(0, 212, 255, 0.05)',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h4 style={{ fontSize: 14, marginBottom: 12, color: '#00d4ff' }}>
              📊 内容统计
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  章节数量
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.sectionCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  照片数量
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.photoCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  家族成员
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.memberCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  照片标注
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.attachmentCount}
                </div>
              </div>
            </div>
          </div>

          {/* Chapter Expansion Card - Key Feature */}
          <div
            style={{
              background: expandedChapters
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(251, 191, 36, 0.1)',
              border: expandedChapters
                ? '1px solid rgba(34, 197, 94, 0.3)'
                : '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h4 style={{ fontSize: 14, marginBottom: 12, color: expandedChapters ? '#22c55e' : '#fbbf24' }}>
              {expandedChapters ? '✅ 完整传记已生成' : '📝 生成完整传记文本'}
            </h4>
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12 }}>
              {expandedChapters
                ? `已生成 ${expandedChapters.length} 章完整传记，使用「${AUTHOR_STYLES[selectedAuthorStyle]?.name || '默认'}」风格`
                : '将大纲要点扩展成完整的传记文本，带有专业作家的文学风格'}
            </p>

            {/* Author Style Selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'rgba(255, 255, 255, 0.8)' }}>
                选择文学风格：
              </label>
              <select
                value={selectedAuthorStyle}
                onChange={(e) => setSelectedAuthorStyle(e.target.value as AuthorStyle)}
                disabled={expanding}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#fff',
                  cursor: expanding ? 'not-allowed' : 'pointer',
                }}
              >
                {Object.entries(AUTHOR_STYLES).map(([key, style]) => (
                  <option key={key} value={key} style={{ background: '#1a1a2e' }}>
                    {style.name} - {style.description.slice(0, 20)}...
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExpandChapters}
              disabled={expanding || !selectedOutline}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 6,
                border: 'none',
                background: expanding
                  ? 'rgba(255, 255, 255, 0.1)'
                  : expandedChapters
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                color: '#fff',
                cursor: expanding || !selectedOutline ? 'not-allowed' : 'pointer',
                opacity: expanding || !selectedOutline ? 0.6 : 1,
              }}
            >
              {expanding ? expandProgress || '正在生成...' : expandedChapters ? '🔄 重新生成' : '✨ 生成完整传记'}
            </button>

            {expandedChapters && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setShowEditor(true)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: 13,
                    background: 'rgba(99, 102, 241, 0.2)',
                    border: '1px solid rgba(99, 102, 241, 0.4)',
                    borderRadius: 6,
                    color: '#a5b4fc',
                    cursor: 'pointer',
                    marginBottom: 8,
                  }}
                >
                  ✏️ 编辑传记内容（纠正人名/删除段落）
                </button>
                <p style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', margin: 0 }}>
                  点击「开始导出」将使用专业书籍排版
                </p>
              </div>
            )}
          </div>

          {/* Template Selection */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
              📐 排版模板
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {(Object.keys(templateConfig) as BookTemplate[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTemplate(t)}
                  style={{
                    padding: '10px 6px',
                    background:
                      template === t
                        ? 'rgba(0, 212, 255, 0.15)'
                        : 'rgba(255, 255, 255, 0.03)',
                    border:
                      template === t
                        ? '1px solid rgba(0, 212, 255, 0.5)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 6,
                    color: template === t ? '#00d4ff' : '#fff',
                    fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title={templateConfig[t].description}
                >
                  <span style={{ fontSize: 18 }}>{templateConfig[t].icon}</span>
                  <span>{templateConfig[t].name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Export Format */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
              📦 导出格式
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <button
                onClick={() => setExportFormat('pdf')}
                style={{
                  padding: '12px 8px',
                  background:
                    exportFormat === 'pdf'
                      ? 'rgba(0, 212, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                  border:
                    exportFormat === 'pdf'
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  color: exportFormat === 'pdf' ? '#00d4ff' : '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                PDF
              </button>
              <button
                onClick={() => setExportFormat('epub')}
                style={{
                  padding: '12px 8px',
                  background:
                    exportFormat === 'epub'
                      ? 'rgba(0, 212, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                  border:
                    exportFormat === 'epub'
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  color: exportFormat === 'epub' ? '#00d4ff' : '#fff',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                EPUB
              </button>
            </div>
          </div>

          {/* Print Configuration */}
          {exportFormat === 'pdf' && expandedChapters && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
                📐 印刷配置
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {(['a5Standard', 'a4Standard', 'simpleA4'] as const).map((preset) => {
                  const presetConfig = PRINT_PRESETS[preset];
                  const labels = {
                    a5Standard: 'A5印刷版',
                    a4Standard: 'A4印刷版',
                    simpleA4: 'A4家用版',
                  };
                  return (
                    <button
                      key={preset}
                      onClick={() => setPrintPreset(preset)}
                      style={{
                        padding: '10px 6px',
                        background:
                          printPreset === preset
                            ? 'rgba(139, 92, 246, 0.15)'
                            : 'rgba(255, 255, 255, 0.03)',
                        border:
                          printPreset === preset
                            ? '1px solid rgba(139, 92, 246, 0.5)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                        color: printPreset === preset ? '#a78bfa' : '#fff',
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span>{labels[preset]}</span>
                      <span style={{ fontSize: 9, opacity: 0.7 }}>
                        {presetConfig.pageSize.width}×{presetConfig.pageSize.height}mm
                      </span>
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: 6,
                  fontSize: 10,
                  color: 'rgba(255, 255, 255, 0.7)',
                }}
              >
                <div>✓ {printConfig.pageSize.bleed > 0 ? `含${printConfig.pageSize.bleed}mm出血` : '无出血'}</div>
                <div>✓ 字号 {printConfig.body.fontSize}pt，行距 {printConfig.body.lineHeight}</div>
                <div>✓ 版心 {printConfig.margins.top}/{printConfig.margins.bottom}/{printConfig.margins.inner}/{printConfig.margins.outer}mm</div>
                {printConfig.chapter.dropCap && <div>✓ 首字下沉</div>}
                <button
                  onClick={() => setShowPreflightCheck(true)}
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(139, 92, 246, 0.2)',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: 4,
                    color: '#a78bfa',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  🔍 印刷预检
                </button>
              </div>
            </div>
          )}

          {/* Book Title Input */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
              📚 书名设置
            </label>
            <input
              type="text"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="请输入书名，如：张三的人生回忆录"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 6,
                color: '#fff',
                fontSize: 13,
                outline: 'none',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                e.target.style.borderColor = 'rgba(0, 212, 255, 0.5)';
              }}
              onBlur={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.05)';
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <p style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', margin: 0, flex: 1 }}>
                此书名将显示在PDF封面和页眉中
              </p>
              <button
                onClick={handleGenerateBookTitle}
                disabled={generatingTitle || !selectedOutline}
                style={{
                  padding: '6px 12px',
                  background: generatingTitle 
                    ? 'rgba(255, 255, 255, 0.1)' 
                    : 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: generatingTitle || !selectedOutline ? 'not-allowed' : 'pointer',
                  opacity: generatingTitle || !selectedOutline ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!generatingTitle && selectedOutline) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {generatingTitle ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span>
                    生成中...
                  </>
                ) : (
                  <>
                    ✨ AI生成书名
                  </>
                )}
              </button>
            </div>
            
            {/* Title Suggestions */}
            {showTitleSuggestions && titleSuggestions.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'rgba(102, 126, 234, 0.08)',
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
                    💡 AI推荐书名
                  </span>
                  <button
                    onClick={() => setShowTitleSuggestions(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {titleSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setBookTitle(suggestion.title);
                        setShowTitleSuggestions(false);
                      }}
                      style={{
                        padding: '10px 12px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 4,
                        color: '#fff',
                        fontSize: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{suggestion.title}</div>
                      {suggestion.description && (
                        <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.6)' }}>
                          {suggestion.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
              ⚙️ 导出选项
            </label>
            {[
              { label: '包含照片', checked: includePhotos, setter: setIncludePhotos },
              {
                label: '包含家族关系图',
                checked: includeFamilyTree,
                setter: setIncludeFamilyTree,
              },
              { label: '生成目录', checked: includeTOC, setter: setIncludeTOC },
            ].map(({ label, checked, setter }) => (
              <label
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  marginBottom: 8,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setter(e.target.checked)}
                  style={{
                    width: 16,
                    height: 16,
                    marginRight: 10,
                    accentColor: '#00d4ff',
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Preview & Export Buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setShowPreview(true)}
              disabled={!selectedOutline}
              style={{
                flex: 1,
                padding: '14px 20px',
                fontSize: 15,
                borderRadius: 6,
                fontWeight: 600,
                background: 'rgba(124, 58, 237, 0.2)',
                border: '1px solid rgba(124, 58, 237, 0.4)',
                color: '#c084fc',
                opacity: !selectedOutline ? 0.5 : 1,
                cursor: !selectedOutline ? 'not-allowed' : 'pointer',
              }}
            >
              👁️ 预览效果
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !selectedOutline}
              className="cyber-btn cyber-btn-primary"
              style={{
                flex: 1,
                padding: '14px 20px',
                fontSize: 15,
                borderRadius: 6,
                fontWeight: 600,
                opacity: exporting || !selectedOutline ? 0.5 : 1,
                cursor: exporting || !selectedOutline ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? '正在导出...' : '🚀 开始导出'}
            </button>
          </div>

          {/* Progress */}
          {exporting && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  width: '100%',
                  height: 8,
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #00d4ff, #0099ff)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: 'rgba(255, 255, 255, 0.7)',
                  textAlign: 'center',
                }}
              >
                {statusMessage}
              </p>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 8,
            padding: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ fontSize: 14, marginBottom: 12, color: '#00d4ff' }}>
            📄 预览信息
          </h3>
          {selectedOutline ? (
            <div>
              <div
                style={{
                  fontSize: 13,
                  padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 11 }}>
                  版本
                </div>
                <div style={{ fontWeight: 600 }}>{selectedOutline.version}</div>
              </div>

              <div
                style={{
                  fontSize: 13,
                  padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 11 }}>
                  模板
                </div>
                <div style={{ fontWeight: 600 }}>
                  {templateConfig[template].icon} {templateConfig[template].name}
                </div>
              </div>

              <div
                style={{
                  fontSize: 13,
                  padding: '8px 10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: 11 }}>
                  格式
                </div>
                <div style={{ fontWeight: 600 }}>{exportFormat.toUpperCase()}</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 8,
                  }}
                >
                  章节列表
                </div>
                {selectedOutline.outline_json?.sections?.slice(0, 5).map((section, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: 12,
                      padding: '6px 8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 4,
                      marginBottom: 6,
                    }}
                  >
                    {idx + 1}. {section.title || '未命名章节'}
                  </div>
                ))}
                {(selectedOutline.outline_json?.sections?.length || 0) > 5 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.6)',
                      textAlign: 'center',
                      marginTop: 8,
                    }}
                  >
                    还有 {(selectedOutline.outline_json?.sections?.length || 0) - 5} 章节...
                  </div>
                )}
              </div>

              {/* Section Photos Preview */}
              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255, 255, 255, 0.7)',
                    marginBottom: 8,
                  }}
                >
                  章节已附照片
                </div>
                {sectionPhotos.length === 0 && (
                  <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>暂无照片附件</p>
                )}
                {sectionPhotos.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{idx + 1}. {sec.title}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)' }}>{sec.count} 张</div>
                    </div>
                    {sec.count === 0 ? (
                      <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)' }}>尚未附加照片</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {sec.thumbs.slice(0, 4).map((src, i) => (
                          <div
                            key={i}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 6,
                              backgroundImage: `url(${src})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            }}
                          />
                        ))}
                        {sec.count > 4 && (
                          <div
                            style={{
                              padding: '6px 10px',
                              fontSize: 11,
                              color: 'rgba(255, 255, 255, 0.7)',
                              border: '1px dashed rgba(255, 255, 255, 0.25)',
                              borderRadius: 6,
                            }}
                          >
                            +{sec.count - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
              请先选择大纲版本
            </p>
          )}
        </div>
      </div>

      {/* Biography Editor Modal */}
      {showEditor && expandedChapters && (
        <BiographyEditor
          chapters={expandedChapters}
          onSave={handleSaveEditedChapters}
          onClose={() => setShowEditor(false)}
          authorStyle={AUTHOR_STYLES[selectedAuthorStyle]?.name || '默认'}
        />
      )}

      {/* Print Preview Modal */}
      {showPreview && selectedOutline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
          }}
          onClick={() => setShowPreview(false)}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 24px',
              background: '#0a1628',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#fff' }}>
                📖 打印预览 - {templateConfig[template].icon} {templateConfig[template].name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                版本 {selectedVersion} · {selectedOutline.outline_json?.sections?.length || 0} 章节
              </p>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              style={{
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              关闭预览
            </button>
          </div>

          {/* Preview Content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              justifyContent: 'center',
              padding: '40px 20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                width: '210mm', // A4 width
                minHeight: '297mm', // A4 height
                background: '#fff',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                padding: '40px 50px',
                fontFamily: 'Georgia, serif',
              }}
            >
              {/* Title Page Preview */}
              <div style={{ textAlign: 'center', marginBottom: 60, paddingTop: 80 }}>
                <h1 style={{ fontSize: 36, marginBottom: 20, color: templateConfig[template].colors.primary }}>
                  个人传记
                </h1>
                <p style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>
                  {templateConfig[template].icon} {templateConfig[template].name}
                </p>
                <p style={{ fontSize: 14, color: '#999' }}>
                  生成日期: {new Date().toLocaleDateString('zh-CN')}
                </p>
              </div>

              {/* Table of Contents Preview */}
              {includeTOC && (
                <div style={{ marginBottom: 40 }}>
                  <h2 style={{ fontSize: 24, marginBottom: 20, color: templateConfig[template].colors.primary, borderBottom: '2px solid ' + templateConfig[template].colors.primary, paddingBottom: 10 }}>
                    目录
                  </h2>
                  {selectedOutline.outline_json?.sections?.slice(0, 5).map((section: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dotted #ddd' }}>
                      <span style={{ color: '#333' }}>{idx + 1}. {section.title || '未命名章节'}</span>
                      <span style={{ color: '#999' }}>{idx + 2}</span>
                    </div>
                  ))}
                  {(selectedOutline.outline_json?.sections?.length || 0) > 5 && (
                    <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                      ... 还有 {(selectedOutline.outline_json?.sections?.length || 0) - 5} 章节
                    </div>
                  )}
                </div>
              )}

              {/* Sample Chapter Preview */}
              {selectedOutline.outline_json?.sections?.[0] && (
                <div style={{ marginBottom: 40 }}>
                  <h2 style={{ fontSize: 22, marginBottom: 16, color: templateConfig[template].colors.primary }}>
                    第一章: {selectedOutline.outline_json.sections[0].title || '未命名章节'}
                  </h2>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: '#333', textAlign: 'justify' }}>
                    {(selectedOutline.outline_json.sections[0].bullets?.join(' ') || '')?.slice(0, 500) || '(章节内容预览)'}
                    {((selectedOutline.outline_json.sections[0].bullets?.join(' ') || '')?.length || 0) > 500 && '...'}
                  </div>

                  {/* Photo placeholder */}
                  {includePhotos && (
                    <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                      {[1, 2].map((n) => (
                        <div
                          key={n}
                          style={{
                            width: 120,
                            height: 90,
                            background: '#f0f0f0',
                            border: '1px solid #ddd',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                            fontSize: 11,
                          }}
                        >
                          📷 照片位置
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Page indicator */}
              <div style={{ position: 'absolute', bottom: 20, right: 50, color: '#999', fontSize: 12 }}>
                第 1 页
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Preflight Check Dialog */}
      {showPreflightCheck && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={() => setShowPreflightCheck(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 12,
              padding: 32,
              maxWidth: 600,
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 20, marginBottom: 20, color: '#a78bfa' }}>
              🔍 印刷预检报告
            </h2>

            {(() => {
              const report = checkPDFReadiness(
                printConfig,
                (expandedChapters?.length || 0) + 2, // chapters + cover + toc
                [] // No images for now
              );

              return (
                <>
                  {/* Status */}
                  <div
                    style={{
                      padding: 16,
                      background: report.passed
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(251, 191, 36, 0.1)',
                      border: `1px solid ${report.passed ? 'rgba(34, 197, 94, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`,
                      borderRadius: 8,
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: report.passed ? '#22c55e' : '#fbbf24' }}>
                      {report.passed ? '✅ 可以提交印刷厂' : '⚠️  有建议优化项'}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 12, color: '#a78bfa' }}>基本信息</h3>
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 12, borderRadius: 6, fontSize: 12 }}>
                      <div style={{ marginBottom: 6 }}>📏 页面尺寸：{report.info.pageSize}</div>
                      <div style={{ marginBottom: 6 }}>📄 总页数：{report.info.totalPages} 页</div>
                      <div style={{ marginBottom: 6 }}>🎨 颜色模式：{report.info.colorMode}</div>
                      <div style={{ marginBottom: 6 }}>🔤 字体：{report.info.fontEmbedding}</div>
                      <div>💾 预估大小：{report.info.estimatedFileSize}</div>
                    </div>
                  </div>

                  {/* Errors */}
                  {report.errors.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 14, marginBottom: 12, color: '#ef4444' }}>❌ 错误</h3>
                      {report.errors.map((err, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            padding: 10,
                            borderRadius: 6,
                            marginBottom: 8,
                            fontSize: 12,
                          }}
                        >
                          {err}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Warnings */}
                  {report.warnings.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 14, marginBottom: 12, color: '#fbbf24' }}>⚠️  建议优化</h3>
                      {report.warnings.map((warn, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(251, 191, 36, 0.1)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            padding: 10,
                            borderRadius: 6,
                            marginBottom: 8,
                            fontSize: 12,
                          }}
                        >
                          {warn}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Note */}
                  <div
                    style={{
                      padding: 12,
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: 6,
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.7)',
                      marginBottom: 20,
                    }}
                  >
                    💡 提示：当前PDF生成器使用 jsPDF 库，部分印刷厂要求（如CMYK色彩空间、PDF/X-1a标准）需要使用专业软件（Adobe InDesign/Acrobat）进行后期处理。
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => setShowPreflightCheck(false)}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'rgba(139, 92, 246, 0.2)',
                        border: '1px solid rgba(139, 92, 246, 0.4)',
                        borderRadius: 6,
                        color: '#a78bfa',
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      关闭
                    </button>
                    <button
                      onClick={() => {
                        setShowPreflightCheck(false);
                        handleExport();
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        border: 'none',
                        borderRadius: 6,
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      继续导出
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      </div>
    </>
  );
}
