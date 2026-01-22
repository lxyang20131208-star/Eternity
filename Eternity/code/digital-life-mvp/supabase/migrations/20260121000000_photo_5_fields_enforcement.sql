-- ====================================
-- Phase 1: 照片5字段强制标注系统 (简化版)
-- ====================================

-- 1. 扩展 photo_memories 表
ALTER TABLE photo_memories
  ADD COLUMN IF NOT EXISTS linked_question_id TEXT,
  ADD COLUMN IF NOT EXISTS time_taken TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_precision TEXT DEFAULT 'fuzzy',
  ADD COLUMN IF NOT EXISTS place_id UUID,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS annotation_status TEXT DEFAULT 'incomplete';

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_photo_memories_question ON photo_memories(linked_question_id) WHERE linked_question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_memories_time ON photo_memories(time_taken) WHERE time_taken IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_memories_place ON photo_memories(place_id) WHERE place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_memories_annotation_status ON photo_memories(annotation_status);

-- 3. 创建视图：未完成标注的照片
CREATE OR REPLACE VIEW incomplete_photos AS
SELECT
  pm.id,
  pm.user_id,
  pm.photo_url,
  pm.caption,
  pm.created_at,
  CASE
    WHEN pm.linked_question_id IS NULL THEN 'missing_question'
    WHEN NOT EXISTS (SELECT 1 FROM photo_people pp WHERE pp.photo_id = pm.id) THEN 'missing_people'
    WHEN pm.time_taken IS NULL THEN 'missing_time'
    WHEN pm.place_id IS NULL THEN 'missing_place'
    WHEN pm.caption IS NULL OR trim(pm.caption) = '' THEN 'missing_caption'
    ELSE 'complete'
  END as missing_field,
  (
    (CASE WHEN pm.linked_question_id IS NOT NULL THEN 20 ELSE 0 END) +
    (CASE WHEN EXISTS (SELECT 1 FROM photo_people pp WHERE pp.photo_id = pm.id) THEN 20 ELSE 0 END) +
    (CASE WHEN pm.time_taken IS NOT NULL THEN 20 ELSE 0 END) +
    (CASE WHEN pm.place_id IS NOT NULL THEN 20 ELSE 0 END) +
    (CASE WHEN pm.caption IS NOT NULL AND trim(pm.caption) != '' THEN 20 ELSE 0 END)
  ) as completion_percentage
FROM photo_memories pm;

-- 4. 创建统计视图
CREATE OR REPLACE VIEW photo_annotation_stats AS
SELECT
  user_id,
  COUNT(*) as total_photos,
  COUNT(*) FILTER (WHERE linked_question_id IS NOT NULL) as with_question,
  COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM photo_people pp WHERE pp.photo_id = photo_memories.id)) as with_people,
  COUNT(*) FILTER (WHERE time_taken IS NOT NULL) as with_time,
  COUNT(*) FILTER (WHERE place_id IS NOT NULL) as with_place,
  COUNT(*) FILTER (WHERE caption IS NOT NULL AND trim(caption) != '') as with_caption,
  COUNT(*) FILTER (WHERE annotation_status = 'complete') as complete_photos,
  COUNT(*) FILTER (WHERE annotation_status = 'incomplete') as incomplete_photos,
  ROUND(100.0 * COUNT(*) FILTER (WHERE annotation_status = 'complete') / NULLIF(COUNT(*), 0), 2) as completion_rate
FROM photo_memories
GROUP BY user_id;

-- 5. 数据迁移：设置默认时间
UPDATE photo_memories
SET time_taken = created_at, time_precision = 'fuzzy'
WHERE time_taken IS NULL;

-- 6. 更新annotation_status
UPDATE photo_memories
SET annotation_status = CASE
  WHEN linked_question_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM photo_people WHERE photo_id = photo_memories.id)
       AND time_taken IS NOT NULL
       AND place_id IS NOT NULL
       AND caption IS NOT NULL
       AND trim(caption) != ''
  THEN 'complete'
  ELSE 'incomplete'
END;
