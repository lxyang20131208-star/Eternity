-- ====================================
-- People Extraction Enhancements for Family Page
-- ====================================

-- 1. 扩展 people 表，增加人物关系字段
ALTER TABLE people ADD COLUMN IF NOT EXISTS relationship_to_user TEXT; -- 与我的关系
ALTER TABLE people ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'confirmed', 'merged', 'rejected'));
ALTER TABLE people ADD COLUMN IF NOT EXISTS original_name TEXT; -- 修正前的原始名字
ALTER TABLE people ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3, 2) DEFAULT 0.5; -- AI抽取的置信度

-- 2. 人与人之间的关系表（支持手动连线）
CREATE TABLE IF NOT EXISTS people_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_a_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- 'parent', 'spouse', 'sibling', 'friend', 'colleague', 'custom'
  custom_label TEXT, -- 自定义关系描述
  bidirectional BOOLEAN DEFAULT TRUE, -- 是否双向关系
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_person_relationship UNIQUE (project_id, person_a_id, person_b_id, relationship_type)
);

-- 3. 人物抽取任务表（跟踪抽取进度）
CREATE TABLE IF NOT EXISTS people_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  source_type TEXT NOT NULL, -- 'all_transcripts', 'manual_trigger', 'scheduled'
  total_documents INTEGER DEFAULT 0,
  processed_documents INTEGER DEFAULT 0,
  extracted_count INTEGER DEFAULT 0, -- 新抽取的人物数量
  error_text TEXT,
  result_json JSONB DEFAULT '{}', -- 抽取结果摘要
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 人物-照片关联表（增强版，支持多来源）
CREATE TABLE IF NOT EXISTS people_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_source TEXT NOT NULL CHECK (photo_source IN ('home_upload', 'photos_page', 'manual_attach', 'auto_detected')),
  photo_caption TEXT, -- 照片描述/标题
  is_primary BOOLEAN DEFAULT FALSE, -- 是否为主照片（头像）
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 人名修正历史表（全局替换追踪）
CREATE TABLE IF NOT EXISTS people_name_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL,
  correction_scope TEXT NOT NULL CHECK (correction_scope IN ('person_only', 'global_transcripts', 'global_all')),
  affected_records JSONB DEFAULT '[]', -- 受影响的文档ID列表
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID REFERENCES auth.users(id)
);

-- ====================================
-- 索引优化
-- ====================================

-- People 新增索引
CREATE INDEX idx_people_extraction_status ON people(extraction_status);
CREATE INDEX idx_people_confidence ON people(confidence_score DESC);
CREATE INDEX idx_people_relationship ON people(relationship_to_user);

-- People Relationships 索引
CREATE INDEX idx_people_relationships_project ON people_relationships(project_id);
CREATE INDEX idx_people_relationships_person_a ON people_relationships(person_a_id);
CREATE INDEX idx_people_relationships_person_b ON people_relationships(person_b_id);
CREATE INDEX idx_people_relationships_type ON people_relationships(relationship_type);

-- People Extraction Jobs 索引
CREATE INDEX idx_people_extraction_jobs_project ON people_extraction_jobs(project_id);
CREATE INDEX idx_people_extraction_jobs_status ON people_extraction_jobs(status);
CREATE INDEX idx_people_extraction_jobs_created ON people_extraction_jobs(created_at DESC);

-- People Photos 索引
CREATE INDEX idx_people_photos_person ON people_photos(person_id);
CREATE INDEX idx_people_photos_source ON people_photos(photo_source);
CREATE INDEX idx_people_photos_primary ON people_photos(is_primary) WHERE is_primary = TRUE;

-- People Name Corrections 索引
CREATE INDEX idx_people_name_corrections_person ON people_name_corrections(person_id);
CREATE INDEX idx_people_name_corrections_project ON people_name_corrections(project_id);
CREATE INDEX idx_people_name_corrections_applied ON people_name_corrections(applied_at DESC);

-- ====================================
-- RLS 策略
-- ====================================

ALTER TABLE people_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_name_corrections ENABLE ROW LEVEL SECURITY;

-- People Relationships 策略
CREATE POLICY "Users can view people_relationships in their projects"
ON people_relationships FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert people_relationships in their projects"
ON people_relationships FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update people_relationships in their projects"
ON people_relationships FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete people_relationships in their projects"
ON people_relationships FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- People Extraction Jobs 策略
CREATE POLICY "Users can view extraction_jobs in their projects"
ON people_extraction_jobs FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert extraction_jobs in their projects"
ON people_extraction_jobs FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update extraction_jobs in their projects"
ON people_extraction_jobs FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- People Photos 策略
CREATE POLICY "Users can view people_photos through their projects"
ON people_photos FOR SELECT TO authenticated
USING (
  person_id IN (
    SELECT id FROM people WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can insert people_photos through their projects"
ON people_photos FOR INSERT TO authenticated
WITH CHECK (
  person_id IN (
    SELECT id FROM people WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update people_photos through their projects"
ON people_photos FOR UPDATE TO authenticated
USING (
  person_id IN (
    SELECT id FROM people WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete people_photos through their projects"
ON people_photos FOR DELETE TO authenticated
USING (
  person_id IN (
    SELECT id FROM people WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- People Name Corrections 策略
CREATE POLICY "Users can view name_corrections in their projects"
ON people_name_corrections FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert name_corrections in their projects"
ON people_name_corrections FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ====================================
-- 更新时间戳触发器
-- ====================================

CREATE TRIGGER update_people_relationships_updated_at BEFORE UPDATE ON people_relationships
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_people_extraction_jobs_updated_at BEFORE UPDATE ON people_extraction_jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
