'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import UnifiedNav from '../components/UnifiedNav';
import { listProjectOutlines, BiographyOutline, updateOutlineContent } from '@/lib/biographyOutlineApi';
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
import { generatePaginatedBookHTML, type PaginationConfig } from '@/lib/pdfPagination';
import {
  generateVivliostyleHTML,
  getAllChapterPhotos,
  getChapterPhotos,
  type BookConfig,
  type BookChapter,
  type ChapterPhoto,
} from '@/lib/vivliostyleBookGenerator';
import BookCoverGenerator from '@/app/components/BookCoverGenerator';
import { getPlaces } from '@/lib/knowledgeGraphApi';
import type { Place } from '@/lib/types/knowledge-graph';

// Dynamic import for map component (SSR disabled)
const PlacesMap = dynamic(() => import('@/components/PlacesMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[300px] rounded-xl bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600 mx-auto mb-2"></div>
        <p className="text-xs text-gray-500">加载地图...</p>
      </div>
    </div>
  ),
});

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

// Feature unlock threshold for Edit Biography
const EDIT_BIO_UNLOCK_THRESHOLD = 80;

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

  // State: Unlock status
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showLockModal, setShowLockModal] = useState(false);

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
  const [includePhotos, setIncludePhotos] = useState(false);
  const [includeFamilyTree, setIncludeFamilyTree] = useState(true);
  const [includeTOC, setIncludeTOC] = useState(true);
  const [exportFormat, setExportFormat] = useState<'epub' | 'pdf'>('pdf');
  
  // 印刷配置
  const [printPreset, setPrintPreset] = useState<'a5Standard' | 'a4Standard' | 'simpleA4'>('a5Standard');
  const [printConfig, setPrintConfig] = useState<PrintConfig>(PRINT_PRESETS.a5Standard);
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const [showPreflightCheck, setShowPreflightCheck] = useState(false);
  const [bookTitle, setBookTitle] = useState('我的传记');
  const [authorName, setAuthorName] = useState('');
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<Array<{ title: string; description: string }>>([]);

  // 导出引擎选择
  type ExportEngine = 'vivliostyle' | 'html2canvas';
  const [exportEngine, setExportEngine] = useState<ExportEngine>('vivliostyle');
  const [photosPerChapter, setPhotosPerChapter] = useState(3);
  const [photoSize, setPhotoSize] = useState<'small' | 'medium' | 'large'>('medium');

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
    fileUrl?: string; // Optional: local exports may not have a URL
    template: string;
    version: number;
    createdAt: string;
    status: 'cloud_stored' | 'local_download';
  }
  const [pdfHistory, setPdfHistory] = useState<PdfHistory[]>([]);

  // State: Chapter Photos from Database
  const [chapterPhotosMap, setChapterPhotosMap] = useState<Map<number, ChapterPhoto[]>>(new Map());
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  // State: Manual Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // State: Book Cover Generator Modal
  const [showCoverGenerator, setShowCoverGenerator] = useState(false);

  // State: Map Screenshot
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapPlaces, setMapPlaces] = useState<Place[]>([]);
  const [loadingMapPlaces, setLoadingMapPlaces] = useState(false);
  const [mapScreenshot, setMapScreenshot] = useState<string | null>(null);
  const [capturingMap, setCapturingMap] = useState(false);
  const [includeMapInBook, setIncludeMapInBook] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Initialize auth and project
  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!isMounted) return;
        if (!user) return;

        const { data: list } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1);
        
        if (!isMounted) return;

        const pid = list?.[0]?.id;
        if (pid) {
          setProjectId(pid);

          // Get answered count for unlock check
          const { data: answers } = await supabase
            .from('answer_sessions')
            .select('question_id')
            .eq('project_id', pid);

          if (!isMounted) return;

          if (answers) {
            // Count unique question_ids (main questions only)
            const uniqueQuestions = new Set(answers.map(a => a.question_id));
            setAnsweredCount(uniqueQuestions.size);
          }
        }
      } catch (err: any) {
        // Ignore AbortError which can happen in strict mode or rapid navigation
        if (err.name === 'AbortError') return;
        console.error('Auth init failed:', err);
      }
    }
    init();
    return () => { isMounted = false; };
  }, []);

  // Listen for Vivliostyle preview close to prompt upload
  useEffect(() => {
    const handlePreviewClosed = () => {
      // Small delay to ensure the UI feels natural
      setTimeout(() => {
        setShowUploadModal(true);
      }, 500);
    };
    window.addEventListener('close-preview-iframe', handlePreviewClosed);
    return () => window.removeEventListener('close-preview-iframe', handlePreviewClosed);
  }, []);

  // Handle manual PDF upload
  const handleManualUpload = async () => {
    if (!uploadFile || !projectId) return;

    setIsUploading(true);
    try {
      const timestamp = Date.now();
      // Use the uploaded filename but sanitize it
      const safeFileName = generateStorageSafePath(uploadFile.name);
      const storagePath = `pdfs/${projectId}/${timestamp}_${safeFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('biography-exports')
        .upload(storagePath, uploadFile, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('biography-exports')
        .getPublicUrl(storagePath);

      // Add to history
      const newHistory: PdfHistory = {
        id: crypto.randomUUID(),
        fileName: uploadFile.name,
        fileUrl: urlData.publicUrl,
        template: `${template}-vivliostyle`, // Mark as vivliostyle
        version: selectedVersion || 0,
        createdAt: new Date().toISOString(),
        status: 'cloud_stored'
      };

      const updatedHistory = [newHistory, ...pdfHistory];
      setPdfHistory(updatedHistory);
      localStorage.setItem('pdfHistory', JSON.stringify(updatedHistory));

      setShowUploadModal(false);
      setUploadFile(null);
      alert('✅ 上传成功，已保存到历史记录！');
    } catch (err: any) {
      console.error('Upload failed:', err);
      alert('上传失败: ' + (err.message || '未知错误'));
    } finally {
      setIsUploading(false);
    }
  };

  // Fetch photos from database for preview
  useEffect(() => {
    let isMounted = true;
    async function fetchPhotos() {
      if (!projectId || !selectedOutline) {
        setChapterPhotosMap(new Map());
        return;
      }

      setLoadingPhotos(true);
      try {
        const bookChapters: BookChapter[] = selectedOutline.outline_json?.sections?.map((section, idx) => ({
          title: section.title || `章节 ${idx + 1}`,
          content: '', // Content not needed for photo lookup
          sourceIds: (section as any).source_ids || [],
          chapterId: String(idx),
          outlineId: selectedOutline.id,
        })) || [];

        if (bookChapters.length > 0) {
          const photoMap = await getAllChapterPhotos(projectId, bookChapters);
          if (isMounted) {
            setChapterPhotosMap(photoMap);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          if (err.name !== 'AbortError') {
             console.error('Failed to fetch chapter photos:', err);
          }
        }
      } finally {
        if (isMounted) {
          setLoadingPhotos(false);
        }
      }
    }

    fetchPhotos();
    return () => { isMounted = false; };
  }, [projectId, selectedOutline]);

  // Load outlines
  useEffect(() => {
    let isMounted = true;
    if (!projectId) return;
    
    listProjectOutlines(projectId)
      .then((data) => {
        if (!isMounted) return;
        setOutlines(data);
        if (data.length > 0 && !selectedVersion) {
          setSelectedVersion(data[0].version);
          setSelectedOutline(data[0]);
        }
      })
      .catch(err => {
        if (isMounted && err.name !== 'AbortError') {
          console.error('Failed to list outlines:', err);
        }
      });
      
    return () => { isMounted = false; };
  }, [projectId, selectedVersion]);
  
  // Sync print preset changes
  useEffect(() => {
    setPrintConfig(PRINT_PRESETS[printPreset]);
  }, [printPreset]);

  // Load map places when modal is opened
  useEffect(() => {
    if (!showMapModal || !projectId) return;
    
    let isMounted = true;
    setLoadingMapPlaces(true);
    
    getPlaces(projectId, { hasEvents: true })
      .then((places) => {
        if (isMounted) {
          setMapPlaces(places);
        }
      })
      .catch((err) => {
        console.error('Failed to load places for map:', err);
      })
      .finally(() => {
        if (isMounted) {
          setLoadingMapPlaces(false);
        }
      });
    
    return () => { isMounted = false; };
  }, [showMapModal, projectId]);

  // Capture map screenshot
  const captureMapScreenshot = async () => {
    if (!mapContainerRef.current) return;
    
    setCapturingMap(true);
    try {
      // Wait a bit for the map to stabilize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await html2canvas(mapContainerRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2, // Higher quality
        backgroundColor: '#ffffff',
        logging: false,
      });
      
      const dataUrl = canvas.toDataURL('image/png');
      setMapScreenshot(dataUrl);
      setIncludeMapInBook(true);
      
      alert('✅ 地图截图已保存！将在导出时自动添加到书籍中。');
    } catch (error) {
      console.error('Failed to capture map:', error);
      alert('截图失败，请重试');
    } finally {
      setCapturingMap(false);
    }
  };

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
    let isMounted = true;
    if (!selectedOutline?.id) {
      setExpandedChapters(null);
      return;
    }
    getExpandedChapters(selectedOutline.id)
      .then((data) => {
        if (!isMounted) return;
        if (data?.chapters) {
          setExpandedChapters(data.chapters);
          setSelectedAuthorStyle(data.author_style || 'default');
        } else {
          setExpandedChapters(null);
        }
      })
      .catch(err => {
         if (isMounted && err.name !== 'AbortError') {
           console.error('Failed to get expanded chapters:', err);
         }
      });
      
    return () => { isMounted = false; };
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
                outline_json: selectedOutline.outline_json, // Preserve outline structure
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

  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  // Sync book title and author name from outline
  useEffect(() => {
    if (selectedOutline?.outline_json) {
      const json = selectedOutline.outline_json as any;
      if (json.book_title) {
        setBookTitle(json.book_title);
      } else {
        setBookTitle('我的传记');
      }

      if (json.author_name) {
        setAuthorName(json.author_name);
      } else {
        setAuthorName('');
      }
    }
  }, [selectedOutline?.id]);

  const handleSaveMetadata = async () => {
    if (!selectedOutline?.id || !selectedOutline.outline_json) return;
    
    setIsSavingMetadata(true);
    try {
      const updatedJson = {
        ...selectedOutline.outline_json,
        book_title: bookTitle,
        author_name: authorName
      };

      const { success, error } = await updateOutlineContent(selectedOutline.id, updatedJson as any);
      
      if (success) {
        // Update local state outlines to reflect the change without refetching
        setOutlines(prev => prev.map(o => 
          o.id === selectedOutline.id 
            ? { ...o, outline_json: updatedJson as any } 
            : o
        ));
        // Update selectedOutline as well
        setSelectedOutline(prev => prev ? { ...prev, outline_json: updatedJson as any } : prev);
        
        alert('保存成功！');
      } else {
        throw new Error(error);
      }
    } catch (err: any) {
      console.error('Save metadata failed:', err);
      alert('保存失败: ' + (err.message || '未知错误'));
    } finally {
      setIsSavingMetadata(false);
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
  // Supabase Storage requires ASCII-safe filenames without special characters
  const generateSafeFileName = (title: string): string => {
    // First, try to transliterate common Chinese characters or use a hash
    // For now, we'll use a simple approach: keep only alphanumeric and replace others
    const sanitized = title
      .replace(/[^\w\u4e00-\u9fa5]/g, '_') // Keep alphanumeric and Chinese
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .substring(0, 50); // Limit length

    // For Supabase Storage path, we need ASCII-only names
    // Use encodeURIComponent but replace % with _ for cleaner names
    return sanitized;
  };

  // Helper: Generate storage-safe path (ASCII only for Supabase)
  const generateStorageSafePath = (fileName: string): string => {
    // Remove or replace non-ASCII characters for storage path
    return fileName
      .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII (Chinese, etc.)
      .replace(/[\\/:*?"<>|]/g, '_') // Replace invalid chars
      .replace(/\s+/g, '_') // Replace spaces
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      || 'biography'; // Fallback if empty
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
        let errBody = null
        try {
          errBody = await response.json()
        } catch (e) {
          // ignore parse errors
        }
        const serverMsg = errBody?.error || errBody?.message || `Status ${response.status}`
        console.error('Title generation failed (server):', serverMsg)
        alert(`生成书名失败: ${serverMsg}`)
        return
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

    // If we have expanded chapters, use the selected export engine
    // (Restored logic: Prioritize Smart Export/Vivliostyle)
    if (expandedChapters && expandedChapters.length > 0) {
      console.log('Starting smart export with engine:', exportEngine);
      await handleSmartExport();
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
            // 优先从数据库获取（新系统）
            const dbPhotos = chapterPhotosMap.get(idx) || [];
            if (dbPhotos.length > 0) {
              chapterContent += `<div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 8px;">`;
              chapterContent += `<p style="color: #666; font-size: 13px;">[本章节包含 ${dbPhotos.length} 张照片附件]</p>`;
              dbPhotos.forEach((photo) => {
                if (photo.caption) {
                  chapterContent += `<p style="margin: 5px 0; color: #444; font-size: 13px;">  - ${photo.caption}</p>`;
                }
              });
              chapterContent += '</div>';
            } else {
              // 备选：从本地存储获取（旧系统）
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
          // Use ASCII-safe path for Supabase Storage
          const safeStorageName = generateStorageSafePath(`${safeTitle}_v${selectedVersion}_${template}`);
          const storagePath = `pdfs/${projectId}/${timestamp}_${safeStorageName}.pdf`;
          
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
              createdAt: new Date().toISOString(),
              status: 'cloud_stored'
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
  // Uses smart pagination to ensure paragraphs are never cut off
  const handleBookExport = async () => {
    if (!expandedChapters || expandedChapters.length === 0) {
      alert('请先生成完整传记文本');
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('正在生成专业排版的传记...');

    try {
      // Step 1: Prepare pagination config from print config
      setProgress(10);
      setStatusMessage('正在计算智能分页...');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const chapters = expandedChapters.map((ch) => ({
        title: ch.title,
        content: ch.content,
      }));

      // Convert PrintConfig to PaginationConfig
      const paginationConfig: PaginationConfig = {
        pageWidth: printConfig.pageSize.width,
        pageHeight: printConfig.pageSize.height,
        marginTop: printConfig.margins.top,
        marginBottom: printConfig.margins.bottom,
        marginInner: printConfig.margins.inner,
        marginOuter: printConfig.margins.outer,
        fontSize: printConfig.body.fontSize,
        lineHeight: printConfig.body.lineHeight,
        chapterTopSpacing: printConfig.chapter.topSpacing,
        chapterTitleHeight: 25, // Estimated height for chapter title block
      };

      // Generate paginated HTML using smart pagination engine
      const bookHtml = generatePaginatedBookHTML(chapters, paginationConfig, bookTitle);

      // Step 2: Create hidden iframe for rendering
      setProgress(20);
      setStatusMessage('正在渲染页面...');
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-9999px';
      iframe.style.width = `${printConfig.pageSize.width}mm`;
      iframe.style.height = `${printConfig.pageSize.height}mm`;
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
      const pageWidthMm = printConfig.pageSize.width;
      const pageHeightMm = printConfig.pageSize.height;

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
          // Use ASCII-safe path for Supabase Storage
          const safeStorageName = generateStorageSafePath(`${safeTitle}_${presetName}_${styleName}_v${selectedVersion}`);
          const storagePath = `pdfs/${projectId}/${timestamp}_${safeStorageName}.pdf`;
          
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
              createdAt: new Date().toISOString(),
              status: 'cloud_stored'
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

  // Vivliostyle 专业排版导出（支持图片）
  const handleVivliostyleExport = async () => {
    if (!expandedChapters || expandedChapters.length === 0) {
      alert('请先生成完整传记文本');
      return;
    }

    if (!projectId) {
      alert('项目ID未找到');
      return;
    }

    setExporting(true);
    setProgress(0);
    setStatusMessage('正在准备 Vivliostyle 专业排版...');

    try {
      // Step 1: 准备章节数据（包含 source_ids）
      setProgress(10);
      setStatusMessage('正在解析章节数据...');

      const bookChapters: BookChapter[] = expandedChapters.map((ch, idx) => {
        // 从 outline 获取 source_ids
        const outlineSection = selectedOutline?.outline_json?.sections?.[idx];
        return {
          title: ch.title,
          content: ch.content,
          sourceIds: outlineSection?.source_ids || [],
          chapterId: String(idx),
          outlineId: selectedOutline?.id,
        };
      });

      // Step 2: 获取关联照片
      setProgress(30);
      setStatusMessage('正在获取关联照片...');

      let chapterPhotos = new Map<number, any[]>();
      if (includePhotos) {
        // 1. 获取自动关联的照片 (DB)
        chapterPhotos = await getAllChapterPhotos(projectId, bookChapters);
        
        // 2. 获取手动关联的照片 (LocalStorage)
        const currentAttachments = attachments.filter(
          a => selectedVersion !== null && a.outlineVersion === selectedVersion
        );
        
        if (currentAttachments.length > 0) {
           console.log(`🔍 发现 ${currentAttachments.length} 个手动标注，正在获取详情...`);
           const photoIds = [...new Set(currentAttachments.map(a => a.photoId))];
           
           const { data: manualPhotos } = await supabase
             .from('photo_memories')
             .select(`
               id,
               photo_url,
               caption,
               linked_question_id,
               photo_people(
                 people_roster(name)
               )
             `)
             .in('id', photoIds);

           if (manualPhotos) {
             const photoLookup = new Map(manualPhotos.map(p => [p.id, p]));
             
             currentAttachments.forEach(att => {
               const p = photoLookup.get(att.photoId);
               if (p) {
                 const chapterIdx = att.sectionIndex;
                 const existing = chapterPhotos.get(chapterIdx) || [];
                 
                 // Avoid duplicates by URL
                 if (!existing.some(e => e.url === p.photo_url)) {
                   // Extract person names
                   const personNames = p.photo_people
                    ? (p.photo_people as any[])
                        .map(pp => pp.people_roster?.name)
                        .filter(Boolean)
                    : [];

                   existing.push({
                     url: p.photo_url,
                     personNames: personNames,
                     caption: att.note || p.caption || '', // Use manual note if available
                     questionId: p.linked_question_id
                   });
                   chapterPhotos.set(chapterIdx, existing);
                 }
               }
             });
           }
        }

        const totalPhotos = Array.from(chapterPhotos.values()).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`📷 找到 ${totalPhotos} 张关联照片 (含手动标注)`);
      }

      // Step 3: 生成配置
      setProgress(50);
      setStatusMessage('正在生成排版配置...');

      const pageSize = printPreset === 'a5Standard' ? 'A5' : 'A4';
      const bookConfig: BookConfig = {
        title: bookTitle,
        subtitle: '', // 不再显示风格名称
        author: authorName,
        pageSize: pageSize,
        fontSize: printConfig.body.fontSize,
        lineHeight: printConfig.body.lineHeight,
        margins: {
          top: printConfig.margins.top,
          bottom: printConfig.margins.bottom,
          inner: printConfig.margins.inner,
          outer: printConfig.margins.outer,
        },
        includePhotos: includePhotos,
        photosPerChapter: photosPerChapter,
        photoSize: photoSize,
      };

      // Step 4: 调用云端生成 API
      setProgress(70);
      setStatusMessage('正在云端生成 PDF (请稍候)...');

      // 转换 Map 为 Array 以便传输
      const chapterPhotosEntries = Array.from(chapterPhotos.entries());

      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookConfig,
          chapters: bookChapters,
          chapterPhotosEntries
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${response.statusText}`);
      }

      const pdfBlob = await response.blob();

      // Step 5: 保存和下载
      setProgress(90);
      setStatusMessage('正在保存文件...');

      const presetName = printPreset.replace('Standard', '').toUpperCase();
      const styleName = AUTHOR_STYLES[selectedAuthorStyle]?.nameEn || 'default';
      const safeTitle = generateSafeFileName(bookTitle);
      const fileName = `${safeTitle}_${presetName}_${styleName}_v${selectedVersion}.pdf`;

      // Try to upload to Supabase Storage
      let uploadSuccess = false;
      let publicUrl = '';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && projectId) {
          const timestamp = Date.now();
          const safeStorageName = generateStorageSafePath(`${safeTitle}_${presetName}_${styleName}_v${selectedVersion}`);
          const storagePath = `pdfs/${projectId}/${timestamp}_${safeStorageName}.pdf`;
          
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
            
            publicUrl = urlData.publicUrl;
            console.log('✅ PDF上传成功，URL:', publicUrl);
            
            // Save to history
            const newHistory: PdfHistory = {
              id: crypto.randomUUID(),
              fileName,
              fileUrl: publicUrl,
              template: `${presetName}-${styleName}-vivliostyle`,
              version: selectedVersion || 0,
              createdAt: new Date().toISOString(),
              status: 'cloud_stored'
            };
            
            const updatedHistory = [newHistory, ...pdfHistory];
            setPdfHistory(updatedHistory);
            localStorage.setItem('pdfHistory', JSON.stringify(updatedHistory));
            uploadSuccess = true;
          }
        }
      } catch (err) {
        console.error('❌ PDF上传异常:', err);
      }

      // Trigger local download
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setProgress(100);
      setStatusMessage('✅ PDF生成成功！');

      setTimeout(() => {
        setExporting(false);
        setProgress(0);
        setStatusMessage('');
        const message = uploadSuccess 
          ? `✅ 导出成功！\n\nPDF文件：${fileName}\n已自动下载，并保存到云端历史记录。`
          : `✅ PDF已下载！\n\n文件：${fileName}\n已保存到下载文件夹。\n\n⚠️ 云端保存失败，历史记录仅保存在本地。`;
        alert(message);
      }, 1000);

    } catch (error: any) {
      console.error('Vivliostyle export failed:', error);
      alert('导出失败: ' + (error.message || '未知错误'));
      setExporting(false);
      setProgress(0);
      setStatusMessage('');
    }
  };

  // 统一导出入口
  const handleSmartExport = async () => {
    if (exportEngine === 'vivliostyle') {
      await handleVivliostyleExport();
    } else {
      await handleBookExport();
    }
  };

  const stats = getStats();

  // Build quick lookup tables for attachments and photos
  const sectionPhotos = selectedOutline?.outline_json?.sections?.map((section, idx) => {
    // 优先从数据库获取的照片（新系统）
    const dbPhotos = chapterPhotosMap.get(idx) || [];
    
    if (dbPhotos.length > 0) {
      return {
        title: section.title || `章节 ${idx + 1}`,
        count: dbPhotos.length,
        thumbs: dbPhotos.map(p => p.url),
      };
    }

    // 备选：从本地存储获取（旧系统/手动关联）
    const att = attachments.filter(
      (a) => selectedVersion !== null && a.outlineVersion === selectedVersion && a.sectionIndex === idx
    );
    const photoMap = new Map<string, PhotoItem>(photos.map((p) => [p.id, p]));
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
        className="min-h-screen bg-[#F7F5F2]"
        style={{ padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif', color: '#2C2C2C' }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <UnifiedNav />
          
          {/* Header */}
          <div className="w-full px-4 py-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#2C2C2C]">
                  电子书导出引擎
                </h1>
                <p className="text-[#666666] mt-1">
                  Inspired by Bookwright & Affinity Publisher
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href="/outline-annotate"
                  className="px-5 py-2.5 bg-white border border-[#E5E5E0] hover:bg-[#F5F5F0] text-[#2C2C2C] rounded-xl transition-all duration-200 font-medium shadow-sm flex items-center gap-2"
                >
                  ← 返回审阅大纲
                </Link>
                <Link
                  href="/main"
                  className="px-5 py-2.5 bg-white border border-[#E5E5E0] hover:bg-[#F5F5F0] text-[#2C2C2C] rounded-xl transition-all duration-200 font-medium shadow-sm flex items-center gap-2"
                >
                  ← 主页
                </Link>
              </div>
            </div>
          </div>

      {/* Main Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 320px', gap: 20 }}>
        {/* Left: Version Selector */}
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
            maxHeight: '80vh',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--accent-cyan)' }}>
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
                    ? 'rgba(0, 212, 255, 0.12)'
                    : 'var(--card)',
                border:
                  selectedVersion === o.version
                    ? '1px solid rgba(0, 212, 255, 0.35)'
                    : '1px solid rgba(31, 31, 31, 0.06)',
                borderRadius: 6,
                color: selectedVersion === o.version ? '#00d4ff' : 'var(--text-primary)',
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
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              暂无大纲数据
            </p>
          )}

          {/* Edit Links Hint */}
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)' }}>
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
              id="pdf-history-section"
              style={{
                marginTop: 16,
                padding: 12,
                background: 'rgba(95, 111, 82, 0.08)',
                border: '1px solid rgba(95, 111, 82, 0.2)',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: '#5F6F52', marginBottom: 10 }}>
                📥 已生成的 PDF
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pdfHistory.slice(0, 5).map((pdf) => (
                  <div
                    key={pdf.id}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(255, 255, 255, 0.5)',
                      borderRadius: 4,
                      fontSize: 10,
                      border: '1px solid rgba(95, 111, 82, 0.1)',
                    }}
                  >
                    <div style={{ color: '#3B2F23', marginBottom: 4, fontWeight: 500 }}>
                      v{pdf.version} · {pdf.template}
                    </div>
                    <div style={{ color: '#8C8377', marginBottom: 6 }}>
                      {new Date(pdf.createdAt).toLocaleString()}
                      {pdf.status === 'local_download' && (
                        <span style={{ 
                          marginLeft: 6, 
                          fontSize: 9, 
                          background: '#eee', 
                          padding: '2px 4px', 
                          borderRadius: 3 
                        }}>
                          本地
                        </span>
                      )}
                    </div>
                    {pdf.fileUrl ? (
                      <a
                        href={pdf.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          background: 'rgba(95, 111, 82, 0.1)',
                          border: '1px solid rgba(95, 111, 82, 0.3)',
                          borderRadius: 4,
                          color: '#5F6F52',
                          fontSize: 10,
                          textDecoration: 'none',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(95, 111, 82, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(95, 111, 82, 0.1)';
                        }}
                      >
                        下载 PDF ↓
                      </a>
                    ) : (
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        background: '#f5f5f5',
                        border: '1px solid #e0e0e0',
                        borderRadius: 4,
                        color: '#999',
                        fontSize: 10,
                        cursor: 'not-allowed'
                      }}>
                        文件在本地 (未上传)
                      </span>
                    )}
                  </div>
                ))}
                {pdfHistory.length > 5 && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>
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
              background: 'rgba(31, 31, 31, 0.04)',
              border: '1px solid rgba(31, 31, 31, 0.12)',
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
              background: 'rgba(184,155,114,0.05)',
              border: '1px solid rgba(184,155,114,0.2)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h4 style={{ fontSize: 14, marginBottom: 12, color: '#8B7355' }}>
              📊 内容统计
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  章节数量
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#B89B72' }}>
                  {stats.sectionCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  照片数量
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#B89B72' }}>
                  {stats.photoCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  家族成员
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#B89B72' }}>
                  {stats.memberCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  照片标注
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#B89B72' }}>
                  {stats.attachmentCount}
                </div>
              </div>
            </div>
          </div>

          {/* Chapter Expansion Card - Key Feature */}
          <div
            style={{
              background: expandedChapters
                ? 'rgba(95, 111, 82, 0.1)'
                : 'rgba(201, 160, 99, 0.1)',
              border: expandedChapters
                ? '1px solid rgba(95, 111, 82, 0.3)'
                : '1px solid rgba(201, 160, 99, 0.3)',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h4 style={{ fontSize: 14, marginBottom: 12, color: expandedChapters ? '#5F6F52' : '#C9A063' }}>
              {expandedChapters ? '✅ 完整传记已生成' : '📝 生成完整传记文本'}
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {expandedChapters
                ? `已生成 ${expandedChapters.length} 章完整传记，使用「${AUTHOR_STYLES[selectedAuthorStyle]?.name || '默认'}」风格`
                : '将大纲要点扩展成完整的传记文本，带有专业作家的文学风格'}
            </p>

            {/* Author Style Selection */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-primary)' }}>
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
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--text-primary)',
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
                  ? 'rgba(31, 31, 31, 0.06)'
                  : expandedChapters
                    ? 'linear-gradient(135deg, #5F6F52, #4A5D23)'
                    : 'linear-gradient(135deg, #C9A063, #A67C00)',
                color: '#fff',
                cursor: expanding || !selectedOutline ? 'not-allowed' : 'pointer',
                opacity: expanding || !selectedOutline ? 0.6 : 1,
              }}
            >
              {expanding ? expandProgress || '正在生成...' : expandedChapters ? '🔄 重新生成' : '✨ 生成完整传记'}
            </button>

            {expandedChapters && (
              <div style={{ marginTop: 12 }}>
                {answeredCount >= EDIT_BIO_UNLOCK_THRESHOLD ? (
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
                ) : (
                  <button
                    onClick={() => setShowLockModal(true)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      fontSize: 13,
                      background: 'rgba(100, 116, 139, 0.2)',
                      border: '1px solid rgba(100, 116, 139, 0.3)',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      marginBottom: 8,
                    }}
                  >
                    ✏️ 编辑传记内容 🔒
                  </button>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                  点击「开始导出」将使用专业书籍排版
                </p>
              </div>
            )}
          </div>

          {/* Template Selection */}
          <div style={{ marginBottom: 24, display: 'none' }}>
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
                        : 'var(--card)',
                    border:
                      template === t
                        ? '1px solid rgba(0, 212, 255, 0.5)'
                        : '1px solid var(--border)',
                    borderRadius: 6,
                    color: template === t ? '#00d4ff' : 'var(--text-primary)',
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
                      : 'var(--card)',
                  border:
                    exportFormat === 'pdf'
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid var(--border)',
                  borderRadius: 6,
                  color: exportFormat === 'pdf' ? '#00d4ff' : 'var(--text-primary)',
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
                      : 'var(--card)',
                  border:
                    exportFormat === 'epub'
                      ? '1px solid rgba(0, 212, 255, 0.5)'
                      : '1px solid var(--border)',
                  borderRadius: 6,
                  color: exportFormat === 'epub' ? '#00d4ff' : 'var(--text-primary)',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                EPUB
              </button>
            </div>
          </div>

          {/* Print Configuration - Hidden, default A5 */}
          {exportFormat === 'pdf' && expandedChapters && (
            <div style={{ marginBottom: 24, display: 'none' }}>
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
                            ? 'rgba(139, 115, 85, 0.15)'
                            : 'var(--card)',
                        border:
                          printPreset === preset
                            ? '1px solid rgba(139, 115, 85, 0.5)'
                            : '1px solid var(--border)',
                        borderRadius: 6,
                        color: printPreset === preset ? '#8B7355' : 'var(--text-primary)',
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
                  background: 'rgba(139, 115, 85, 0.08)',
                  border: '1px solid rgba(139, 115, 85, 0.2)',
                  borderRadius: 6,
                  fontSize: 10,
                    color: 'var(--text-secondary)',
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
                    background: 'rgba(139, 115, 85, 0.2)',
                    border: '1px solid rgba(139, 115, 85, 0.4)',
                    borderRadius: 4,
                    color: '#8B7355',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  🔍 印刷预检
                </button>
              </div>
            </div>
          )}

          {/* Export Engine Selection - Hidden, default Vivliostyle */}
          {exportFormat === 'pdf' && expandedChapters && (
            <div style={{ marginBottom: 24, display: 'none' }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
                🔧 导出引擎
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <button
                  onClick={() => setExportEngine('vivliostyle')}
                  style={{
                    padding: '12px 10px',
                    background: exportEngine === 'vivliostyle' ? 'rgba(95, 111, 82, 0.15)' : 'var(--card)',
                    border: exportEngine === 'vivliostyle' ? '1px solid rgba(95, 111, 82, 0.5)' : '1px solid var(--border)',
                    borderRadius: 6,
                    color: exportEngine === 'vivliostyle' ? '#5F6F52' : 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>📖 Vivliostyle（推荐）</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                    专业排版引擎，支持图片插入，段落不截断
                  </div>
                </button>
                <button
                  onClick={() => setExportEngine('html2canvas')}
                  style={{
                    padding: '12px 10px',
                    background: exportEngine === 'html2canvas' ? 'rgba(139, 115, 85, 0.15)' : 'var(--card)',
                    border: exportEngine === 'html2canvas' ? '1px solid rgba(139, 115, 85, 0.5)' : '1px solid var(--border)',
                    borderRadius: 6,
                    color: exportEngine === 'html2canvas' ? '#8B7355' : 'var(--text-primary)',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>🖼️ 图片渲染</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
                    逐页截图生成，兼容性更好
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Photo Settings (only for Vivliostyle) */}
          {exportFormat === 'pdf' && expandedChapters && exportEngine === 'vivliostyle' && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
                📷 照片设置
              </label>
              <div style={{
                padding: 12,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      id="includePhotos"
                      checked={includePhotos}
                      onChange={(e) => setIncludePhotos(e.target.checked)}
                      style={{ marginRight: 8 }}
                    />
                    <label htmlFor="includePhotos" style={{ fontSize: 12 }}>
                      自动插入关联照片
                    </label>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 20 }}>
                    系统会根据问题关联自动将照片插入对应章节
                  </div>
                </div>

                {includePhotos && (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                        每章最多照片数
                      </label>
                      <select
                        value={photosPerChapter}
                        onChange={(e) => setPhotosPerChapter(Number(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 4,
                          color: 'var(--text-primary)',
                          fontSize: 12,
                        }}
                      >
                        <option value={1}>1张</option>
                        <option value={2}>2张</option>
                        <option value={3}>3张（推荐）</option>
                        <option value={5}>5张</option>
                        <option value={10}>10张</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                        照片尺寸
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['small', 'medium', 'large'] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => setPhotoSize(size)}
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              background: photoSize === size ? 'rgba(95, 111, 82, 0.15)' : 'var(--bg)',
                              border: photoSize === size ? '1px solid rgba(95, 111, 82, 0.5)' : '1px solid var(--border)',
                              borderRadius: 4,
                              color: photoSize === size ? '#5F6F52' : 'var(--text-primary)',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Map Screenshot Section */}
          {exportFormat === 'pdf' && expandedChapters && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
                🗺️ 地图页面
              </label>
              <div style={{
                padding: 12,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    id="includeMapInBook"
                    checked={includeMapInBook}
                    onChange={(e) => setIncludeMapInBook(e.target.checked)}
                    disabled={!mapScreenshot}
                    style={{ marginRight: 8 }}
                  />
                  <label htmlFor="includeMapInBook" style={{ fontSize: 12 }}>
                    在书中添加地图页面
                  </label>
                </div>
                
                {mapScreenshot ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ 
                      position: 'relative',
                      width: '100%',
                      borderRadius: 6,
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                    }}>
                      <img 
                        src={mapScreenshot} 
                        alt="地图预览" 
                        style={{ 
                          width: '100%', 
                          height: 'auto',
                          display: 'block',
                        }} 
                      />
                      <button
                        onClick={() => {
                          setMapScreenshot(null);
                          setIncludeMapInBook(false);
                        }}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          padding: '4px 8px',
                          background: 'rgba(220, 38, 38, 0.9)',
                          border: 'none',
                          borderRadius: 4,
                          color: 'white',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    从地图页面截取足迹地图，添加到书籍中
                  </div>
                )}
                
                <button
                  onClick={() => setShowMapModal(true)}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    padding: '10px 12px',
                    background: mapScreenshot 
                      ? 'rgba(95, 111, 82, 0.15)' 
                      : 'linear-gradient(135deg, #5F6F52 0%, #7A8B6D 100%)',
                    border: mapScreenshot 
                      ? '1px solid rgba(95, 111, 82, 0.4)' 
                      : 'none',
                    borderRadius: 6,
                    color: mapScreenshot ? '#5F6F52' : 'white',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {mapScreenshot ? '🔄 重新截取地图' : '📸 截取足迹地图'}
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
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.background = 'var(--card)';
                e.target.style.borderColor = '#B89B72';
              }}
              onBlur={(e) => {
                e.target.style.background = 'var(--card)';
                e.target.style.borderColor = 'var(--border)';
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, flex: 1 }}>
                此书名将显示在PDF封面和页眉中
              </p>
              <button
                onClick={handleGenerateBookTitle}
                disabled={generatingTitle || !selectedOutline}
                style={{
                  padding: '6px 12px',
                  background: generatingTitle 
                    ? 'rgba(31, 31, 31, 0.06)' 
                    : 'linear-gradient(135deg, #B89B72, #8B7355)',
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
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(184, 155, 114, 0.4)';
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
                  background: 'rgba(184,155,114,0.08)',
                  border: '1px solid rgba(184,155,114,0.2)',
                  borderRadius: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#B89B72' }}>
                    💡 AI推荐书名
                  </span>
                  <button
                    onClick={() => setShowTitleSuggestions(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
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
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        color: 'var(--text-primary)',
                        fontSize: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(184,155,114,0.15)';
                        e.currentTarget.style.borderColor = 'rgba(184,155,114,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(31, 31, 31, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(31, 31, 31, 0.12)';
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{suggestion.title}</div>
                      {suggestion.description && (
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {suggestion.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Author Name Input */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
              ✍️ 作者署名
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="请输入作者署名（可选）"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                transition: 'all 0.2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#B89B72';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
              }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              此署名将显示在PDF封面的书名下方
            </p>
          </div>

          {/* Save Metadata Button */}
          <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end' }}>
             <button
                onClick={handleSaveMetadata}
                disabled={isSavingMetadata || !selectedOutline}
                style={{
                  padding: '8px 16px',
                  background: 'var(--card)',
                  border: '1px solid #B89B72',
                  borderRadius: 6,
                  color: '#B89B72',
                  fontSize: 13,
                  cursor: isSavingMetadata || !selectedOutline ? 'not-allowed' : 'pointer',
                  opacity: isSavingMetadata || !selectedOutline ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {isSavingMetadata ? '保存中...' : '💾 保存标题和署名'}
              </button>
          </div>

          {/* Options - Hidden as per user request */}
          <div style={{ marginBottom: 24, display: 'none' }}>
            <label style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>
              ⚙️ 导出选项
            </label>
            {[
              { label: '包含照片', checked: includePhotos, setter: setIncludePhotos },
              /* Hidden as per user request
              {
                label: '包含家族关系图',
                checked: includeFamilyTree,
                setter: setIncludeFamilyTree,
              },
              */
              { label: '生成目录', checked: includeTOC, setter: setIncludeTOC },
            ].map(({ label, checked, setter }) => (
              <label
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 12px',
                  marginBottom: 8,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
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
                    accentColor: '#B89B72',
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Preview & Export Buttons */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => {
                const historySection = document.getElementById('pdf-history-section');
                if (historySection) {
                  historySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Add a temporary highlight effect
                  const originalBg = historySection.style.background;
                  historySection.style.transition = 'background 0.5s';
                  historySection.style.background = 'rgba(95, 111, 82, 0.25)';
                  setTimeout(() => {
                    historySection.style.background = originalBg;
                  }, 1500);
                } else {
                  if (pdfHistory.length === 0) {
                    alert('暂无导出记录，请先导出一次 PDF');
                  }
                }
              }}
              className="px-5 py-3.5 bg-white border border-[#E5E5E0] hover:bg-[#F5F5F0] text-[#2C2C2C] rounded-xl transition-all duration-200 font-medium shadow-sm flex-1 flex items-center justify-center gap-2"
            >
              📥 查看过往导出
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || !selectedOutline}
              className="px-5 py-3.5 bg-[#B89B72] hover:bg-[#A89070] text-white rounded-xl transition-all duration-200 font-medium shadow-sm flex-1 flex items-center justify-center gap-2"
              style={{
                opacity: exporting || !selectedOutline ? 0.5 : 1,
                cursor: exporting || !selectedOutline ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? '正在导出...' : '🚀 开始导出'}
            </button>
          </div>

          {/* Book Cover Generator Button */}
          <button
            onClick={() => setShowCoverGenerator(true)}
            className="w-full px-5 py-3.5 bg-white border border-purple-200 hover:bg-purple-50 text-purple-700 rounded-xl transition-all duration-200 font-medium shadow-sm flex items-center justify-center gap-2"
          >
            📚 生成图书封面
          </button>

          {/* Progress */}
          {exporting && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  width: '100%',
                  height: 8,
                  background: 'rgba(31, 31, 31, 0.06)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #B89B72, #8B7355)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
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
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={{ fontSize: 14, marginBottom: 12, color: '#B89B72' }}>
              📄 预览信息
            </h3>
            {selectedOutline ? (
              <div>
                <div
                  style={{
                    fontSize: 13,
                    padding: '8px 10px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    版本
                  </div>
                  <div style={{ fontWeight: 600 }}>{selectedOutline.version}</div>
                </div>

              <div
                style={{
                  fontSize: 13,
                  padding: '8px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
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
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  marginBottom: 12,
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                  格式
                </div>
                <div style={{ fontWeight: 600 }}>{exportFormat.toUpperCase()}</div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
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
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
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
                      color: 'var(--text-secondary)',
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
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  章节已附照片
                </div>
                {sectionPhotos.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>暂无照片附件</p>
                )}
                {sectionPhotos.map((sec, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{idx + 1}. {sec.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sec.count} 张</div>
                    </div>
                    {sec.count === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>尚未附加照片</div>
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
                              border: '1px solid var(--border)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            }}
                          />
                        ))}
                        {sec.count > 4 && (
                          <div
                            style={{
                            padding: '6px 10px',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            border: '1px dashed rgba(31, 31, 31, 0.12)',
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
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              请先选择大纲版本
            </p>
          )}
        </div>
      </div>

      {/* Edit Biography Lock Modal */}
      {showLockModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={() => setShowLockModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1a1f2e 0%, #0b1220 100%)',
              border: '2px solid rgba(139, 115, 85, 0.4)',
              borderRadius: 16,
              padding: 32,
              maxWidth: 400,
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              编辑传记内容 尚未解锁
            </h3>
            <p style={{
              margin: '0 0 24px',
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              完成 <strong style={{ color: '#8B7355' }}>{EDIT_BIO_UNLOCK_THRESHOLD}</strong> 道问题后即可解锁该功能
            </p>
            <div style={{
              background: 'rgba(139, 115, 85, 0.1)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: '#8B7355', marginBottom: 4 }}>当前进度</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                {answeredCount} / {EDIT_BIO_UNLOCK_THRESHOLD}
              </div>
              <div style={{
                height: 6,
                background: 'rgba(139, 115, 85, 0.2)',
                borderRadius: 3,
                marginTop: 8,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, (answeredCount / EDIT_BIO_UNLOCK_THRESHOLD) * 100)}%`,
                  background: 'linear-gradient(90deg, #8B7355, #A89070)',
                  borderRadius: 3,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
            <button
              onClick={() => setShowLockModal(false)}
              style={{
                padding: '12px 32px',
                fontSize: 14,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #8B7355 0%, #A89070 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              继续答题
            </button>
          </div>
        </div>
      )}

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
              borderBottom: '1px solid rgba(31, 31, 31, 0.12)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>
                📖 打印预览 - {templateConfig[template].icon} {templateConfig[template].name}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                版本 {selectedVersion} · {selectedOutline.outline_json?.sections?.length || 0} 章节
              </p>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              style={{
                padding: '8px 16px',
                background: 'rgba(31, 31, 31, 0.06)',
                border: '1px solid rgba(31, 31, 31, 0.12)',
                borderRadius: 6,
                color: 'var(--text-primary)',
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
                    <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {(() => {
                        const photos = chapterPhotosMap.get(0) || [];
                        if (photos.length > 0) {
                          return photos.slice(0, 3).map((photo, i) => (
                            <div key={i} style={{ textAlign: 'center' }}>
                              <img
                                src={photo.url}
                                alt={photo.caption || ''}
                                style={{
                                  width: 150,
                                  height: 110,
                                  objectFit: 'cover',
                                  borderRadius: 4,
                                  border: '1px solid #ddd',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                }}
                              />
                              {photo.caption && (
                                <p style={{ fontSize: 9, color: '#666', marginTop: 4, fontStyle: 'italic', maxWidth: 150 }}>
                                  {photo.caption}
                                </p>
                              )}
                            </div>
                          ));
                        }
                        return [1, 2].map((n) => (
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
                        ));
                      })()}
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
                        ? 'rgba(95, 111, 82, 0.1)'
                        : 'rgba(201, 160, 99, 0.1)',
                      border: `1px solid ${report.passed ? 'rgba(95, 111, 82, 0.3)' : 'rgba(201, 160, 99, 0.3)'}`,
                      borderRadius: 8,
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 600, color: report.passed ? '#5F6F52' : '#C9A063' }}>
                      {report.passed ? '✅ 可以提交印刷厂' : '⚠️  有建议优化项'}
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, marginBottom: 12, color: '#B89B72' }}>基本信息</h3>
                    <div style={{ background: 'var(--card)', padding: 12, borderRadius: 6, fontSize: 12 }}>
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
                      <h3 style={{ fontSize: 14, marginBottom: 12, color: '#C97A63' }}>❌ 错误</h3>
                      {report.errors.map((err, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(201, 122, 99, 0.1)',
                            border: '1px solid rgba(201, 122, 99, 0.3)',
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
                      <h3 style={{ fontSize: 14, marginBottom: 12, color: '#C9A063' }}>⚠️  建议优化</h3>
                      {report.warnings.map((warn, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: 'rgba(201, 160, 99, 0.1)',
                            border: '1px solid rgba(201, 160, 99, 0.3)',
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
                      background: 'rgba(139, 115, 85, 0.1)',
                      border: '1px solid rgba(139, 115, 85, 0.3)',
                      borderRadius: 6,
                      fontSize: 11,
                      color: 'var(--text-secondary)',
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
                        background: 'rgba(139, 115, 85, 0.2)',
                        border: '1px solid rgba(139, 115, 85, 0.4)',
                        borderRadius: 6,
                        color: '#B89B72',
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
                        background: 'linear-gradient(135deg, #5F6F52, #4A5D23)',
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
      {/* Manual Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 32,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📤</div>
            <h3 style={{ fontSize: 22, fontWeight: 700, color: '#333', marginBottom: 12 }}>
              保存到云端记录
            </h3>
            <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 }}>
              您刚才导出了 PDF，是否希望将其保存到云端？<br/>
              上传后，您可以在左侧的“查看过往导出”中随时找回。
            </p>
            
            <div style={{ marginBottom: 24 }}>
              <label 
                htmlFor="pdf-upload" 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed #ddd',
                  borderRadius: 8,
                  padding: 30,
                  cursor: 'pointer',
                  background: '#f9f9f9',
                  transition: 'all 0.2s',
                }}
                onDragOver={e => {
                   e.preventDefault();
                   e.currentTarget.style.background = '#f0f7ff';
                   e.currentTarget.style.borderColor = '#3498db';
                }}
                onDragLeave={e => {
                   e.preventDefault();
                   e.currentTarget.style.background = '#f9f9f9';
                   e.currentTarget.style.borderColor = '#ddd';
                }}
                onDrop={e => {
                   e.preventDefault();
                   e.currentTarget.style.background = '#f9f9f9';
                   e.currentTarget.style.borderColor = '#ddd';
                   const file = e.dataTransfer.files[0];
                   if (file && file.type === 'application/pdf') {
                     setUploadFile(file);
                   }
                }}
              >
                {uploadFile ? (
                   <div style={{ color: '#27ae60', fontWeight: 600 }}>
                     📄 {uploadFile.name}
                   </div>
                ) : (
                   <>
                     <span style={{ color: '#3498db', fontWeight: 600, marginBottom: 4 }}>点击选择 PDF 文件</span>
                     <span style={{ fontSize: 12, color: '#999' }}>或将文件拖放到此处</span>
                   </>
                )}
                <input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setUploadFile(file);
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowUploadModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f5f5f5',
                  border: 'none',
                  borderRadius: 8,
                  color: '#666',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                暂不保存
              </button>
              <button
                onClick={handleManualUpload}
                disabled={!uploadFile || isUploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: !uploadFile || isUploading ? '#ccc' : '#3498db',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: !uploadFile || isUploading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isUploading ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    上传中...
                  </>
                ) : (
                  '确认上传'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Screenshot Modal */}
      {showMapModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={() => setShowMapModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #F7F5F2 0%, #FFFCF8 100%)',
              borderRadius: 16,
              padding: 24,
              width: '90%',
              maxWidth: 900,
              maxHeight: '85vh',
              overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 20,
            }}>
              <div>
                <h2 style={{ 
                  margin: 0, 
                  fontSize: 22, 
                  color: '#2C2C2C',
                  fontWeight: 700,
                }}>
                  🗺️ 截取足迹地图
                </h2>
                <p style={{ 
                  margin: '6px 0 0', 
                  fontSize: 13, 
                  color: '#666' 
                }}>
                  选择合适的视图，截取地图添加到书籍中
                </p>
              </div>
              <button
                onClick={() => setShowMapModal(false)}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(0, 0, 0, 0.05)',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  borderRadius: 8,
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                关闭
              </button>
            </div>

            {loadingMapPlaces ? (
              <div style={{
                height: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    border: '3px solid #E8E4DE',
                    borderTopColor: '#5F6F52',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 12px',
                  }} />
                  <p style={{ color: '#666', fontSize: 14 }}>加载地点数据...</p>
                </div>
              </div>
            ) : (
              <>
                <div 
                  ref={mapContainerRef}
                  style={{
                    width: '100%',
                    height: 450,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: '1px solid #E8E4DE',
                    background: '#fff',
                  }}
                >
                  <PlacesMap
                    places={mapPlaces}
                    onPlaceClick={() => {}}
                  />
                </div>

                <div style={{ 
                  marginTop: 16,
                  padding: 16,
                  background: 'rgba(95, 111, 82, 0.08)',
                  borderRadius: 10,
                  border: '1px solid rgba(95, 111, 82, 0.15)',
                }}>
                  <div style={{ 
                    fontSize: 12, 
                    color: '#5F6F52', 
                    marginBottom: 8,
                    fontWeight: 500,
                  }}>
                    💡 使用提示
                  </div>
                  <ul style={{ 
                    margin: 0, 
                    paddingLeft: 18, 
                    fontSize: 12, 
                    color: '#666',
                    lineHeight: 1.8,
                  }}>
                    <li>使用右上角按钮切换不同视图（美国、世界、中国）</li>
                    <li>调整到满意的视图后，点击下方按钮截取</li>
                    <li>截取的地图将作为书籍中的一页</li>
                  </ul>
                </div>

                <div style={{ 
                  marginTop: 16, 
                  display: 'flex', 
                  gap: 12,
                  justifyContent: 'flex-end',
                }}>
                  <Link
                    href="/places"
                    target="_blank"
                    style={{
                      padding: '12px 20px',
                      background: 'transparent',
                      border: '1px solid #E8E4DE',
                      borderRadius: 10,
                      color: '#666',
                      fontSize: 14,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    ↗ 在新窗口编辑地点
                  </Link>
                  <button
                    onClick={captureMapScreenshot}
                    disabled={capturingMap}
                    style={{
                      padding: '12px 28px',
                      background: capturingMap 
                        ? '#ccc' 
                        : 'linear-gradient(135deg, #5F6F52 0%, #7A8B6D 100%)',
                      border: 'none',
                      borderRadius: 10,
                      color: 'white',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: capturingMap ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: capturingMap ? 'none' : '0 4px 12px rgba(95, 111, 82, 0.3)',
                    }}
                  >
                    {capturingMap ? (
                      <>
                        <span style={{ 
                          display: 'inline-block',
                          animation: 'spin 1s linear infinite',
                        }}>⏳</span>
                        截取中...
                      </>
                    ) : (
                      <>📸 截取当前视图</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Book Cover Generator Modal */}
      <BookCoverGenerator
        isOpen={showCoverGenerator}
        onClose={() => setShowCoverGenerator(false)}
        bookTitle={bookTitle}
        authorName={authorName}
        projectId={projectId}
      />
        </div>
      </div>
    </>
  );
}
