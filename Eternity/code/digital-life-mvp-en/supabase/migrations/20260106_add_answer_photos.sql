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
