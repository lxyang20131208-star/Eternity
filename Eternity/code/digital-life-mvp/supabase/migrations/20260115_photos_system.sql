-- ====================================
-- Photos & Videos 系统数据库表
-- 支持照片上传、相册管理、提醒系统
-- ====================================

-- 1. Photos 表（照片主表）
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 文件信息
  url TEXT NOT NULL,                      -- 原图URL（Supabase Storage）
  thumb_url TEXT,                         -- 缩略图URL（400px宽）
  file_size INTEGER,                      -- 文件大小（bytes）
  width INTEGER,                          -- 原图宽度
  height INTEGER,                         -- 原图高度
  format TEXT,                            -- 文件格式（jpg/png/heic）
  
  -- 基本信息
  title TEXT,                             -- 照片标题
  description TEXT,                       -- 描述
  source TEXT DEFAULT 'upload',           -- 来源：upload/camera/scan
  
  -- 时间信息
  taken_at TIMESTAMPTZ,                   -- 拍摄时间（EXIF或用户设置）
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),  -- 上传时间
  
  -- 关联信息
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  person_ids UUID[] DEFAULT '{}',         -- 关联人物ID数组
  
  -- 分类与标签
  tags TEXT[] DEFAULT '{}',               -- 标签数组
  is_sorted BOOLEAN DEFAULT FALSE,        -- 是否已整理
  
  -- 元数据
  metadata JSONB DEFAULT '{}',            -- EXIF数据、GPS等
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Albums 表（相册）
CREATE TABLE IF NOT EXISTS albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 基本信息
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  
  -- 相册类型
  is_smart BOOLEAN DEFAULT FALSE,         -- 是否智能相册
  smart_rules JSONB,                      -- 智能相册规则
  
  -- 照片列表（手动相册）
  photo_ids UUID[] DEFAULT '{}',
  
  -- 统计
  photo_count INTEGER DEFAULT 0,          -- 照片数量（缓存）
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Album_Photos 关联表（多对多）
CREATE TABLE IF NOT EXISTS album_photos (
  album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (album_id, photo_id)
);

-- 4. Upload_Reminders 表（上传提醒）
CREATE TABLE IF NOT EXISTS upload_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 提醒类型
  reminder_type TEXT NOT NULL,            -- welcome/inactive/contextual
  
  -- 状态管理
  status TEXT DEFAULT 'pending',          -- pending/snoozed/dismissed/completed
  snooze_until TIMESTAMPTZ,              -- 延期到何时
  
  -- 上下文信息
  context_type TEXT,                      -- 例如：person/event/place
  context_id UUID,                        -- 上下文对象ID
  
  -- 提醒内容
  message TEXT,                           -- 自定义提醒消息
  metadata JSONB DEFAULT '{}',
  
  -- 时间戳
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Photo_Faces 表（人脸识别，V2功能）
CREATE TABLE IF NOT EXISTS photo_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  
  -- 人脸位置（归一化坐标 0-1）
  bbox_x DECIMAL(5, 4),                   -- 边界框左上角X
  bbox_y DECIMAL(5, 4),                   -- 边界框左上角Y
  bbox_width DECIMAL(5, 4),               -- 宽度
  bbox_height DECIMAL(5, 4),              -- 高度
  
  -- 识别信息
  confidence DECIMAL(3, 2),               -- 置信度 0-1
  is_confirmed BOOLEAN DEFAULT FALSE,     -- 用户是否确认
  
  -- 特征向量（用于相似度匹配）
  face_encoding JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- 索引优化
-- ====================================

-- Photos 索引
CREATE INDEX idx_photos_project ON photos(project_id);
CREATE INDEX idx_photos_taken_at ON photos(taken_at DESC) WHERE taken_at IS NOT NULL;
CREATE INDEX idx_photos_uploaded_at ON photos(uploaded_at DESC);
CREATE INDEX idx_photos_is_sorted ON photos(is_sorted) WHERE is_sorted = FALSE;
CREATE INDEX idx_photos_place ON photos(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_photos_event ON photos(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_photos_person_ids ON photos USING GIN(person_ids);
CREATE INDEX idx_photos_tags ON photos USING GIN(tags);

-- Albums 索引
CREATE INDEX idx_albums_project ON albums(project_id);
CREATE INDEX idx_albums_is_smart ON albums(is_smart);

-- Upload_Reminders 索引
CREATE INDEX idx_reminders_user_status ON upload_reminders(user_id, status);
CREATE INDEX idx_reminders_snooze ON upload_reminders(snooze_until) WHERE status = 'snoozed';
CREATE INDEX idx_reminders_type ON upload_reminders(reminder_type);

-- Photo_Faces 索引
CREATE INDEX idx_faces_photo ON photo_faces(photo_id);
CREATE INDEX idx_faces_person ON photo_faces(person_id);
CREATE INDEX idx_faces_confirmed ON photo_faces(is_confirmed);

-- ====================================
-- RLS（行级安全策略）
-- ====================================

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_faces ENABLE ROW LEVEL SECURITY;

-- Photos 策略
CREATE POLICY "Users can view photos in their projects"
ON photos FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert photos in their projects"
ON photos FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update photos in their projects"
ON photos FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete photos in their projects"
ON photos FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Albums 策略
CREATE POLICY "Users can view albums in their projects"
ON albums FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert albums in their projects"
ON albums FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update albums in their projects"
ON albums FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete albums in their projects"
ON albums FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Album_Photos 策略
CREATE POLICY "Users can manage album_photos"
ON album_photos FOR ALL TO authenticated
USING (
  album_id IN (
    SELECT id FROM albums WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- Upload_Reminders 策略
CREATE POLICY "Users can view their reminders"
ON upload_reminders FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their reminders"
ON upload_reminders FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their reminders"
ON upload_reminders FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their reminders"
ON upload_reminders FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Photo_Faces 策略
CREATE POLICY "Users can manage faces in their photos"
ON photo_faces FOR ALL TO authenticated
USING (
  photo_id IN (
    SELECT id FROM photos WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ====================================
-- 触发器（自动更新时间戳）
-- ====================================

CREATE TRIGGER update_photos_updated_at BEFORE UPDATE ON photos
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_albums_updated_at BEFORE UPDATE ON albums
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- 函数：更新相册照片数量
-- ====================================

CREATE OR REPLACE FUNCTION update_album_photo_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE albums 
    SET photo_count = photo_count + 1 
    WHERE id = NEW.album_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE albums 
    SET photo_count = photo_count - 1 
    WHERE id = OLD.album_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_album_count_on_photo_change
AFTER INSERT OR DELETE ON album_photos
FOR EACH ROW EXECUTE FUNCTION update_album_photo_count();

-- ====================================
-- 视图：未整理照片统计
-- ====================================

CREATE OR REPLACE VIEW unsorted_photos_stats AS
SELECT 
  project_id,
  COUNT(*) as unsorted_count,
  MAX(uploaded_at) as last_upload
FROM photos
WHERE is_sorted = FALSE
GROUP BY project_id;

-- ====================================
-- 默认智能相册规则示例
-- ====================================

-- 插入说明注释
COMMENT ON COLUMN albums.smart_rules IS '智能相册规则示例：
{
  "person_ids": ["uuid1", "uuid2"],
  "place_ids": ["uuid3"],
  "date_range": {"start": "2020-01-01", "end": "2020-12-31"},
  "tags": ["童年", "家庭"],
  "source": "camera"
}';

COMMENT ON TABLE photos IS '照片主表 - 存储所有用户上传的照片和视频';
COMMENT ON TABLE albums IS '相册表 - 支持手动相册和智能相册';
COMMENT ON TABLE upload_reminders IS '上传提醒表 - 管理各类照片上传提醒';
COMMENT ON TABLE photo_faces IS '人脸识别表 - 存储照片中识别的人脸位置和特征（V2功能）';
