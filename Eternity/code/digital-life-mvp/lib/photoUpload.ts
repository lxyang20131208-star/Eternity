import { supabase } from './supabaseClient';
import type { UploadOptions, UploadResult, PhotoMetadata } from './types/photos';

// Use shared supabase client to avoid multiple GoTrueClient instances in browser

// ====================================
// 文件上传
// ====================================

export async function uploadPhoto(
  file: File,
  projectId: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const {
    generateThumbnail = true,
    extractExif = true,
    maxWidth = 1920,
    thumbWidth = 400,
    quality = 0.85,
  } = options;

  // 1. 生成唯一文件名
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${projectId}/${timestamp}_${randomStr}.${ext}`;
  const thumbFileName = `${projectId}/thumb_${timestamp}_${randomStr}.${ext}`;

  // 2. 压缩原图（如果需要）
  let processedFile = file;
  if (file.size > 2 * 1024 * 1024) { // 大于2MB
    processedFile = await compressImage(file, maxWidth, quality);
  }

  // 3. 上传原图
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('photos')
    .upload(fileName, processedFile, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // 4. 获取公开URL
  const { data: urlData } = supabase.storage
    .from('photos')
    .getPublicUrl(fileName);
  
  const url = urlData.publicUrl;

  // 5. 生成缩略图
  let thumbUrl: string | undefined;
  if (generateThumbnail) {
    try {
      const thumbnail = await generateThumbnailBlob(file, thumbWidth);
      const { data: thumbData } = await supabase.storage
        .from('photos')
        .upload(thumbFileName, thumbnail, {
          cacheControl: '3600',
          upsert: false,
        });

      if (thumbData) {
        const { data: thumbUrlData } = supabase.storage
          .from('photos')
          .getPublicUrl(thumbFileName);
        thumbUrl = thumbUrlData.publicUrl;
      }
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
    }
  }

  // 6. 提取EXIF数据
  let exif: PhotoMetadata['exif'] | undefined;
  if (extractExif) {
    try {
      exif = await extractExifData(file);
    } catch (error) {
      console.error('Failed to extract EXIF:', error);
    }
  }

  // 7. 获取图片尺寸
  const dimensions = await getImageDimensions(file);

  // 8. 创建Photo记录
  const photoData = {
    project_id: projectId,
    url,
    thumb_url: thumbUrl,
    file_size: file.size,
    width: dimensions.width,
    height: dimensions.height,
    format: ext,
    source: 'upload' as const,
    title: file.name.replace(/\.[^/.]+$/, ''), // 去掉扩展名
    taken_at: exif?.dateTime ? new Date(exif.dateTime).toISOString() : undefined,
    metadata: {
      exif,
      originalName: file.name,
      uploadSource: 'web',
    },
    person_ids: [],
    tags: [],
    is_sorted: false,
  };

  return {
    photo: photoData as any,
    thumbnail: thumbUrl,
    exif,
  };
}

// ====================================
// 图片压缩
// ====================================

export async function compressImage(
  file: File,
  maxWidth: number,
  quality: number
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // 计算缩放比例
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          file.type,
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ====================================
// 生成缩略图
// ====================================

export async function generateThumbnailBlob(
  file: File,
  maxWidth: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // 计算缩放比例（保持宽高比）
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // 高质量缩放
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create thumbnail blob'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ====================================
// 获取图片尺寸
// ====================================

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ====================================
// EXIF 数据提取（简化版）
// ====================================

export async function extractExifData(file: File): Promise<PhotoMetadata['exif']> {
  // 注意：完整的EXIF提取需要 exif-js 或 piexifjs 库
  // 这里提供一个简化版本
  
  // 基本实现：从文件修改时间获取日期
  const lastModified = new Date(file.lastModified);
  
  return {
    dateTime: lastModified.toISOString(),
    // 更多EXIF字段需要专门的库来提取
  };
}

// ====================================
// 批量上传
// ====================================

export async function uploadMultiplePhotos(
  files: File[],
  projectId: string,
  options: UploadOptions = {},
  onProgress?: (fileIndex: number, progress: number) => void
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      onProgress?.(i, 0);
      const result = await uploadPhoto(files[i], projectId, options);
      results.push(result);
      onProgress?.(i, 100);
    } catch (error) {
      console.error(`Failed to upload file ${files[i].name}:`, error);
      onProgress?.(i, -1); // -1 表示失败
    }
  }
  
  return results;
}

// ====================================
// 文件验证
// ====================================

export function validatePhotoFile(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
  
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: `文件太大，请选择小于 10MB 的照片（当前：${(file.size / 1024 / 1024).toFixed(2)}MB）`,
    };
  }
  
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: `不支持的文件格式，请上传 JPG、PNG 或 HEIC 格式的照片`,
    };
  }
  
  return { valid: true };
}

// ====================================
// 拖拽上传辅助函数
// ====================================

export function getFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  
  if (dataTransfer.items) {
    // 使用 DataTransferItemList 接口
    for (let i = 0; i < dataTransfer.items.length; i++) {
      if (dataTransfer.items[i].kind === 'file') {
        const file = dataTransfer.items[i].getAsFile();
        if (file) files.push(file);
      }
    }
  } else {
    // 使用 DataTransfer.files 接口
    for (let i = 0; i < dataTransfer.files.length; i++) {
      files.push(dataTransfer.files[i]);
    }
  }
  
  return files.filter(file => file.type.startsWith('image/'));
}
