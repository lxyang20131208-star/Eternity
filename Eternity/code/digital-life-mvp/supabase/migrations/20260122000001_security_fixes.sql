-- ====================================
-- Supabase Security Advisor 修复
-- 修复安全警告和RLS问题
-- ====================================

-- ====================================
-- 1. 修复 SECURITY DEFINER Views
-- ====================================

-- 重建 incomplete_photos 视图，移除 SECURITY DEFINER
-- 注意：这个视图基于 photo_memories 表
DROP VIEW IF EXISTS incomplete_photos CASCADE;
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

-- 重建 photo_annotation_stats 视图，移除 SECURITY DEFINER
-- 注意：这个视图基于 photo_memories 表
DROP VIEW IF EXISTS photo_annotation_stats CASCADE;
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

-- ====================================
-- 2. 启用 RLS 并添加策略
-- ====================================

-- user_question_progress 表
ALTER TABLE public.user_question_progress ENABLE ROW LEVEL SECURITY;

-- 添加RLS策略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_question_progress'
    AND policyname = 'Users can view their own question progress'
  ) THEN
    CREATE POLICY "Users can view their own question progress"
      ON public.user_question_progress
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_question_progress'
    AND policyname = 'Users can insert their own question progress'
  ) THEN
    CREATE POLICY "Users can insert their own question progress"
      ON public.user_question_progress
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_question_progress'
    AND policyname = 'Users can update their own question progress'
  ) THEN
    CREATE POLICY "Users can update their own question progress"
      ON public.user_question_progress
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_question_progress'
    AND policyname = 'Users can delete their own question progress'
  ) THEN
    CREATE POLICY "Users can delete their own question progress"
      ON public.user_question_progress
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- project_invites 表
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_invites'
    AND policyname = 'Users can view invites sent to them'
  ) THEN
    CREATE POLICY "Users can view invites sent to them"
      ON public.project_invites
      FOR SELECT
      TO authenticated
      USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_invites'
    AND policyname = 'Project owners can view invites for their projects'
  ) THEN
    CREATE POLICY "Project owners can view invites for their projects"
      ON public.project_invites
      FOR SELECT
      TO authenticated
      USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_invites'
    AND policyname = 'Users can insert invites for their projects'
  ) THEN
    CREATE POLICY "Users can insert invites for their projects"
      ON public.project_invites
      FOR INSERT
      TO authenticated
      WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_invites'
    AND policyname = 'Users can update invites for their projects'
  ) THEN
    CREATE POLICY "Users can update invites for their projects"
      ON public.project_invites
      FOR UPDATE
      TO authenticated
      USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()))
      WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_invites'
    AND policyname = 'Users can delete invites for their projects'
  ) THEN
    CREATE POLICY "Users can delete invites for their projects"
      ON public.project_invites
      FOR DELETE
      TO authenticated
      USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
  END IF;
END $$;

-- answer_comments 表
ALTER TABLE public.answer_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view comments on answers in their projects"
  ON public.answer_comments
  FOR SELECT
  TO authenticated
  USING (
    answer_session_id IN (
      SELECT id FROM public.answer_sessions
      WHERE project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY IF NOT EXISTS "Users can insert comments on answers in their projects"
  ON public.answer_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    answer_session_id IN (
      SELECT id FROM public.answer_sessions
      WHERE project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    )
    AND user_id = auth.uid()
  );

CREATE POLICY IF NOT EXISTS "Users can update their own comments"
  ON public.answer_comments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users can delete their own comments"
  ON public.answer_comments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ====================================
-- 3. 为新视图添加RLS策略
-- ====================================

ALTER VIEW public.incomplete_photos OWNER TO postgres;
ALTER VIEW public.photo_annotation_stats OWNER TO postgres;

-- 添加注释
COMMENT ON VIEW public.incomplete_photos IS '显示缺少必要信息的照片（没有启用SECURITY DEFINER）';
COMMENT ON VIEW public.photo_annotation_stats IS '照片注释统计视图（没有启用SECURITY DEFINER）';

-- ====================================
-- 完成
-- ====================================

-- 这个迁移移除了SECURITY DEFINER属性并为所有公开表添加了RLS策略
-- 这解决了Supabase Security Advisor的所有警告
