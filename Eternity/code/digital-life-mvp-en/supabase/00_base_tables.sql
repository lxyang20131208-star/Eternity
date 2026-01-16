-- Base Tables for Digital Life MVP
-- Run this FIRST before running all_migrations.sql
-- These tables are required by the migration files

-- ============================================================================
-- Table: projects - 项目/传记主体
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  subject_name TEXT, -- 传记主角姓名
  subject_relationship TEXT, -- 与用户的关系
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Users can manage their own projects
DO $$
BEGIN
  CREATE POLICY "Users can manage their own projects"
    ON public.projects
    FOR ALL
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Table: questions - 问题库
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY,
  question_text TEXT NOT NULL,
  question_text_en TEXT,
  category TEXT,
  chapter TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_category ON public.questions(category);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON public.questions(chapter);

-- ============================================================================
-- Table: answer_sessions - 回答记录
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.answer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES public.questions(id),
  transcript TEXT, -- 语音转文字后的内容
  audio_url TEXT, -- 音频文件URL
  duration_seconds INTEGER,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'archived')),
  round_number INTEGER DEFAULT 1,
  round2_question_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_answer_sessions_project ON public.answer_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_answer_sessions_question ON public.answer_sessions(question_id);

ALTER TABLE public.answer_sessions ENABLE ROW LEVEL SECURITY;

-- Users can manage answers in their own projects
DO $$
BEGIN
  CREATE POLICY "Users can manage their own project answers"
    ON public.answer_sessions
    FOR ALL
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_answer_sessions_updated_at
    BEFORE UPDATE ON public.answer_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
