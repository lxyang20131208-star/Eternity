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
  chapterssToBookHtml,
  type ExpandedChapter,
} from '@/lib/chapterApi';
import { AUTHOR_STYLES, type AuthorStyle } from '@/lib/biographyOutlineApi';
import { BiographyEditor } from '@/app/components/BiographyEditor';

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

  // Template configurations
  const templateConfig: Record<BookTemplate, { name: string; icon: string; description: string; colors: { primary: string; secondary: string } }> = {
    memoir: { name: 'Memoir', icon: '📖', description: 'Traditional biography style', colors: { primary: '#1a365d', secondary: '#2c5282' } },
    'photo-heavy': { name: 'Photo-focused', icon: '📷', description: 'Photo-centered display', colors: { primary: '#2d3748', secondary: '#4a5568' } },
    minimal: { name: 'Minimalist', icon: '📄', description: 'Clean modern design', colors: { primary: '#1a202c', secondary: '#2d3748' } },
    travel: { name: 'Travel Journal', icon: '✈️', description: 'Document life journey', colors: { primary: '#234e52', secondary: '#285e61' } },
    wedding: { name: 'Wedding Album', icon: '💒', description: 'Romantic wedding style', colors: { primary: '#702459', secondary: '#97266d' } },
    memorial: { name: 'Memorial', icon: '🕯️', description: 'Solemn memorial style', colors: { primary: '#1a202c', secondary: '#2d3748' } },
    'family-history': { name: 'Family History', icon: '🏛️', description: 'Document family heritage', colors: { primary: '#744210', secondary: '#975a16' } },
  };

  // State: Export Progress
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // State: chapters Expansion
  const [expandedChapters, setExpandedChapters] = useState<ExpandedChapter[] | null>(null);
  const [selectedAuthorStyle, setSelectedAuthorStyle] = useState<AuthorStyle>('default');
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState('');
  const [showEditor, setShowEditor] = useState(false);

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

  // Load cached expanded chapterss when outline changes
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

  // Handle chapters expansion
  const handleExpandChapters = async () => {
    if (!projectId || !selectedOutline?.id) return;

    setExpanding(true);
    setExpandProgress('Preparing...');

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
        setExpandProgress('Complete\!');

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
                chapterss: result.chapters
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedOutline.id);
        }
      } else {
        alert(result.error || 'Expansion failed');
        setExpandProgress('');
      }
    } catch (err: any) {
      console.error('Expand failed:', err);
      alert(err.message || 'Expansion failed');
      setExpandProgress('');
    } finally {
      setExpanding(false);
    }
  };

  // Handle saving edited chapterss
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
              chapterss: editedChapters
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedOutline.id);
      } catch (err) {
        console.error('Failed to save edited chapterss:', err);
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

  // Export to PDF
  const handleExport = async () => {
    if (!selectedOutline) {
      alert('Please select an outline version first');
      return;
    }

    if (exportFormat === 'epub') {
      alert('EPUB format not supported yet, please select PDF');
      return;
    }

    // If we have expanded chapterss, use the professional book export
    if (expandedChapters && expandedChapters.length > 0) {
      await handleBookExport();
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('Preparing export...');

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
      setStatusMessage('Generating cover...');
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
        <h1 style="font-size: 48px; margin-bottom: 40px; font-weight: bold;">Personal Biography</h1>
        <p style="font-size: 20px; margin: 10px 0; color: #333;">Version: ${selectedVersion}</p>
        <p style="font-size: 20px; margin: 10px 0; color: #333;">Template: ${templateConfig[template].icon} ${templateConfig[template].name}</p>
        <p style="font-size: 18px; margin: 30px 0; color: #666;">Generated: ${new Date().toLocaleDateString('zh-CN')}</p>
      `;
      container.appendChild(titlePage);
      await renderPageToPdf(pdf, titlePage, true);
      container.removeChild(titlePage);

      // Step 2: Create table of contents if enabled
      if (includeTOC && selectedOutline.outline_json?.sections) {
        setProgress(25);
        setStatusMessage('Generating table of contents...');
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

        let tocContent = '<h2 style="font-size: 32px; text-align: center; margin-bottom: 30px; font-weight: bold;">Table of Contents</h2>';
        tocContent += '<div style="font-size: 16px; line-height: 2;">';
        selectedOutline.outline_json.sections.forEach((section, idx) => {
          const title = section.title || `Chapter ${idx + 1}`;
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
        setStatusMessage('Adding family relationships...');
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

        let familyContent = '<h2 style="font-size: 28px; text-align: center; margin-bottom: 25px; font-weight: bold;">Family Members</h2>';
        familyContent += '<div style="font-size: 15px; line-height: 1.8;">';
        members.forEach((member) => {
          familyContent += `<p style="margin: 6px 0;">• ${member.name}</p>`;
        });

        if (relationships.length > 0) {
          familyContent += '<h3 style="font-size: 20px; margin-top: 30px; margin-bottom: 15px;">Family Relationships:</h3>';
          relationships.forEach((rel) => {
            const fromMember = members.find((m) => m.id === rel.from)?.name || rel.from;
            const toMember = members.find((m) => m.id === rel.to)?.name || rel.to;
            const relType = rel.type === 'parent' ? 'Parent' : rel.type === 'spouse' ? 'Spouse' : 'Sibling';
            familyContent += `<p style="margin: 6px 0;">• ${fromMember} — ${relType} — ${toMember}</p>`;
          });
        }
        familyContent += '</div>';
        familyPage.innerHTML = familyContent;

        container.appendChild(familyPage);
        await renderPageToPdf(pdf, familyPage);
        container.removeChild(familyPage);
      }

      // Step 4: Add chapterss
      if (selectedOutline.outline_json?.sections) {
        const totalSections = selectedOutline.outline_json.sections.length;

        for (let idx = 0; idx < totalSections; idx++) {
          const progressValue = 50 + Math.floor((idx / totalSections) * 40);
          setProgress(progressValue);
          setStatusMessage(`AssemblingChapter ${idx + 1}/${totalSections}...`);
          await new Promise((resolve) => setTimeout(resolve, 100));

          const section = selectedOutline.outline_json.sections[idx];
          const chaptersPage = document.createElement('div');
          chaptersPage.style.cssText = `
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
            : escapeHtml(section.title || `Chapter ${idx + 1}`);

          let chaptersContent = `<h2 style="font-size: 26px; text-align: center; margin-bottom: 25px; font-weight: bold;">Chapter ${idx + 1}: ${titleHtml}</h2>`;
          chaptersContent += '<div style="font-size: 14px; line-height: 1.9;">';

          // Add bullets (support rich text)
          if (sectionAny.bullets_rich && sectionAny.bullets_rich.length > 0) {
            sectionAny.bullets_rich.forEach((bulletRich: RichTextContent, bulletIdx: number) => {
              const bulletHtml = renderRichToHtml(bulletRich, section.bullets[bulletIdx] || '');
              chaptersContent += `<div style="margin: 10px 0; text-indent: 2em;">• ${bulletHtml}</div>`;
            });
          } else if (section.bullets && section.bullets.length > 0) {
            section.bullets.forEach((bullet) => {
              chaptersContent += `<p style="margin: 10px 0; text-indent: 2em;">• ${escapeHtml(bullet)}</p>`;
            });
          }

          // Add quotes (support rich text)
          if (sectionAny.quotes_rich && sectionAny.quotes_rich.length > 0) {
            chaptersContent += '<div style="margin-top: 25px; padding-left: 20px; border-left: 3px solid #ccc;">';
            sectionAny.quotes_rich.forEach((quoteRich: { text_rich: RichTextContent; source_id: string }, quoteIdx: number) => {
              const quoteHtml = renderRichToHtml(quoteRich.text_rich, section.quotes?.[quoteIdx]?.text || '');
              chaptersContent += `<div style="margin: 12px 0; font-style: italic; color: #555;">"${quoteHtml}"</div>`;
            });
            chaptersContent += '</div>';
          } else if (section.quotes && section.quotes.length > 0) {
            chaptersContent += '<div style="margin-top: 25px; padding-left: 20px; border-left: 3px solid #ccc;">';
            section.quotes.forEach((quote) => {
              chaptersContent += `<p style="margin: 12px 0; font-style: italic; color: #555;">"${escapeHtml(quote.text)}"</p>`;
            });
            chaptersContent += '</div>';
          }

          // Add attachment info
          if (includePhotos) {
            const sectionAttachments = attachments.filter(
              (a) => selectedVersion !== null && a.outlineVersion === selectedVersion && a.sectionIndex === idx
            );
            if (sectionAttachments.length > 0) {
              chaptersContent += `<div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px;">`;
              chaptersContent += `<p style="color: #666; font-size: 13px;">[This chapters contains ${sectionAttachments.length} photo attachments]</p>`;
              sectionAttachments.forEach((att) => {
                if (att.note) {
                  chaptersContent += `<p style="margin: 5px 0; color: #444; font-size: 13px;">  - ${att.note}</p>`;
                }
              });
              chaptersContent += '</div>';
            }
          }

          chaptersContent += '</div>';
          chaptersPage.innerHTML = chaptersContent;

          container.appendChild(chapterPage);
          await renderPageToPdf(pdf, chaptersPage);
          container.removeChild(chapterPage);
        }
      }

      // Cleanup
      document.body.removeChild(container);

      // Step 5: Generate and download PDF
      setProgress(95);
      setStatusMessage('Generating PDF file...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const fileName = `biography_v${selectedVersion}_${template}.pdf`;
      pdf.save(fileName);

      setProgress(100);
      setStatusMessage('Export complete\!');

      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setStatusMessage('');
      }, 1000);

    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Export failed, please try again');
      setExporting(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  // Professional book-style PDF export using expanded chapterss
  const handleBookExport = async () => {
    if (!expandedChapters || expandedChapters.length === 0) {
      alert('Please generate full biography text first');
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('Generating professionally typeset biography...');

    try {
      // Generate book HTML
      setProgress(20);
      setStatusMessage('Typesetting chapters...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const bookHtml = chapterssToBookHtml(
        expandedChapters,
        'My Biography',
        selectedAuthorStyle
      );

      // Create hidden iframe for rendering
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error('Failed to create iframe');

      iframeDoc.open();
      iframeDoc.write(bookHtml);
      iframeDoc.close();

      // Wait for fonts and images to load
      setProgress(40);
      setStatusMessage('Loading fonts...');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Get all elements that need to be pages
      const titlePage = iframeDoc.querySelector('.title-page') as HTMLElement;
      const tocPage = iframeDoc.querySelector('.toc-page') as HTMLElement;
      const chapterss = iframeDoc.querySelectorAll('.chapter');

      const totalPages = 2 + chapterss.length;
      let pageNum = 0;

      // Render title page
      if (titlePage) {
        setProgress(50);
        setStatusMessage('Generating cover...');
        const canvas = await html2canvas(titlePage, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 794, // A4 at 96 DPI
          height: 1123,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        pageNum++;
      }

      // Render TOC
      if (tocPage) {
        setProgress(55);
        setStatusMessage('Generating table of contents...');
        pdf.addPage();
        const canvas = await html2canvas(tocPage, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 794,
          height: 1123,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        pageNum++;
      }

      // Render each chapters
      for (let i = 0; i < chapterss.length; i++) {
        const chapters = chapterss[i] as HTMLElement;
        const progressValue = 60 + Math.floor((i / chapterss.length) * 35);
        setProgress(progressValue);
        setStatusMessage(`Typesetting chapters  ${i + 1}...`);

        pdf.addPage();
        const canvas = await html2canvas(chapter, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 794,
          windowHeight: chapters.scrollHeight,
        });

        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // Handle multi-page chapterss
        if (imgHeight > 297) {
          let remainingHeight = imgHeight;
          let yOffset = 0;
          let firstPage = true;

          while (remainingHeight > 0) {
            if (!firstPage) {
              pdf.addPage();
            }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, -yOffset, imgWidth, imgHeight);
            yOffset += 297;
            remainingHeight -= 297;
            firstPage = false;
          }
        } else {
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgWidth, imgHeight);
        }
      }

      // Cleanup
      document.body.removeChild(iframe);

      // Save PDF
      setProgress(98);
      setStatusMessage('Saving file...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const styleName = AUTHOR_STYLES[selectedAuthorStyle]?.nameEn || 'default';
      const fileName = `biography_${styleName}_v${selectedVersion}.pdf`;
      pdf.save(fileName);

      setProgress(100);
      setStatusMessage('Export complete\!');

      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setStatusMessage('');
      }, 1000);

    } catch (error) {
      console.error('Book export failed:', error);
      alert('Export failed, please try again');
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
      title: section.title || `Chapter ${idx + 1}`,
      count: att.length,
      thumbs,
    };
  }) ?? [];

  return (
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
            📖 E-book Export Engine
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
            Back to Annotate
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
            Home
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
            Select Outline Version
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
                {o.outline_json?.sections?.length || 0} chapters
              </div>
            </button>
          ))}
          {outlines.length === 0 && (
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
              No outline data
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
              Need to modify content?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href="/outline-edit" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                Edit Outline Text
              </Link>
              <Link href="/outline-annotate" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                Photo Annotation
              </Link>
              <Link href="/family" style={{ color: '#00d4ff', textDecoration: 'none' }}>
                → Family Members
              </Link>
            </div>
          </div>
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
          <h2 style={{ fontSize: 18, marginBottom: 20 }}>Export Settings</h2>

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
              Content Statistics
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  chapterss
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.sectionCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  Photos
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.photoCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  Family Members
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.memberCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>
                  Photo Annotations
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#00d4ff' }}>
                  {stats.attachmentCount}
                </div>
              </div>
            </div>
          </div>

          {/* chapters Expansion Card - Key Feature */}
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
              {expandedChapters ? 'Full biography generated' : 'Generate full biography text'}
            </h4>
            <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)', marginBottom: 12 }}>
              {expandedChapters
                ? `Generated ${expandedChapters.length}  chapters full biography, using "${AUTHOR_STYLES[selectedAuthorStyle]?.name || 'Default'}" style`
                : 'Expand outline points into full biography text with professional literary style'}
            </p>

            {/* Author Style Selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'rgba(255, 255, 255, 0.8)' }}>
                Select literary style:
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
              {expanding ? expandProgress || 'Generating...' : expandedChapters ? 'Regenerate' : 'Generate full biography'}
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
                  Edit biography content (correct names/delete paragraphs)
                </button>
                <p style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', margin: 0 }}>
                  Click "Start Export" for professional book typesetting
                </p>
              </div>
            )}
          </div>

          {/* Template Selection */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
              Layout Template
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
              Export Format
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

          {/* Options */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
              Export Options
            </label>
            {[
              { label: 'Include photos', checked: includePhotos, setter: setIncludePhotos },
              {
                label: 'Include family tree',
                checked: includeFamilyTree,
                setter: setIncludeFamilyTree,
              },
              { label: 'Generate table of contents', checked: includeTOC, setter: setIncludeTOC },
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
              Preview
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
              {exporting ? 'Exporting...' : 'Start Export'}
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
            Preview Info
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
                  Version
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
                  Template
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
                  Format
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
                  chapters List
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
                    {idx + 1}. {section.title || 'Unnamed chapters'}
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
                    Plus {(selectedOutline.outline_json?.sections?.length || 0) - 5} chapters...
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
                  chapterss with photos
                </div>
                {sectionPhotos.length === 0 && (
                  <p style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' }}>No photo attachments</p>
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
                      <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)' }}>{sec.count}  photos</div>
                    </div>
                    {sec.count === 0 ? (
                      <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)' }}>No photos attached yet</div>
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
              Please select an outline version first
            </p>
          )}
        </div>
      </div>

      {/* Biography Editor Modal */}
      {showEditor && expandedChapters && (
        <BiographyEditor
          chapterss={expandedChapters}
          onSave={handleSaveEditedChapters}
          onClose={() => setShowEditor(false)}
          authorStyle={AUTHOR_STYLES[selectedAuthorStyle]?.name || 'Default'}
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
                Print Preview - {templateConfig[template].icon} {templateConfig[template].name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                Version {selectedVersion} · {selectedOutline.outline_json?.sections?.length || 0} chapters
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
              Close Preview
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
                  Personal Biography
                </h1>
                <p style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>
                  {templateConfig[template].icon} {templateConfig[template].name}
                </p>
                <p style={{ fontSize: 14, color: '#999' }}>
                  Generated: {new Date().toLocaleDateString('zh-CN')}
                </p>
              </div>

              {/* Table of Contents Preview */}
              {includeTOC && (
                <div style={{ marginBottom: 40 }}>
                  <h2 style={{ fontSize: 24, marginBottom: 20, color: templateConfig[template].colors.primary, borderBottom: '2px solid ' + templateConfig[template].colors.primary, paddingBottom: 10 }}>
                    Table of Contents
                  </h2>
                  {selectedOutline.outline_json?.sections?.slice(0, 5).map((section: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dotted #ddd' }}>
                      <span style={{ color: '#333' }}>{idx + 1}. {section.title || 'Unnamed chapters'}</span>
                      <span style={{ color: '#999' }}>{idx + 2}</span>
                    </div>
                  ))}
                  {(selectedOutline.outline_json?.sections?.length || 0) > 5 && (
                    <div style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                      ... Plus {(selectedOutline.outline_json?.sections?.length || 0) - 5} chapters
                    </div>
                  )}
                </div>
              )}

              {/* Sample chapters Preview */}
              {selectedOutline.outline_json?.sections?.[0] && (
                <div style={{ marginBottom: 40 }}>
                  <h2 style={{ fontSize: 22, marginBottom: 16, color: templateConfig[template].colors.primary }}>
                    Chapter 1: {selectedOutline.outline_json.sections[0].title || 'Unnamed chapters'}
                  </h2>
                  <div style={{ fontSize: 14, lineHeight: 1.8, color: '#333', textAlign: 'justify' }}>
                    {(selectedOutline.outline_json.sections[0].bullets?.join(' ') || '')?.slice(0, 500) || '(Chapter content preview)'}
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
                          Photo position
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Page indicator */}
              <div style={{ position: 'absolute', bottom: 20, right: 50, color: '#999', fontSize: 12 }}>
                chapters Page 1
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






















