-- Migration: Biography Outlines System
-- Created: 2024-12-24
-- Description: Tables and policies for generating structured biography outlines from answer transcripts

-- ============================================================================
-- Table: biography_outlines
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.biography_outlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  outline_json JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  style_prefs_json JSONB DEFAULT '{}'::jsonb,
  export_object_key TEXT, -- Path in vault bucket for PDF/DOCX exports
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for faster project-based queries
CREATE INDEX IF NOT EXISTS idx_biography_outlines_project_id 
  ON public.biography_outlines(project_id);

-- Index for status polling
CREATE INDEX IF NOT EXISTS idx_biography_outlines_status 
  ON public.biography_outlines(status) WHERE status IN ('pending', 'processing');

-- ============================================================================
-- Table: outline_jobs (optional - for multi-run job history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed', 'cancelled')),
  params_json JSONB DEFAULT '{}'::jsonb,
  result_outline_id UUID REFERENCES public.biography_outlines(id) ON DELETE SET NULL,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  error_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for job polling
CREATE INDEX IF NOT EXISTS idx_outline_jobs_project_id 
  ON public.outline_jobs(project_id);

CREATE INDEX IF NOT EXISTS idx_outline_jobs_status 
  ON public.outline_jobs(status) WHERE status IN ('pending', 'processing');

-- ============================================================================
-- RLS Policies: biography_outlines
-- ============================================================================

-- Enable RLS
ALTER TABLE public.biography_outlines ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own project outlines
DO $$
BEGIN
  CREATE POLICY "Users can view their own project outlines"
    ON public.biography_outlines
    FOR SELECT
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Policy: Users can INSERT outlines for their own projects
DO $$
BEGIN
  CREATE POLICY "Users can create outlines for their own projects"
    ON public.biography_outlines
    FOR INSERT
    WITH CHECK (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Policy: Users can UPDATE their own project outlines
DO $$
BEGIN
  CREATE POLICY "Users can update their own project outlines"
    ON public.biography_outlines
    FOR UPDATE
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Policy: Users can DELETE their own project outlines
DO $$
BEGIN
  CREATE POLICY "Users can delete their own project outlines"
    ON public.biography_outlines
    FOR DELETE
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- RLS Policies: outline_jobs
-- ============================================================================

ALTER TABLE public.outline_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own project jobs
DO $$
BEGIN
  CREATE POLICY "Users can view their own project jobs"
    ON public.outline_jobs
    FOR SELECT
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Policy: Users can INSERT jobs for their own projects
DO $$
BEGIN
  CREATE POLICY "Users can create jobs for their own projects"
    ON public.outline_jobs
    FOR INSERT
    WITH CHECK (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Policy: Users can UPDATE their own project jobs
DO $$
BEGIN
  CREATE POLICY "Users can update their own project jobs"
    ON public.outline_jobs
    FOR UPDATE
    USING (
      project_id IN (
        SELECT id FROM public.projects WHERE owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- Trigger: Updated_at auto-update
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
  CREATE TRIGGER update_biography_outlines_updated_at
    BEFORE UPDATE ON public.biography_outlines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE TRIGGER update_outline_jobs_updated_at
    BEFORE UPDATE ON public.outline_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE public.biography_outlines IS 'Stores generated biography outlines with versioning and export support';
COMMENT ON TABLE public.outline_jobs IS 'Tracks job history for outline generation runs';
COMMENT ON COLUMN public.biography_outlines.outline_json IS 'Structured outline: { title, sections: [{ title, bullets, quotes, source_ids }] }';
COMMENT ON COLUMN public.biography_outlines.style_prefs_json IS 'User preferences: { tone, depth, chapters, languageRule }';
COMMENT ON COLUMN public.biography_outlines.export_object_key IS 'Storage path for PDF/DOCX exports in vault bucket';
-- MVP migration for chapter-based progress path
-- Adds chapter field (if missing) and a lightweight progress table

alter table if exists public.questions
  add column if not exists chapter text;

create table if not exists public.user_question_progress (
  user_id uuid not null,
  question_id text not null,
  status text not null default 'unlocked' check (status in ('unlocked', 'completed')),
  completed_at timestamptz,
  updated_at timestamptz default now(),
  inserted_at timestamptz default now(),
  primary key (user_id, question_id)
);

create index if not exists idx_user_question_progress_user_status
  on public.user_question_progress (user_id, status);
-- Add photo attachments to answers with person tags

create table if not exists public.answer_photos (
  id uuid primary key default gen_random_uuid(),
  answer_session_id uuid not null references public.answer_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  question_id text not null,
  photo_url text not null,
  person_names text[] default '{}', -- array of tagged people
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_answer_photos_session
  on public.answer_photos (answer_session_id);

create index if not exists idx_answer_photos_project_question
  on public.answer_photos (project_id, question_id);

create index if not exists idx_answer_photos_created
  on public.answer_photos (created_at desc);
-- Premium subscription system
-- Tracks paid membership with status + expiry

create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('trial','monthly','yearly','lifetime','manual')),
  status text not null check (status in ('active','expired','cancelled')),
  started_at timestamptz default now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  provider text default 'manual',
  provider_ref text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_premium_subscriptions_user on public.premium_subscriptions(user_id);
create unique index if not exists uq_premium_active_user on public.premium_subscriptions(user_id) where status = 'active';

alter table public.premium_subscriptions enable row level security;

-- Service role full access
DO $$
BEGIN
  CREATE POLICY "service role access premium" ON public.premium_subscriptions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- End users may read their own subscription status (no write)
DO $$
BEGIN
  CREATE POLICY "user read own premium" ON public.premium_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Helper function to check premium status (bypasses RLS via security definer)
create or replace function public.is_premium(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.premium_subscriptions ps
    where ps.user_id = p_user_id
      and ps.status = 'active'
      and (ps.expires_at is null or ps.expires_at > now())
    limit 1
  );
$$;

grant execute on function public.is_premium(uuid) to authenticated;
-- Add collaboration support with invites, roles, and comments

create table if not exists public.project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'contributor', 'viewer')),
  invited_at timestamptz default now(),
  joined_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(project_id, user_id)
);

create index if not exists idx_project_collaborators_project
  on public.project_collaborators (project_id);

create index if not exists idx_project_collaborators_user
  on public.project_collaborators (user_id);

-- Invite tokens for sharing projects
create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invite_token text not null unique,
  role text not null default 'viewer' check (role in ('contributor', 'viewer')),
  created_by uuid not null references auth.users(id),
  max_uses int default null, -- null = unlimited
  used_count int default 0,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_project_invites_token
  on public.project_invites (invite_token);

create index if not exists idx_project_invites_project
  on public.project_invites (project_id);

-- Comments/activity on answers
create table if not exists public.answer_comments (
  id uuid primary key default gen_random_uuid(),
  answer_session_id uuid not null references public.answer_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_answer_comments_session
  on public.answer_comments (answer_session_id);

create index if not exists idx_answer_comments_project
  on public.answer_comments (project_id);

create index if not exists idx_answer_comments_user
  on public.answer_comments (user_id);
-- Enable RLS and policies for project_collaborators

alter table public.project_collaborators enable row level security;

-- service role full access
DO $$
BEGIN
  CREATE POLICY "service role collaborators" ON public.project_collaborators
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- owner can manage collaborators of own project
DO $$
BEGIN
  CREATE POLICY "owner manage collaborators" ON public.project_collaborators
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
          AND p.owner_id = auth.uid()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
          AND p.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- collaborators can read collaborators list of the project they belong to
DO $$
BEGIN
  CREATE POLICY "collaborator read collaborators" ON public.project_collaborators
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.project_collaborators c
        WHERE c.project_id = project_id
          AND c.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id
          AND p.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
-- Scope custom questions to their owners
-- Adds created_by and enforces RLS so only owners can see their custom questions

-- 1) Add created_by column if missing
alter table if exists public.questions
  add column if not exists created_by uuid references auth.users(id);

-- 2) Create index for performance
create index if not exists idx_questions_created_by on public.questions(created_by);

-- 3) Enable Row Level Security
alter table if exists public.questions enable row level security;

-- 4) Policies
-- Read default questions (created_by is null) for everyone
DO $$
BEGIN
  CREATE POLICY "read_default_questions"
    ON public.questions FOR SELECT
    USING (created_by IS NULL);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Read own custom questions
DO $$
BEGIN
  CREATE POLICY "read_own_custom_questions"
    ON public.questions FOR SELECT
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Insert only for authenticated users, and only as themselves
DO $$
BEGIN
  CREATE POLICY "insert_own_custom_questions"
    ON public.questions FOR INSERT
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Update only own custom questions
DO $$
BEGIN
  CREATE POLICY "update_own_custom_questions"
    ON public.questions FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Delete only own custom questions
DO $$
BEGIN
  CREATE POLICY "delete_own_custom_questions"
    ON public.questions FOR DELETE
    USING (created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
-- Add video attachments to answers with QR code support for printed books
-- Videos can be embedded via QR codes that link to the video playback

create table if not exists public.answer_videos (
  id uuid primary key default gen_random_uuid(),
  answer_session_id uuid not null references public.answer_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  question_id text not null,
  video_object_key text not null, -- storage key in supabase
  thumbnail_url text, -- optional thumbnail for preview
  duration_seconds int, -- video duration
  file_size_bytes bigint, -- for tracking storage usage
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_answer_videos_session
  on public.answer_videos (answer_session_id);

create index if not exists idx_answer_videos_project_question
  on public.answer_videos (project_id, question_id);

create index if not exists idx_answer_videos_created
  on public.answer_videos (created_at desc);

-- RLS policies
alter table public.answer_videos enable row level security;

-- Users can view videos in their projects
DO $$
BEGIN
  CREATE POLICY "read_own_project_videos"
    ON public.answer_videos FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = answer_videos.project_id
        AND p.owner_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = answer_videos.project_id
        AND pc.user_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Users can insert videos to their own projects
DO $$
BEGIN
  CREATE POLICY "insert_own_project_videos"
    ON public.answer_videos FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = answer_videos.project_id
        AND p.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Users can delete videos from their own projects
DO $$
BEGIN
  CREATE POLICY "delete_own_project_videos"
    ON public.answer_videos FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = answer_videos.project_id
        AND p.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
-- Fix infinite recursion in project_collaborators RLS policy
-- The "collaborator read collaborators" policy was querying project_collaborators
-- from within a policy on project_collaborators, causing infinite recursion.

-- First, create a security definer function that bypasses RLS to check collaboration
CREATE OR REPLACE FUNCTION public.is_project_collaborator(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_collaborators
    WHERE project_id = p_project_id
      AND user_id = p_user_id
  );
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "collaborator read collaborators" ON public.project_collaborators;

-- Recreate with a non-recursive approach using the security definer function
CREATE POLICY "collaborator read collaborators" ON public.project_collaborators
  FOR SELECT
  USING (
    -- User is the owner of the project
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_collaborators.project_id
        AND p.owner_id = auth.uid()
    )
    OR
    -- User is a collaborator on this project (using security definer function to avoid recursion)
    public.is_project_collaborator(project_collaborators.project_id, auth.uid())
  );
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
-- Table: round2_questions - Round 2 Questions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.round2_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.question_rounds(id) ON DELETE CASCADE,

  -- Question content
  question_text TEXT NOT NULL,
  question_text_en TEXT,

  -- Question category (for missing content)
  question_type TEXT NOT NULL CHECK (question_type IN ('conflict', 'sensory', 'quote', 'general')),

  -- Associated original questions/chapters
  related_chapter TEXT,
  related_question_ids TEXT[],

  -- Source analysis information
  analysis_context JSONB DEFAULT '{}',
  missing_element_description TEXT,

  -- Question status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'skipped')),
  priority INTEGER DEFAULT 0,

  -- Answer association
  answer_session_id UUID REFERENCES public.answer_sessions(id) ON DELETE SET NULL,

  -- Media prompts
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
-- Allow question_id to be null for round 2 answers
ALTER TABLE public.answer_sessions ALTER COLUMN question_id DROP NOT NULL;
-- Add expanded_json column to biography_outlines table
-- This stores the fully expanded chapter content with literary style

ALTER TABLE biography_outlines
ADD COLUMN IF NOT EXISTS expanded_json JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN biography_outlines.expanded_json IS 'Stores expanded chapter content with full prose text, generated using author style';
