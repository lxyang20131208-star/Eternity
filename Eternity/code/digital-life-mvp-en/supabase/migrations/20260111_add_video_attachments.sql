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
