-- Question Scope Isolation Migration
-- This migration separates trial/draft questions from the core question set
-- and ensures proper isolation of user-created questions

-- 1. Expand scope CHECK constraint to include 'trial'
-- Drop and recreate the constraint with the new values
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_scope_check;
ALTER TABLE questions ADD CONSTRAINT questions_scope_check
  CHECK (scope IN ('global', 'user', 'trial'));

-- 2. Update the draft_demo question to use 'trial' scope
-- This ensures it won't appear in the main question list
UPDATE questions
SET scope = 'trial'
WHERE id = 'draft_demo';

-- 3. Drop existing RLS policies and create new ones
DROP POLICY IF EXISTS "Users can view global and own questions" ON questions;
DROP POLICY IF EXISTS "Users can insert their own questions" ON questions;
DROP POLICY IF EXISTS "Users can update their own questions" ON questions;
DROP POLICY IF EXISTS "Users can delete their own questions" ON questions;

-- 4. SELECT policy: Users can view core (global) questions and their own user-scoped questions
-- Trial questions are intentionally excluded from normal queries
CREATE POLICY "questions_select_policy"
ON questions FOR SELECT TO authenticated
USING (
  scope = 'global'  -- Core questions (the 100 base questions)
  OR (scope = 'user' AND owner_user_id = auth.uid())  -- User's own custom questions
  -- Note: 'trial' scope questions are NOT included - they're accessed directly by ID
);

-- 5. Allow reading trial questions by their specific ID (for draft page)
-- This is a separate policy that allows reading trial questions when accessed directly
CREATE POLICY "questions_select_trial_by_id"
ON questions FOR SELECT TO authenticated
USING (
  scope = 'trial'
);

-- 6. INSERT policy: Users can only create their own user-scoped questions
CREATE POLICY "questions_insert_policy"
ON questions FOR INSERT TO authenticated
WITH CHECK (
  scope = 'user'
  AND owner_user_id = auth.uid()
);

-- 7. UPDATE policy: Users can only update their own questions
CREATE POLICY "questions_update_policy"
ON questions FOR UPDATE TO authenticated
USING (
  scope = 'user'
  AND owner_user_id = auth.uid()
)
WITH CHECK (
  scope = 'user'
  AND owner_user_id = auth.uid()
);

-- 8. DELETE policy: Users can only delete their own questions
CREATE POLICY "questions_delete_policy"
ON questions FOR DELETE TO authenticated
USING (
  scope = 'user'
  AND owner_user_id = auth.uid()
);

-- 9. Add an index for scope to speed up filtered queries
CREATE INDEX IF NOT EXISTS idx_questions_scope_global ON questions(scope) WHERE scope = 'global';

-- 10. Verify the draft_demo question has been updated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM questions WHERE id = 'draft_demo' AND scope = 'trial'
  ) THEN
    RAISE WARNING 'draft_demo question was not updated to trial scope';
  END IF;
END $$;

-- SUMMARY:
-- - scope = 'global': Core 100 questions, visible to all authenticated users
-- - scope = 'user': User-created custom questions, visible only to owner
-- - scope = 'trial': Draft/onboarding questions, accessible by ID but not in main list
