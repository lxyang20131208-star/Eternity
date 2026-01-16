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
