'use client';

import { useState, useEffect, useRef } from 'react';
import { uploadPhoto, validatePhotoFile } from '@/lib/photoUpload';
import { createPhoto } from '@/lib/photosApi';
import { getQuestions, type Question } from '@/lib/questionsApi';
import { getPeople } from '@/lib/knowledgeGraphApi';
import type { Person, PlaceWithRelations } from '@/lib/types/knowledge-graph';

interface PlaceUploadModalProps {
  place: PlaceWithRelations;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PlaceUploadModal({
  place,
  projectId,
  onClose,
  onSuccess,
}: PlaceUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Metadata state
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([]);
  const [timeText, setTimeText] = useState<string>('');
  const [caption, setCaption] = useState<string>('');

  // Options
  const [questions, setQuestions] = useState<Question[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const [qs, ps] = await Promise.all([
          getQuestions(projectId),
          getPeople(projectId),
        ]);
        setQuestions(qs);
        setPeople(ps);
      } catch (e) {
        console.error('Failed to load options:', e);
      } finally {
        setLoadingOptions(false);
      }
    }
    loadOptions();
  }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const f = e.target.files[0];
      const validation = validatePhotoFile(f);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    }
  };

  const handleSubmit = async () => {
    if (!file || !projectId) return;
    if (!selectedQuestionId) {
      alert('请选择关联问题');
      return;
    }
    
    setIsUploading(true);
    try {
      // 1. Upload File
      const uploadResult = await uploadPhoto(file, projectId, {
        generateThumbnail: true,
        extractExif: true,
      });

      // 2. Create DB Record
      await createPhoto({
        ...uploadResult.photo,
        project_id: projectId,
        place_id: place.id,
        person_ids: selectedPeopleIds,
        taken_at: undefined, // TODO: Parse timeText if it's a date, or store in metadata/time_ref
        // The markdown says "Time (Time)" - but Photos table structure usually has taken_at (timestamp).
        // If we want fuzzy time, we might need to store it in a separate field or metadata.
        // For now, if timeText is a valid date, use it for taken_at.
        // Otherwise store in caption or metadata?
        // Let's assume we store it in metadata for fuzzy, and try to parse for taken_at.
        metadata: {
          ...uploadResult.photo.metadata,
          linked_question_id: selectedQuestionId,
          user_time_text: timeText,
          caption: caption
        },
        description: caption, // Map caption to description
      });

      alert('上传成功！');
      onSuccess();
      onClose();
    } catch (e: any) {
      console.error('Upload failed:', e);
      alert('上传失败: ' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  const togglePerson = (id: string) => {
    setSelectedPeopleIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">
            在 {place.name} 上传照片
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* File Input */}
          <div className="flex flex-col items-center justify-center">
            {previewUrl ? (
              <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                <button 
                  onClick={() => { setFile(null); setPreviewUrl(null); }}
                  className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="text-4xl mb-2">📷</div>
                <span className="text-gray-500">点击选择照片</span>
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Question */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                关联问题 <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedQuestionId}
                onChange={(e) => setSelectedQuestionId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                disabled={loadingOptions}
              >
                <option value="">-- 请选择 --</option>
                {questions.map(q => (
                  <option key={q.id} value={q.id}>{q.text}</option>
                ))}
              </select>
            </div>

            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                时间 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={timeText}
                onChange={(e) => setTimeText(e.target.value)}
                placeholder="例如: 2012年, 小学三年级"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Place (Readonly) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                地点
              </label>
              <input
                type="text"
                value={place.name}
                disabled
                className="w-full p-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-500"
              />
            </div>

            {/* Caption */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                一句话描述
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="这张照片讲的是什么事..."
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 h-20"
              />
            </div>

            {/* People */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                涉及人物
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {people.map(person => (
                  <button
                    key={person.id}
                    onClick={() => togglePerson(person.id)}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      selectedPeopleIds.includes(person.id)
                        ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {person.name}
                  </button>
                ))}
                {people.length === 0 && (
                  <span className="text-gray-400 text-sm">暂无人物可选</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            disabled={isUploading}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isUploading || !file || !selectedQuestionId}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                上传中...
              </>
            ) : (
              '确认上传'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
