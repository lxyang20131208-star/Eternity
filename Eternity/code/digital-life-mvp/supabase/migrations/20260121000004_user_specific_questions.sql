-- User-Specific Questions
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'system' CHECK (created_by IN ('system', 'ai', 'user'));

CREATE INDEX idx_questions_scope ON questions(scope);
CREATE INDEX idx_questions_owner ON questions(owner_user_id);
CREATE INDEX idx_questions_parent ON questions(parent_question_id);

DROP POLICY IF EXISTS "Users can view questions" ON questions;

CREATE POLICY "Users can view global and own questions"
ON questions FOR SELECT TO authenticated
USING (
  scope = 'global'
  OR (scope = 'user' AND owner_user_id = auth.uid())
);

CREATE POLICY "Users can insert their own questions"
ON questions FOR INSERT TO authenticated
WITH CHECK (scope = 'user' AND owner_user_id = auth.uid());
