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
