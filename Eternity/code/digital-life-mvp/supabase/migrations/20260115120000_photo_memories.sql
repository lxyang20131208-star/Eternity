-- Photo memories with person tagging and scene metadata

-- People roster (reusable contacts)
create table if not exists public.people_roster (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relation text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_people_roster_user
  on public.people_roster (user_id);

-- Photo memories
create table if not exists public.photo_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  photo_url text not null,
  location text,
  event_date date,
  event_name text,
  tags text[] default '{}',
  notes text,
  display_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_photo_memories_user
  on public.photo_memories (user_id);

create index if not exists idx_photo_memories_date
  on public.photo_memories (event_date desc);

create index if not exists idx_photo_memories_tags
  on public.photo_memories using gin(tags);

-- Photo-person associations
create table if not exists public.photo_people (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photo_memories(id) on delete cascade,
  person_id uuid not null references public.people_roster(id) on delete cascade,
  is_unknown boolean default false,
  created_at timestamptz default now(),
  unique(photo_id, person_id)
);

create index if not exists idx_photo_people_photo
  on public.photo_people (photo_id);

create index if not exists idx_photo_people_person
  on public.photo_people (person_id);

-- RLS Policies
alter table public.people_roster enable row level security;
alter table public.photo_memories enable row level security;
alter table public.photo_people enable row level security;

-- People roster policies
create policy "Users can view their own people"
  on public.people_roster for select
  using (auth.uid() = user_id);

create policy "Users can insert their own people"
  on public.people_roster for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own people"
  on public.people_roster for update
  using (auth.uid() = user_id);

create policy "Users can delete their own people"
  on public.people_roster for delete
  using (auth.uid() = user_id);

-- Photo memories policies
create policy "Users can view their own photos"
  on public.photo_memories for select
  using (auth.uid() = user_id);

create policy "Users can insert their own photos"
  on public.photo_memories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own photos"
  on public.photo_memories for update
  using (auth.uid() = user_id);

create policy "Users can delete their own photos"
  on public.photo_memories for delete
  using (auth.uid() = user_id);

-- Photo-people policies
create policy "Users can view photo-people associations for their photos"
  on public.photo_people for select
  using (
    exists (
      select 1 from public.photo_memories
      where photo_memories.id = photo_people.photo_id
      and photo_memories.user_id = auth.uid()
    )
  );

create policy "Users can insert photo-people associations for their photos"
  on public.photo_people for insert
  with check (
    exists (
      select 1 from public.photo_memories
      where photo_memories.id = photo_people.photo_id
      and photo_memories.user_id = auth.uid()
    )
  );

create policy "Users can delete photo-people associations for their photos"
  on public.photo_people for delete
  using (
    exists (
      select 1 from public.photo_memories
      where photo_memories.id = photo_people.photo_id
      and photo_memories.user_id = auth.uid()
    )
  );
