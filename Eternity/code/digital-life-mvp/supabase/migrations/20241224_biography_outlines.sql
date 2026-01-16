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
