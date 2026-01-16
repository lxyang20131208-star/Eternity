-- Migration: Second Round Questions System
-- Created: 2026-01-13
-- Description: Support for AI-analyzed follow-up questions based on first round answers

-- ============================================================================
-- Table: question_rounds - 问题轮次追踪
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_questions INTEGER DEFAULT 0,
  answered_questions INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_question_rounds_project ON public.question_rounds(project_id);
CREATE INDEX IF NOT EXISTS idx_question_rounds_status ON public.question_rounds(status);

-- ============================================================================
-- Table: round2_questions - 第二轮问题
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.round2_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.question_rounds(id) ON DELETE CASCADE,

  -- 问题内容
  question_text TEXT NOT NULL,
  question_text_en TEXT,

  -- 问题分类 (针对缺失内容)
  question_type TEXT NOT NULL CHECK (question_type IN ('conflict', 'sensory', 'quote', 'general')),

  -- 关联的原始问题/章节
  related_chapter TEXT,
  related_question_ids TEXT[],

  -- 来源分析信息
  analysis_context JSONB DEFAULT '{}',
  missing_element_description TEXT,

  -- 问题状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped')),
  priority INTEGER DEFAULT 0,

  -- 回答关联
  answer_session_id UUID REFERENCES public.answer_sessions(id) ON DELETE SET NULL,

  -- 媒体提示
  media_prompt TEXT,
  suggested_media_type TEXT CHECK (suggested_media_type IN ('photo', 'video', 'both', 'none')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round2_questions_project ON public.round2_questions(project_id);
CREATE INDEX IF NOT EXISTS idx_round2_questions_round ON public.round2_questions(round_id);
CREATE INDEX IF NOT EXISTS idx_round2_questions_type ON public.round2_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_round2_questions_status ON public.round2_questions(status);

-- ============================================================================
-- Table: content_analysis - 内容分析结果
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.content_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  round_id UUID REFERENCES public.question_rounds(id) ON DELETE CASCADE,

  -- 分析版本
  analysis_version INTEGER NOT NULL DEFAULT 1,

  -- 分析结果 (JSON 结构)
  analysis_json JSONB NOT NULL,

  -- 元数据
  analyzed_sessions_count INTEGER DEFAULT 0,
  total_transcript_chars INTEGER DEFAULT 0,
  ai_model_used TEXT,

  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('processing', 'done', 'failed')),
  error_text TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_analysis_project ON public.content_analysis(project_id);

-- ============================================================================
-- Extend answer_sessions - 添加轮次信息
-- ============================================================================
ALTER TABLE public.answer_sessions
ADD COLUMN IF NOT EXISTS round_number INTEGER DEFAULT 1;

ALTER TABLE public.answer_sessions
ADD COLUMN IF NOT EXISTS round2_question_id UUID REFERENCES public.round2_questions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_answer_sessions_round ON public.answer_sessions(round_number);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.question_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round2_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_analysis ENABLE ROW LEVEL SECURITY;

-- question_rounds policies
DO $$
BEGIN
  CREATE POLICY "Users can manage their own question rounds"
    ON public.question_rounds
    FOR ALL
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role full access to question_rounds"
    ON public.question_rounds
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- round2_questions policies
DO $$
BEGIN
  CREATE POLICY "Users can manage their own round2 questions"
    ON public.round2_questions
    FOR ALL
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role full access to round2_questions"
    ON public.round2_questions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- content_analysis policies
DO $$
BEGIN
  CREATE POLICY "Users can manage their own content analysis"
    ON public.content_analysis
    FOR ALL
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role full access to content_analysis"
    ON public.content_analysis
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.question_rounds IS 'Tracks question rounds (1st, 2nd, etc.) for each project';
COMMENT ON TABLE public.round2_questions IS 'AI-generated follow-up questions based on content analysis';
COMMENT ON TABLE public.content_analysis IS 'AI analysis results for missing Conflict/Sensory/Quotes';
COMMENT ON COLUMN public.round2_questions.question_type IS 'conflict=冲突, sensory=感官细节, quote=金句, general=通用补充';
COMMENT ON COLUMN public.round2_questions.media_prompt IS 'Hint for what type of media to upload with this answer';
