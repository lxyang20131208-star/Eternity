'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  uploadPhoto,
  uploadMultiplePhotos,
  validatePhotoFile,
  getFilesFromDataTransfer,
} from '@/lib/photoUpload';
import { createPhoto } from '@/lib/photosApi';
import type { UploadResult } from '@/lib/types/photos';

interface UploadState {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  result?: UploadResult;
}

export default function PhotoUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState<string>(''); // TODO: 从用户session获取
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // 处理文件选择
  const handleFileSelect = useCallback((files: File[]) => {
    const validFiles = files.filter((file) => {
      const validation = validatePhotoFile(file);
      if (!validation.valid) {
        alert(validation.error);
        return false;
      }
      return true;
    });

    const newUploads: UploadState[] = validFiles.map((file) => ({
      file,
      status: 'pending',
      progress: 0,
    }));

    setUploads((prev) => [...prev, ...newUploads]);
  }, []);

  // 处理拖拽进入
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  // 处理拖拽悬停
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 处理文件放下
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = getFilesFromDataTransfer(e.dataTransfer);
    if (files.length > 0) {
      handleFileSelect(files);
    }
  }, [handleFileSelect]);

  // 开始上传
  const startUpload = async () => {
    if (!projectId) {
      alert('请先选择项目');
      return;
    }

    setIsUploading(true);

    for (let i = 0; i < uploads.length; i++) {
      if (uploads[i].status !== 'pending') continue;

      // 更新状态为上传中
      setUploads((prev) =>
        prev.map((upload, index) =>
          index === i ? { ...upload, status: 'uploading', progress: 0 } : upload
        )
      );

      try {
        // 上传文件
        const result = await uploadPhoto(uploads[i].file, projectId, {
          generateThumbnail: true,
          extractExif: true,
        });

        // 创建数据库记录
        const photo = await createPhoto(result.photo);

        // 更新状态为成功
        setUploads((prev) =>
          prev.map((upload, index) =>
            index === i
              ? { ...upload, status: 'success', progress: 100, result }
              : upload
          )
        );
      } catch (error) {
        console.error('Upload failed:', error);
        // 更新状态为失败
        setUploads((prev) =>
          prev.map((upload, index) =>
            index === i
              ? {
                  ...upload,
                  status: 'error',
                  error: error instanceof Error ? error.message : '上传失败',
                }
              : upload
          )
        );
      }
    }

    setIsUploading(false);
  };

  // 移除文件
  const removeUpload = (index: number) => {
    setUploads((prev) => prev.filter((_, i) => i !== index));
  };

  // 清空所有
  const clearAll = () => {
    setUploads([]);
  };

  // 完成并返回
  const handleComplete = () => {
    router.push('/photos');
  };

  const successCount = uploads.filter((u) => u.status === 'success').length;
  const failedCount = uploads.filter((u) => u.status === 'error').length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-gray-900">上传照片</h1>
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900"
          >
            取消
          </button>
        </div>

        {/* 拖拽区域 */}
        <div
          className={`
            relative border-2 border-dashed rounded-2xl p-12 mb-8 transition-all
            ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            }
          `}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              handleFileSelect(files);
            }}
          />

          <div className="text-center">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <p className="text-lg text-gray-700 mb-2">
              拖拽照片到这里，或者
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              选择文件
            </button>
            <p className="text-sm text-gray-500 mt-4">
              支持 JPG、PNG、HEIC 格式，单个文件最大 10MB
            </p>
          </div>
        </div>

        {/* 上传列表 */}
        {uploads.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                待上传照片 ({uploads.length})
              </h2>
              <button
                onClick={clearAll}
                className="text-sm text-red-600 hover:text-red-700"
                disabled={isUploading}
              >
                清空全部
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {uploads.map((upload, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  {/* 缩略图 */}
                  <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={URL.createObjectURL(upload.file)}
                      alt={upload.file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 文件信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {upload.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(upload.file.size / 1024 / 1024).toFixed(2)} MB
                    </p>

                    {/* 进度条 */}
                    {upload.status === 'uploading' && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all"
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 错误信息 */}
                    {upload.status === 'error' && (
                      <p className="text-xs text-red-600 mt-1">{upload.error}</p>
                    )}
                  </div>

                  {/* 状态图标 */}
                  <div className="flex-shrink-0">
                    {upload.status === 'pending' && (
                      <button
                        onClick={() => removeUpload(index)}
                        className="text-gray-400 hover:text-gray-600"
                        disabled={isUploading}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    )}
                    {upload.status === 'uploading' && (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                    )}
                    {upload.status === 'success' && (
                      <svg
                        className="w-5 h-5 text-green-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {upload.status === 'error' && (
                      <svg
                        className="w-5 h-5 text-red-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 上传统计 */}
            {(successCount > 0 || failedCount > 0) && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  成功：{successCount} 张 {failedCount > 0 && `| 失败：${failedCount} 张`}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 底部按钮 */}
        {uploads.length > 0 && (
          <div className="flex gap-4">
            {!isUploading && uploads.some((u) => u.status === 'pending') && (
              <button
                onClick={startUpload}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                开始上传
              </button>
            )}
            {successCount > 0 && !isUploading && (
              <button
                onClick={handleComplete}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                完成
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
