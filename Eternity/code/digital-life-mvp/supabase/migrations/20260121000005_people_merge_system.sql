-- ====================================
-- People Merge System
-- 人物合并功能的数据库支持
-- ====================================

-- 1. 创建人物合并日志表
CREATE TABLE IF NOT EXISTS people_merge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  primary_person_id UUID NOT NULL REFERENCES people(id),
  secondary_person_id UUID NOT NULL REFERENCES people(id),
  merged_by UUID REFERENCES auth.users(id),
  merged_at TIMESTAMPTZ DEFAULT NOW(),
  merge_strategy TEXT NOT NULL CHECK (merge_strategy IN ('keep_primary', 'keep_secondary', 'custom')),
  details JSONB DEFAULT '{}', -- {aliasCount, photoCount, relationshipCount, bioSource}
  rollback_data JSONB, -- 撤销所需的备份数据
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'undone')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_different_persons CHECK (primary_person_id != secondary_person_id)
);

-- 2. 为people表添加合并追踪字段
ALTER TABLE people ADD COLUMN IF NOT EXISTS merged_from_id UUID REFERENCES people(id);
ALTER TABLE people ADD COLUMN IF NOT EXISTS merged_from_ids UUID[] DEFAULT '{}';

-- 3. 为people_relationships表添加合并追踪字段
ALTER TABLE people_relationships ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
ALTER TABLE people_relationships ADD COLUMN IF NOT EXISTS merge_log_id UUID REFERENCES people_merge_logs(id);

-- ====================================
-- 索引优化
-- ====================================

CREATE INDEX idx_merge_logs_project ON people_merge_logs(project_id);
CREATE INDEX idx_merge_logs_primary ON people_merge_logs(primary_person_id);
CREATE INDEX idx_merge_logs_secondary ON people_merge_logs(secondary_person_id);
CREATE INDEX idx_merge_logs_status ON people_merge_logs(status);
CREATE INDEX idx_merge_logs_merged_at ON people_merge_logs(merged_at DESC);

CREATE INDEX idx_people_merged_from ON people(merged_from_id) WHERE merged_from_id IS NOT NULL;

-- ====================================
-- RLS 策略
-- ====================================

ALTER TABLE people_merge_logs ENABLE ROW LEVEL SECURITY;

-- 用户可以查看自己项目中的合并日志
CREATE POLICY "Users can view merge_logs in their projects"
ON people_merge_logs FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- 用户可以在自己的项目中创建合并日志
CREATE POLICY "Users can insert merge_logs in their projects"
ON people_merge_logs FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- 用户可以更新自己项目中的合并日志（用于撤销）
CREATE POLICY "Users can update merge_logs in their projects"
ON people_merge_logs FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- ====================================
-- 注释
-- ====================================

COMMENT ON TABLE people_merge_logs IS '人物合并操作的审计日志，支持撤销功能';
COMMENT ON COLUMN people_merge_logs.primary_person_id IS '保留的主人物ID';
COMMENT ON COLUMN people_merge_logs.secondary_person_id IS '被合并的次要人物ID（会被标记为merged）';
COMMENT ON COLUMN people_merge_logs.merge_strategy IS '合并策略：保留主人物信息、保留次要人物信息或自定义';
COMMENT ON COLUMN people_merge_logs.details IS '合并详情摘要（别名数量、照片数量、关系数量等）';
COMMENT ON COLUMN people_merge_logs.rollback_data IS '完整的次要人物数据备份，用于撤销合并';
COMMENT ON COLUMN people_merge_logs.status IS '合并状态：active（生效中）或undone（已撤销）';

COMMENT ON COLUMN people.merged_from_id IS '直接合并来源人物ID（最后一次合并）';
COMMENT ON COLUMN people.merged_from_ids IS '所有合并来源人物ID数组（历史记录）';

COMMENT ON COLUMN people_relationships.merged_at IS '关系记录被合并转移的时间';
COMMENT ON COLUMN people_relationships.merge_log_id IS '关联的合并日志ID';
