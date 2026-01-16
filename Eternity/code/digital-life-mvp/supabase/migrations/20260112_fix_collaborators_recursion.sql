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
