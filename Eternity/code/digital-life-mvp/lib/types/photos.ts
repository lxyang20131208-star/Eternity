// ====================================
// Photos & Videos 系统类型定义
// ====================================

export interface Photo {
  id: string;
  project_id: string;
  
  // 文件信息
  url: string;
  thumb_url?: string;
  file_size?: number;
  width?: number;
  height?: number;
  format?: string;
  
  // 基本信息
  title?: string;
  description?: string;
  source: 'upload' | 'camera' | 'scan';
  
  // 时间信息
  taken_at?: string;
  uploaded_at: string;
  
  // 关联信息
  place_id?: string;
  event_id?: string;
  person_ids: string[];
  
  // 分类与标签
  tags: string[];
  is_sorted: boolean;
  
  // 元数据
  metadata: PhotoMetadata;
  
  // 时间戳
  created_at: string;
  updated_at: string;
}

export interface PhotoMetadata {
  // 5个核心必填字段（新增）
  linked_question_id?: string;        // 关联问题ID（必填）
  time_taken?: string;                // 照片拍摄时间（必填，ISO格式）
  time_precision?: 'exact' | 'year' | 'month' | 'range' | 'fuzzy';  // 时间精度（必填）
  place_id?: string;                  // 关联地点ID（必填）
  caption?: string;                   // 一句话描述（强烈建议）

  // 标注状态
  annotation_status?: 'incomplete' | 'complete' | 'needs_review';
  needs_annotation?: boolean;         // 是否需要补全标注

  exif?: {
    make?: string;           // 相机品牌
    model?: string;          // 相机型号
    dateTime?: string;       // EXIF日期
    gps?: {
      latitude?: number;
      longitude?: number;
      altitude?: number;
    };
    orientation?: number;
    iso?: number;
    fNumber?: number;
    exposureTime?: string;
    focalLength?: string;
  };
  originalName?: string;     // 原始文件名
  uploadSource?: string;     // 上传来源（web/mobile）
  [key: string]: any;
}

export interface Album {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  cover_photo_id?: string;
  is_smart: boolean;
  smart_rules?: SmartAlbumRules;
  photo_ids: string[];
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface SmartAlbumRules {
  person_ids?: string[];
  place_ids?: string[];
  date_range?: {
    start: string;
    end: string;
  };
  tags?: string[];
  source?: 'upload' | 'camera' | 'scan';
}

export interface AlbumPhoto {
  album_id: string;
  photo_id: string;
  added_at: string;
  display_order: number;
}

export interface UploadReminder {
  id: string;
  project_id: string;
  user_id: string;
  reminder_type: 'welcome' | 'inactive' | 'contextual';
  status: 'pending' | 'snoozed' | 'dismissed' | 'completed';
  snooze_until?: string;
  context_type?: string;
  context_id?: string;
  message?: string;
  metadata: Record<string, any>;
  triggered_at: string;
  completed_at?: string;
  created_at: string;
}

export interface PhotoFace {
  id: string;
  photo_id: string;
  person_id?: string;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  confidence: number;
  is_confirmed: boolean;
  face_encoding?: any;
  created_at: string;
}

// ====================================
// 扩展类型（带关联数据）
// ====================================

export interface PhotoWithRelations extends Photo {
  place?: any;              // Place 类型
  event?: any;              // Event 类型
  people?: any[];           // Person[] 类型
  faces?: PhotoFace[];
  albums?: Album[];
}

export interface AlbumWithPhotos extends Album {
  photos?: Photo[];
  cover_photo?: Photo;
}

// ====================================
// 上传相关类型
// ====================================

export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number;         // 0-100
  status: 'pending' | 'uploading' | 'processing' | 'success' | 'error';
  error?: string;
  photoId?: string;
  thumbUrl?: string;
}

export interface UploadOptions {
  generateThumbnail?: boolean;
  extractExif?: boolean;
  maxWidth?: number;        // 原图最大宽度（压缩用）
  thumbWidth?: number;      // 缩略图宽度
  quality?: number;         // 压缩质量 0-1
}

export interface UploadResult {
  photo: Photo;
  thumbnail?: string;
  exif?: PhotoMetadata['exif'];
}

// ====================================
// 筛选和查询参数
// ====================================

export interface PhotoFilters {
  search?: string;          // 标题/描述搜索
  person_ids?: string[];
  place_ids?: string[];
  event_id?: string;
  tags?: string[];
  source?: 'upload' | 'camera' | 'scan';
  is_sorted?: boolean;
  date_range?: {
    start: string;
    end: string;
  };
  has_faces?: boolean;
  album_id?: string;
}

export interface PhotosQueryParams {
  filters?: PhotoFilters;
  sort?: 'taken_at' | 'uploaded_at' | 'title';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// ====================================
// Camera 拍摄相关
// ====================================

export interface CameraCapture {
  id: string;
  blob: Blob;
  dataUrl: string;
  timestamp: Date;
  deviceInfo?: {
    facingMode: 'user' | 'environment';
    width: number;
    height: number;
  };
}

export interface CameraConstraints {
  video: {
    facingMode?: 'user' | 'environment';
    width?: { ideal: number };
    height?: { ideal: number };
  };
}

// ====================================
// 统计类型
// ====================================

export interface PhotoStats {
  total: number;
  by_source: {
    upload: number;
    camera: number;
    scan: number;
  };
  by_month: Array<{
    month: string;
    count: number;
  }>;
  unsorted_count: number;
  total_size: number;       // bytes
}

export interface UnsortedStats {
  project_id: string;
  unsorted_count: number;
  total_count: number;
  without_person: number;
  without_place: number;
  last_upload?: string;
}

// ====================================
// 照片5字段标注系统（新增）
// ====================================

export interface PhotoUploadAnnotation {
  questionId: string;                 // 必填：关联问题
  peopleIds: string[];                // 必填：人物列表
  timeTaken: Date | null;             // 必填：拍摄时间
  timePrecision: 'exact' | 'year' | 'month' | 'range' | 'fuzzy';  // 必填：时间精度
  placeId: string | null;             // 必填：地点
  caption: string;                    // 强烈建议：一句话描述
}

export interface IncompletePhoto {
  id: string;
  user_id: string;
  project_id: string;
  url: string;
  caption?: string;
  created_at: string;
  missing_field: 'missing_question' | 'missing_people' | 'missing_time' | 'missing_place' | 'missing_caption' | 'complete';
  completion_percentage: number;      // 0-100
}

export interface PhotoAnnotationStats {
  project_id: string;
  total_photos: number;
  with_question: number;
  with_people: number;
  with_time: number;
  with_place: number;
  with_caption: number;
  complete_photos: number;
  incomplete_photos: number;
  completion_rate: number;            // 0-100
}

export interface PhotoAnnotationReminder {
  id: string;
  user_id: string;
  project_id: string;
  incomplete_count: number;
  reminder_type: 'gentle' | 'urgent';
  last_reminded_at?: string;
  is_dismissed: boolean;
  created_at: string;
  updated_at: string;
}
