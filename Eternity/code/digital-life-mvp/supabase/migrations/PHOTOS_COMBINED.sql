-- ====================================
-- Photos & Videos 完整迁移脚本
-- 包含：photos, albums, upload_reminders, photo_faces 表
-- 以及 Storage 配置
-- ====================================

-- ========== 第一部分：数据库表 ==========

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
  name TEXT NOT NULL,
  description TEXT,
  cover_photo_id UUID REFERENCES photos(id) ON DELETE SET NULL,
  
  -- 分类
  category TEXT DEFAULT 'custom',         -- custom/family/event/place/year
  
  -- 关联信息
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  year INTEGER,
  
  -- 统计
  photo_count INTEGER DEFAULT 0,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Album Photos 关联表
CREATE TABLE IF NOT EXISTS album_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  
  -- 排序
  sort_order INTEGER DEFAULT 0,
  
  -- 时间戳
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(album_id, photo_id)
);

-- 4. Upload Reminders 表
CREATE TABLE IF NOT EXISTS upload_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 提醒内容
  title TEXT NOT NULL,
  description TEXT,
  
  -- 分类
  category TEXT DEFAULT 'general',        -- childhood/youth/work/family/travel/general
  
  -- 时间范围
  start_year INTEGER,
  end_year INTEGER,
  
  -- 关联
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  person_ids UUID[] DEFAULT '{}',
  
  -- 状态
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  uploaded_photo_count INTEGER DEFAULT 0,
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Photo Faces 表（人脸识别结果）
CREATE TABLE IF NOT EXISTS photo_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  
  -- 人脸位置（归一化坐标 0-1）
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  width FLOAT NOT NULL,
  height FLOAT NOT NULL,
  
  -- 识别信息
  confidence FLOAT,                       -- 识别置信度 0-1
  is_verified BOOLEAN DEFAULT FALSE,      -- 用户确认
  
  -- 时间戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(photo_id, person_id)
);

-- ========== 索引 ==========

-- Photos 索引
CREATE INDEX IF NOT EXISTS idx_photos_project_id ON photos(project_id);
CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_at ON photos(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_photos_place_id ON photos(place_id);
CREATE INDEX IF NOT EXISTS idx_photos_event_id ON photos(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_is_sorted ON photos(is_sorted);
CREATE INDEX IF NOT EXISTS idx_photos_person_ids ON photos USING GIN(person_ids);
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags);

-- Albums 索引
CREATE INDEX IF NOT EXISTS idx_albums_project_id ON albums(project_id);
CREATE INDEX IF NOT EXISTS idx_albums_category ON albums(category);
CREATE INDEX IF NOT EXISTS idx_albums_event_id ON albums(event_id);
CREATE INDEX IF NOT EXISTS idx_albums_place_id ON albums(place_id);

-- Album Photos 索引
CREATE INDEX IF NOT EXISTS idx_album_photos_album_id ON album_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_photo_id ON album_photos(photo_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_sort ON album_photos(album_id, sort_order);

-- Upload Reminders 索引
CREATE INDEX IF NOT EXISTS idx_upload_reminders_project_id ON upload_reminders(project_id);
CREATE INDEX IF NOT EXISTS idx_upload_reminders_is_completed ON upload_reminders(is_completed);
CREATE INDEX IF NOT EXISTS idx_upload_reminders_category ON upload_reminders(category);

-- Photo Faces 索引
CREATE INDEX IF NOT EXISTS idx_photo_faces_photo_id ON photo_faces(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_faces_person_id ON photo_faces(person_id);

-- ========== RLS (Row Level Security) ==========

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_faces ENABLE ROW LEVEL SECURITY;

-- Photos RLS 策略
DROP POLICY IF EXISTS "Users can view their own photos" ON photos;
CREATE POLICY "Users can view their own photos" ON photos
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own photos" ON photos;
CREATE POLICY "Users can insert their own photos" ON photos
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own photos" ON photos;
CREATE POLICY "Users can update their own photos" ON photos
  FOR UPDATE USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own photos" ON photos;
CREATE POLICY "Users can delete their own photos" ON photos
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Albums RLS 策略
DROP POLICY IF EXISTS "Users can view their own albums" ON albums;
CREATE POLICY "Users can view their own albums" ON albums
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own albums" ON albums;
CREATE POLICY "Users can insert their own albums" ON albums
  FOR INSERT WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own albums" ON albums;
CREATE POLICY "Users can update their own albums" ON albums
  FOR UPDATE USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own albums" ON albums;
CREATE POLICY "Users can delete their own albums" ON albums
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Album Photos RLS 策略
DROP POLICY IF EXISTS "Users can view album photos" ON album_photos;
CREATE POLICY "Users can view album photos" ON album_photos
  FOR SELECT USING (
    album_id IN (
      SELECT id FROM albums WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage album photos" ON album_photos;
CREATE POLICY "Users can manage album photos" ON album_photos
  FOR ALL USING (
    album_id IN (
      SELECT id FROM albums WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

-- Upload Reminders RLS 策略
DROP POLICY IF EXISTS "Users can view their own reminders" ON upload_reminders;
CREATE POLICY "Users can view their own reminders" ON upload_reminders
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage their own reminders" ON upload_reminders;
CREATE POLICY "Users can manage their own reminders" ON upload_reminders
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Photo Faces RLS 策略
DROP POLICY IF EXISTS "Users can view faces in their photos" ON photo_faces;
CREATE POLICY "Users can view faces in their photos" ON photo_faces
  FOR SELECT USING (
    photo_id IN (
      SELECT id FROM photos WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage faces in their photos" ON photo_faces;
CREATE POLICY "Users can manage faces in their photos" ON photo_faces
  FOR ALL USING (
    photo_id IN (
      SELECT id FROM photos WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

-- ========== 触发器 ==========

-- 更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photos_updated_at ON photos;
CREATE TRIGGER update_photos_updated_at
  BEFORE UPDATE ON photos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_albums_updated_at ON albums;
CREATE TRIGGER update_albums_updated_at
  BEFORE UPDATE ON albums
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========== 视图 ==========

-- 未整理照片统计视图
CREATE OR REPLACE VIEW unsorted_photos_stats AS
SELECT 
  project_id,
  COUNT(*) as unsorted_count,
  MIN(uploaded_at) as oldest_upload,
  MAX(uploaded_at) as newest_upload
FROM photos
WHERE is_sorted = FALSE
GROUP BY project_id;

-- ========== 函数 ==========

-- 更新相册照片数量
CREATE OR REPLACE FUNCTION update_album_photo_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE albums SET photo_count = photo_count + 1 WHERE id = NEW.album_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE albums SET photo_count = photo_count - 1 WHERE id = OLD.album_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_album_count_on_photo_add ON album_photos;
CREATE TRIGGER update_album_count_on_photo_add
  AFTER INSERT OR DELETE ON album_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_album_photo_count();

-- ========== 完成 ==========
-- 数据库表创建完成！
-- 
-- 接下来需要在 Supabase Dashboard Storage 中手动创建 bucket：
-- 1. 访问：https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/storage/buckets
-- 2. 点击 "Create a new bucket"
-- 3. 名称：photos
-- 4. 勾选 "Public bucket"
-- 5. 设置：
--    - File size limit: 10 MB
--    - Allowed MIME types: image/jpeg, image/png, image/heic, image/heif
-- 6. 点击 "Create bucket"
