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
