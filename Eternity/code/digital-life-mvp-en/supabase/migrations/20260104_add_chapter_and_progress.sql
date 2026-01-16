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
