'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import type { Photo, PhotoFilters, UnsortedStats } from '@/lib/types/photos';
import MasonryGallery from '@/components/MasonryGallery';
import UnifiedNav from '../components/UnifiedNav';

type Question = {
  id: string;
  text: string;
  chapter?: string;
};

type Place = {
  id: string;
  name: string;
  description?: string;
};

type Person = {
  id: string;
  name: string;
  relation?: string;
  avatar_url?: string;
};

type PhotoDetail = {
  id: string;
  url: string;
  file_name: string;
  linked_question_id: string | null;
  place_id: string | null;
  time_taken: string | null;
  caption: string | null;
  annotation_status: string | null;
  people_ids: string[];
};

export default function PhotosPage() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [stats, setStats] = useState<UnsortedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'unsorted'>('all');
  const [projectId, setProjectId] = useState('');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // Detail panel state
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [peopleRoster, setPeopleRoster] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);
  const [creatingPlace, setCreatingPlace] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRelation, setNewPersonRelation] = useState('');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    description?: string;
    people_count?: number;
    people_description?: string;
    location_type?: string;
    location_guess?: string;
    time_period?: string;
    occasion?: string;
    emotions?: string | string[];
    keywords?: string[];
  } | null>(null);
  const [aiMatchedQuestions, setAiMatchedQuestions] = useState<Array<{
    id: string;
    question_text: string;
    category?: string;
  }>>([]);
  const [aiSuggestedCaption, setAiSuggestedCaption] = useState<string>('');

  // Load photos on mount and when viewMode changes
  useEffect(() => {
    loadPhotos();
    loadStats();
    loadQuestionsAndPlaces();
    loadPeopleRoster();
  }, [viewMode]);

  // Paste-to-upload handler
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!showUploadModal) return;
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith('image/'));
      if (files.length) {
        handleUploadFiles(files);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [showUploadModal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedProjectId = localStorage.getItem('currentProjectId');
    if (storedProjectId) {
      setProjectId(storedProjectId);
    }
  }, []);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 2500);
  };

  const resolveProjectId = async () => {
    if (projectId) return projectId;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return '';

    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', session.user.id)
      .single();

    if (project?.id) {
      setProjectId(project.id);
      return project.id;
    }

    return '';
  };

  const loadQuestionsAndPlaces = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const resolvedProjectId = await resolveProjectId();

      // Load questions (排除 trial 问题)
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, text, chapter')
        .in('scope', ['global', 'user'])
        .order('chapter', { ascending: true });
      if (questionsData) setQuestions(questionsData);

      // Load places
      let placesQuery = supabase
        .from('places')
        .select('id, name, description')
        .order('name', { ascending: true });
      if (resolvedProjectId) {
        placesQuery = placesQuery.eq('project_id', resolvedProjectId);
      }
      const { data: placesData } = await placesQuery;
      if (placesData) setPlaces(placesData);
    } catch (e) {
      console.warn('Failed to load questions/places', e);
    }
  };

  const loadPeopleRoster = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: roster } = await supabase
        .from('people_roster')
        .select('id, name, relation, avatar_url')
        .eq('user_id', session.user.id)
        .order('name', { ascending: true });

      if (roster) setPeopleRoster(roster);
    } catch (e) {
      console.warn('Failed to load people roster', e);
    }
  };

  // Upload via presigned URL
  const uploadViaPresignedUrl = async (file: File): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('请先登录');
    }

    const urlResponse = await fetch('/api/photos/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type
      })
    });

    if (!urlResponse.ok) {
      throw new Error('获取上传链接失败');
    }

    const { uploadUrl, fileUrl } = await urlResponse.json();

    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        'x-upsert': 'false'
      }
    });

    return fileUrl;
  };

  // Handle file upload
  const handleUploadFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/')).slice(0, 10);
    if (!files.length) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('请先登录', 'error');
        return;
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        try {
          // Upload to storage
          const remoteUrl = await uploadViaPresignedUrl(file);
          const photoId = crypto.randomUUID();

          // Save to database with annotation_status = 'incomplete'
          const { error: saveError } = await supabase
            .from('photo_memories')
            .insert({
              id: photoId,
              user_id: session.user.id,
              file_name: file.name,
              photo_url: remoteUrl,
              annotation_status: 'incomplete'
            });

          if (saveError) {
            console.error('Failed to save photo:', saveError);
            showToast(`保存 ${file.name} 失败`, 'error');
          }
        } catch (err) {
          console.error('Upload error for', file.name, err);
          showToast(`上传 ${file.name} 失败`, 'error');
        }
      }

      showToast(`成功上传 ${files.length} 张照片`, 'success');
      setShowUploadModal(false);
      await loadPhotos();
      await loadStats();
    } catch (e: any) {
      showToast(e?.message || '上传失败', 'error');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setPhotos([]);
        setLoading(false);
        return;
      }

      // Query photo_memories directly by user_id
      let query = supabase
        .from('photo_memories')
        .select('*, photo_people(count)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      // Filter for unsorted if in unsorted view
      if (viewMode === 'unsorted') {
        query = query.neq('annotation_status', 'complete');
      }

      const { data: photosData, error } = await query;

      if (error) {
        console.error('Failed to load photos:', error);
        setPhotos([]);
        setLoading(false);
        return;
      }

      // Map database fields to Photo type
      const mappedPhotos: Photo[] = (photosData || []).map((p: any) => {
        const hasQuestion = !!p.linked_question_id;
        const hasTime = !!p.time_taken;
        const hasPlace = !!p.place_id;
        const hasCaption = !!(p.caption && p.caption.trim());
        const peopleCount = p.photo_people?.[0]?.count || 0;
        const hasPeople = peopleCount > 0;

        let completion_percentage = 0;
        if (hasQuestion) completion_percentage += 20;
        if (hasTime) completion_percentage += 20;
        if (hasPlace) completion_percentage += 20;
        if (hasCaption) completion_percentage += 20;
        if (hasPeople) completion_percentage += 20;

        return {
          id: p.id,
          project_id: projectId || '',
          url: p.photo_url,
          thumb_url: p.photo_url,
          title: p.file_name,
          description: p.caption,
          source: 'upload',
          taken_at: p.time_taken || p.created_at,
          uploaded_at: p.created_at,
          place_id: p.place_id,
          person_ids: [], // Will be loaded in detail view
          tags: [],
          is_sorted: p.annotation_status === 'complete',
          metadata: {
            linked_question_id: p.linked_question_id,
            time_taken: p.time_taken,
            time_precision: 'exact', // Default
            place_id: p.place_id,
            caption: p.caption,
            annotation_status: p.annotation_status,
            originalName: p.file_name,
            completion_percentage: completion_percentage
          },
          created_at: p.created_at,
          updated_at: p.created_at,
        };
      });

      setPhotos(mappedPhotos);
    } catch (error: any) {
      console.error('Failed to load photos:', error?.message ?? error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStats(null);
        return;
      }

      const { data: allPhotos, error } = await supabase
        .from('photo_memories')
        .select('id, annotation_status, linked_question_id, place_id')
        .eq('user_id', session.user.id);

      if (error || !allPhotos) {
        setStats(null);
        return;
      }

      const incomplete = allPhotos.filter(p => p.annotation_status !== 'complete');
      const withoutQuestion = allPhotos.filter(p => !p.linked_question_id);
      const withoutPlace = allPhotos.filter(p => !p.place_id);

      setStats({
        project_id: session.user.id, // Use user_id as project_id fallback or resolvedProjectId if available
        unsorted_count: incomplete.length,
        total_count: incomplete.length,
        without_person: withoutQuestion.length,
        without_place: withoutPlace.length,
      });
    } catch (error: any) {
      console.error('Failed to load stats:', error?.message ?? error);
      setStats(null);
    }
  };

  const handlePhotoClick = async (photo: Photo) => {
    // Load full photo details
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: photoData, error } = await supabase
        .from('photo_memories')
        .select('*')
        .eq('id', photo.id)
        .single();

      if (error || !photoData) {
        console.error('Failed to load photo details:', error);
        return;
      }

      // Load people associations
      const { data: photoPeople } = await supabase
        .from('photo_people')
        .select('person_id')
        .eq('photo_id', photo.id);

      setSelectedPhoto({
        id: photoData.id,
        url: photoData.photo_url,
        file_name: photoData.file_name,
        linked_question_id: photoData.linked_question_id,
        place_id: photoData.place_id,
        time_taken: photoData.time_taken ? photoData.time_taken.split('T')[0] : null,
        caption: photoData.caption,
        annotation_status: photoData.annotation_status,
        people_ids: photoPeople?.map(pp => pp.person_id) || [],
      });
    } catch (e) {
      console.error('Failed to load photo details:', e);
    }
  };

  const updatePhotoField = <K extends keyof PhotoDetail>(field: K, value: PhotoDetail[K]) => {
    if (!selectedPhoto) return;
    setSelectedPhoto(prev => prev ? { ...prev, [field]: value } : null);
  };

  const createPlace = async () => {
    if (!newPlaceName.trim()) return;
    setCreatingPlace(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('请先登录', 'error');
        return;
      }

      const resolvedProjectId = await resolveProjectId();
      if (!resolvedProjectId) {
        showToast('未找到项目', 'error');
        return;
      }

      const { data: newPlace, error } = await supabase
        .from('places')
        .insert({ name: newPlaceName.trim(), project_id: resolvedProjectId })
        .select()
        .single();

      if (error) throw error;
      if (newPlace) {
        setPlaces((prev) => [...prev, newPlace]);
        updatePhotoField('place_id', newPlace.id);
        setNewPlaceName('');
        showToast('地点已创建', 'success');
      }
    } catch (e: any) {
      showToast(e?.message || '创建地点失败', 'error');
    } finally {
      setCreatingPlace(false);
    }
  };

  const createPerson = async () => {
    if (!newPersonName.trim()) return;
    setCreatingPerson(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('请先登录', 'error');
        return;
      }

      const personId = crypto.randomUUID();
      const { data: newPerson, error } = await supabase
        .from('people_roster')
        .insert({
          id: personId,
          user_id: session.user.id,
          name: newPersonName.trim(),
          relation: newPersonRelation.trim() || null
        })
        .select()
        .single();

      if (error) throw error;
      if (newPerson) {
        setPeopleRoster((prev) => [...prev, newPerson]);
        // Also add to current photo
        if (selectedPhoto) {
          updatePhotoField('people_ids', [...selectedPhoto.people_ids, newPerson.id]);
        }
        setNewPersonName('');
        setNewPersonRelation('');
        showToast('人物已创建', 'success');
      }
    } catch (e: any) {
      showToast(e?.message || '创建人物失败', 'error');
    } finally {
      setCreatingPerson(false);
    }
  };

  const togglePersonInPhoto = (personId: string) => {
    if (!selectedPhoto) return;
    const isSelected = selectedPhoto.people_ids.includes(personId);
    if (isSelected) {
      updatePhotoField('people_ids', selectedPhoto.people_ids.filter(id => id !== personId));
    } else {
      updatePhotoField('people_ids', [...selectedPhoto.people_ids, personId]);
    }
  };

  const savePhotoChanges = async () => {
    if (!selectedPhoto) return;
    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('请先登录', 'error');
        setSaving(false);
        return;
      }

      // Calculate annotation status
      const isComplete =
        selectedPhoto.linked_question_id &&
        selectedPhoto.people_ids.length > 0 &&
        selectedPhoto.time_taken &&
        selectedPhoto.place_id &&
        selectedPhoto.caption?.trim();

      const { error } = await supabase
        .from('photo_memories')
        .update({
          linked_question_id: selectedPhoto.linked_question_id,
          place_id: selectedPhoto.place_id,
          time_taken: selectedPhoto.time_taken ? new Date(selectedPhoto.time_taken).toISOString() : null,
          caption: selectedPhoto.caption,
          annotation_status: isComplete ? 'complete' : 'incomplete',
        })
        .eq('id', selectedPhoto.id);

      if (error) {
        console.error('Failed to save photo:', error);
        showToast('保存失败: ' + error.message, 'error');
        setSaving(false);
        return;
      }

      // Update photo_people associations
      // First delete existing associations
      await supabase
        .from('photo_people')
        .delete()
        .eq('photo_id', selectedPhoto.id);

      // Then insert new associations
      if (selectedPhoto.people_ids.length > 0) {
        const peopleInserts = selectedPhoto.people_ids.map(personId => ({
          photo_id: selectedPhoto.id,
          person_id: personId,
          is_unknown: false
        }));

        const { error: peopleError } = await supabase
          .from('photo_people')
          .insert(peopleInserts);

        if (peopleError) {
          console.error('Failed to save photo people:', peopleError);
          // Don't fail the whole save, just log it
        }
      }

      showToast('保存成功', 'success');

      // Reload photos to reflect changes
      await loadPhotos();
      await loadStats();

      // Update the selected photo's annotation status
      setSelectedPhoto(prev => prev ? { ...prev, annotation_status: isComplete ? 'complete' : 'incomplete' } : null);
    } catch (e: any) {
      console.error('Failed to save photo:', e);
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // AI Analysis function
  const analyzePhoto = async () => {
    if (!selectedPhoto) return;
    
    setIsAnalyzing(true);
    setAiAnalysis(null);
    setAiMatchedQuestions([]);
    setAiSuggestedCaption('');

    try {
      // 获取用户 token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('请先登录', 'error');
        setIsAnalyzing(false);
        return;
      }

      // 使用 FormData 发送请求
      const formData = new FormData();
      formData.append('imageUrl', selectedPhoto.url);

      const response = await fetch('/api/photos/analyze', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '分析失败');
      }

      const result = await response.json();
      
      if (result.analysis) {
        setAiAnalysis(result.analysis);
        
        // 自动填充照片描述
        if (result.suggestedCaption && !selectedPhoto.caption) {
          updatePhotoField('caption', result.suggestedCaption);
        }
        
        // 自动匹配或创建地点
        if (result.analysis.location_guess && !selectedPhoto.place_id) {
          const locationGuess = result.analysis.location_guess;
          // 尝试找到匹配的地点
          const matchedPlace = places.find(p => 
            p.name.toLowerCase().includes(locationGuess.toLowerCase()) ||
            locationGuess.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matchedPlace) {
            updatePhotoField('place_id', matchedPlace.id);
          } else {
            // 自动创建新地点
            setNewPlaceName(locationGuess);
          }
        }
      }
      
      if (result.matchedQuestions && result.matchedQuestions.length > 0) {
        setAiMatchedQuestions(result.matchedQuestions);
        // 自动选择第一个推荐的问题
        if (!selectedPhoto.linked_question_id) {
          updatePhotoField('linked_question_id', result.matchedQuestions[0].id);
        }
      }
      
      if (result.suggestedCaption) {
        setAiSuggestedCaption(result.suggestedCaption);
      }

      showToast('AI 分析完成，已自动填充标签', 'success');
    } catch (error) {
      console.error('AI analysis error:', error);
      showToast('AI 分析失败，请重试', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Reset AI state when photo changes
  useEffect(() => {
    setAiAnalysis(null);
    setAiMatchedQuestions([]);
    setAiSuggestedCaption('');
  }, [selectedPhoto?.id]);

  // Group questions by category
  const questionsByCategory = useMemo(() => {
    const grouped: Record<string, Question[]> = {};
    questions.forEach(q => {
      const cat = q.chapter || '其他';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(q);
    });
    return grouped;
  }, [questions]);

  // Calculate missing fields for selected photo
  const missingFields = useMemo(() => {
    if (!selectedPhoto) return [];
    const missing: string[] = [];
    if (!selectedPhoto.linked_question_id) missing.push('question');
    if (!selectedPhoto.people_ids.length) missing.push('people');
    if (!selectedPhoto.time_taken) missing.push('time');
    if (!selectedPhoto.place_id) missing.push('place');
    if (!selectedPhoto.caption?.trim()) missing.push('caption');
    return missing;
  }, [selectedPhoto]);

  return (
    <div 
      className="min-h-screen bg-[#F7F5F2]"
      style={{ padding: '24px 16px', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <UnifiedNav />
      
        {/* Toast */}
        {toast && (
          <div className={`fixed top-24 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${
            toast.type === 'success'
              ? 'bg-[#E8F5E9] border border-[#C8E6C9] text-[#2E7D32]'
              : 'bg-[#FFEBEE] border border-[#FFCDD2] text-[#C62828]'
          }`}>
            {toast.text}
          </div>
        )}

        {/* Page Content Container */}
        <div>
          {/* Action Bar */}
          <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C2C2C]">
                照片
              </h1>
              <p className="text-[#666666] mt-1">
                {photos.length > 0 ? `${photos.length} 张照片` : '记录美好瞬间'}
              </p>
              <p className="text-[#8B7355] text-sm mt-2 leading-relaxed max-w-xl">
                💡 上传家人的老照片，让AI帮你分析照片中的人物、地点和故事，自动关联到传记章节中
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View mode toggle */}
              <div className="flex gap-1 bg-[#E5E5E0] rounded-lg p-1">
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    viewMode === 'all'
                      ? 'bg-white text-[#2C2C2C] shadow-sm'
                      : 'text-[#666666] hover:text-[#2C2C2C]'
                  }`}
                >
                  全部照片
                </button>
                <button
                  onClick={() => setViewMode('unsorted')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 relative ${
                    viewMode === 'unsorted'
                      ? 'bg-white text-[#2C2C2C] shadow-sm'
                      : 'text-[#666666] hover:text-[#2C2C2C]'
                  }`}
                >
                  待整理
                  {stats && stats.total_count > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 bg-[#D32F2F] text-white text-xs rounded-full font-semibold">
                      {stats.total_count}
                    </span>
                  )}
                </button>
              </div>

              {/* Upload button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="group px-5 py-2.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium flex items-center gap-2 shadow-sm"
              >
                <svg className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                上传照片
              </button>
            </div>
          </div>
        </div>

        {/* Unsorted banner */}
        {viewMode === 'all' && stats && stats.total_count > 0 && (
          <div className="bg-[#FFF8E1] border-b border-[#FFECB3]">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FFB74D] flex items-center justify-center shadow-sm">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#F57C00]">
                      有 <strong>{stats.total_count}</strong> 张照片待整理
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewMode('unsorted')}
                  className="text-sm font-medium text-[#E65100] hover:text-[#EF6C00] flex items-center gap-1 group"
                >
                  去整理
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="max-w-7xl mx-auto pb-10">
        {loading ? (
          <div className="flex gap-3 px-2">
            {[...Array(5)].map((_, colIndex) => (
              <div key={colIndex} className="flex-1 flex flex-col gap-3">
                {[...Array(4)].map((_, i) => {
                  const heights = ['h-48', 'h-64', 'h-52', 'h-72', 'h-56'];
                  return (
                    <div
                      key={i}
                      className={`${heights[(colIndex + i) % heights.length]} bg-[#E5E5E0] rounded-lg animate-pulse`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 px-4">
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-3xl bg-[#EFEBE9] flex items-center justify-center mb-6 mx-auto">
                <svg className="w-16 h-16 text-[#8D6E63]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-semibold text-[#2C2C2C] mb-2">
              {viewMode === 'unsorted' ? '没有待整理的照片' : '还没有照片'}
            </h3>
            <p className="text-[#666666] mb-8 max-w-md mx-auto">
              {viewMode === 'unsorted'
                ? '太棒了！所有照片都已整理完毕'
                : '上传你的第一张照片，开始记录生活中的美好瞬间'}
            </p>
            {viewMode === 'all' && (
              <button
                onClick={() => setShowUploadModal(true)}
                className="group px-8 py-3.5 bg-[#2C2C2C] hover:bg-[#404040] text-white rounded-xl transition-all duration-200 font-medium inline-flex items-center gap-2 shadow-sm"
              >
                <svg className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                上传照片
              </button>
            )}
          </div>
        ) : (
          <MasonryGallery photos={photos} onPhotoClick={handlePhotoClick} />
        )}
      </main>
      </div>
    </div>

      {/* Photo Detail Panel */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedPhoto(null)}
          />

          {/* Panel */}
          <div className="relative ml-auto w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right">
            {/* Close button */}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Image */}
            <div className="relative bg-gray-900">
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.caption || selectedPhoto.file_name}
                className="w-full max-h-[50vh] object-contain"
              />
              {/* Completion badge */}
              <div className={`absolute bottom-4 left-4 px-3 py-1.5 rounded-full text-sm font-medium ${
                missingFields.length === 0
                  ? 'bg-green-500/90 text-white'
                  : 'bg-orange-500/90 text-white'
              }`}>
                {missingFields.length === 0 ? '标注完成' : `缺少 ${missingFields.length} 项`}
              </div>
            </div>

            {/* Form */}
            <div className="p-6 space-y-6">
              <h2 className="text-xl font-bold text-gray-900">{selectedPhoto.caption || '未命名照片'}</h2>

              {/* 1. Question Link */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  关联问题
                  {missingFields.includes('question') && (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      未标记
                    </span>
                  )}
                </label>

                {/* AI Analysis Button */}
                <button
                  onClick={analyzePhoto}
                  disabled={isAnalyzing}
                  className="w-full mb-3 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      AI 分析中...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI 智能分析
                    </>
                  )}
                </button>

                {/* AI Analysis Results */}
                {aiAnalysis && (
                  <div className="mb-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
                    <h4 className="text-sm font-medium text-purple-800 mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      AI 分析结果
                    </h4>
                    <div className="space-y-1 text-xs text-purple-700">
                      {aiAnalysis.people_description && (
                        <p><span className="font-medium">人物:</span> {aiAnalysis.people_description}</p>
                      )}
                      {aiAnalysis.location_guess && (
                        <p><span className="font-medium">地点:</span> {aiAnalysis.location_guess}</p>
                      )}
                      {aiAnalysis.time_period && (
                        <p><span className="font-medium">时期:</span> {aiAnalysis.time_period}</p>
                      )}
                      {aiAnalysis.occasion && (
                        <p><span className="font-medium">场合:</span> {aiAnalysis.occasion}</p>
                      )}
                      {aiAnalysis.emotions && (
                        <p><span className="font-medium">情感:</span> {Array.isArray(aiAnalysis.emotions) ? aiAnalysis.emotions.join(', ') : aiAnalysis.emotions}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* AI Recommended Questions */}
                {aiMatchedQuestions.length > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <h4 className="text-sm font-medium text-indigo-800 mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      AI 推荐问题（点击选择）
                    </h4>
                    <div className="space-y-2">
                      {aiMatchedQuestions.slice(0, 5).map((mq, idx) => (
                        <button
                          key={mq.id}
                          onClick={() => updatePhotoField('linked_question_id', mq.id)}
                          className={`w-full text-left p-2 rounded-lg text-xs transition-all ${
                            selectedPhoto.linked_question_id === mq.id
                              ? 'bg-indigo-200 border-indigo-400'
                              : 'bg-white hover:bg-indigo-100 border-indigo-100'
                          } border`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-500 text-white text-xs flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-indigo-900 truncate">{mq.question_text}</p>
                              {mq.category && (
                                <p className="text-indigo-600 mt-0.5">{mq.category}</p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Suggested Caption */}
                {aiSuggestedCaption && (
                  <div className="mb-3 p-3 rounded-xl bg-green-50 border border-green-200">
                    <h4 className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      AI 建议描述
                    </h4>
                    <p className="text-xs text-green-700 mb-2">{aiSuggestedCaption}</p>
                    <button
                      onClick={() => updatePhotoField('caption', aiSuggestedCaption)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
                    >
                      使用此描述
                    </button>
                  </div>
                )}

                <select
                  value={selectedPhoto.linked_question_id || ''}
                  onChange={(e) => updatePhotoField('linked_question_id', e.target.value || null)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    missingFields.includes('question') ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                >
                  <option value="">选择问题...</option>
                  {Object.entries(questionsByCategory).map(([category, qs]) => (
                    <optgroup key={category} label={category}>
                      {qs.map(q => (
                        <option key={q.id} value={q.id}>{q.text}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 2. People - interactive chips */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  标记人物
                  {missingFields.includes('people') && (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      未标记
                    </span>
                  )}
                </label>

                {/* Selected people */}
                {selectedPhoto.people_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedPhoto.people_ids.map(personId => {
                      const person = peopleRoster.find(p => p.id === personId);
                      return (
                        <button
                          key={personId}
                          onClick={() => togglePersonInPhoto(personId)}
                          className="px-3 py-1.5 rounded-full text-sm bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] text-[#2C2C2C] border border-[#d4c4a8] flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                        >
                          {person?.name || '未知'}
                          {person?.relation && <span className="text-xs opacity-70">({person.relation})</span>}
                          <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Available people to add */}
                <div className={`rounded-xl border ${
                  missingFields.includes('people') ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'
                } p-3`}>
                  <div className="text-xs text-gray-500 mb-2">点击添加人物</div>
                  <div className="flex flex-wrap gap-2">
                    {peopleRoster
                      .filter(p => !selectedPhoto.people_ids.includes(p.id))
                      .map(person => (
                        <button
                          key={person.id}
                          onClick={() => togglePersonInPhoto(person.id)}
                          className="px-3 py-1.5 rounded-full text-sm bg-white border border-gray-200 text-gray-700 hover:border-[#d4c4a8] hover:bg-[#faf8f5] transition-all"
                        >
                          {person.name}
                          {person.relation && <span className="text-xs opacity-60 ml-1">({person.relation})</span>}
                        </button>
                      ))}
                    {peopleRoster.filter(p => !selectedPhoto.people_ids.includes(p.id)).length === 0 && selectedPhoto.people_ids.length > 0 && (
                      <span className="text-xs text-gray-400">所有人物已添加</span>
                    )}
                    {peopleRoster.length === 0 && (
                      <span className="text-xs text-gray-400">暂无人物，请先创建</span>
                    )}
                  </div>
                </div>

                {/* Quick add new person */}
                <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="text-xs text-gray-500 mb-2">快速创建新人物</div>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      value={newPersonName}
                      onChange={(e) => setNewPersonName(e.target.value)}
                      placeholder="姓名"
                      className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={newPersonRelation}
                      onChange={(e) => setNewPersonRelation(e.target.value)}
                      placeholder="关系（可选）"
                      className="flex-1 min-w-[100px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={createPerson}
                      disabled={creatingPerson || !newPersonName.trim()}
                      className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {creatingPerson ? '...' : '添加'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Time Taken */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  拍摄时间
                  {missingFields.includes('time') && (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      未标记
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={selectedPhoto.time_taken || ''}
                  onChange={(e) => updatePhotoField('time_taken', e.target.value || null)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    missingFields.includes('time') ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                />
              </div>

              {/* 4. Place */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  拍摄地点
                  {missingFields.includes('place') && (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      未标记
                    </span>
                  )}
                </label>
                <select
                  value={selectedPhoto.place_id || ''}
                  onChange={(e) => updatePhotoField('place_id', e.target.value || null)}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    missingFields.includes('place') ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all`}
                >
                  <option value="">选择地点...</option>
                  {places.map(place => (
                    <option key={place.id} value={place.id}>{place.name}</option>
                  ))}
                </select>
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    type="text"
                    value={newPlaceName}
                    onChange={(e) => setNewPlaceName(e.target.value)}
                    placeholder="或输入新地点名称..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={createPlace}
                    disabled={creatingPlace || !newPlaceName.trim()}
                    className="self-start px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingPlace ? '创建中...' : '创建并选择'}
                  </button>
                </div>
              </div>

              {/* 5. Caption */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  照片描述
                  {missingFields.includes('caption') && (
                    <span className="text-red-500 text-xs flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      未标记
                    </span>
                  )}
                </label>
                <textarea
                  value={selectedPhoto.caption || ''}
                  onChange={(e) => updatePhotoField('caption', e.target.value || null)}
                  placeholder="描述这张照片的内容、故事或情感..."
                  rows={4}
                  className={`w-full px-4 py-3 rounded-xl border ${
                    missingFields.includes('caption') ? 'border-red-300 bg-red-50' : 'border-gray-200'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none`}
                />
              </div>

              {/* Save button */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="flex-1 px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={savePhotoChanges}
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] hover:from-[#efd2a8] hover:to-[#efe0d6] text-[#2C2C2C] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !uploading && setShowUploadModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">上传照片</h3>
              <button
                onClick={() => !uploading && setShowUploadModal(false)}
                disabled={uploading}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {uploading ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#8B7355] animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                  <p className="text-gray-900 font-medium">
                    正在上传 {uploadProgress?.current}/{uploadProgress?.total}...
                  </p>
                  <p className="text-gray-500 text-sm mt-1">请稍候，不要关闭窗口</p>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#d4c4a8] hover:bg-[#faf8f5] transition-all"
                  onClick={() => uploadInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('border-[#d4c4a8]', 'bg-[#faf8f5]');
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-[#d4c4a8]', 'bg-[#faf8f5]');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-[#d4c4a8]', 'bg-[#faf8f5]');
                    handleUploadFiles(e.dataTransfer.files);
                  }}
                >
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
                  />
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-r from-[#f5d9b8] to-[#efe6dd] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#8B7355]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-900 font-medium mb-1">拖拽照片到这里，或点击选择</p>
                  <p className="text-gray-500 text-sm">支持 JPG、PNG 等格式，最多 10 张</p>
                  <p className="text-gray-400 text-xs mt-2">也可以直接粘贴 (Ctrl+V / Cmd+V)</p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                上传后照片将显示为「待整理」状态，点击照片可完成标注
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
