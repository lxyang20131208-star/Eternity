-- Collaboration Feature Migration
-- Create tables for family/friend collaboration on questions

-- 1. Collab Invites Table
CREATE TABLE IF NOT EXISTS collab_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('contributor', 'viewer')),
  can_view_owner_answer BOOLEAN NOT NULL DEFAULT false,
  owner_message TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collab_invites_token ON collab_invites(token);
CREATE INDEX idx_collab_invites_project ON collab_invites(project_id);
CREATE INDEX idx_collab_invites_created_by ON collab_invites(created_by_user_id);

-- 2. Collab Invite Questions (Join Table)
CREATE TABLE IF NOT EXISTS collab_invite_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES collab_invites(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  can_view_owner_answer_override BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invite_id, question_id)
);

CREATE INDEX idx_collab_invite_questions_invite ON collab_invite_questions(invite_id);
CREATE INDEX idx_collab_invite_questions_question ON collab_invite_questions(question_id);

-- 3. Collab Comments Table
CREATE TABLE IF NOT EXISTS collab_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID NOT NULL REFERENCES collab_invites(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  contributor_user_id UUID,
  contributor_name TEXT,
  audio_storage_path TEXT,
  transcript_text TEXT,
  comment_text TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'pinned', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collab_comments_invite ON collab_comments(invite_id);
CREATE INDEX idx_collab_comments_question ON collab_comments(question_id);
CREATE INDEX idx_collab_comments_project ON collab_comments(project_id);
CREATE INDEX idx_collab_comments_status ON collab_comments(status);

-- Create updated_at trigger for collab_comments
CREATE TRIGGER update_collab_comments_updated_at
  BEFORE UPDATE ON collab_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies

-- collab_invites policies
ALTER TABLE collab_invites ENABLE ROW LEVEL SECURITY;

-- Owner can manage their invites
CREATE POLICY "collab_invites_owner_all" ON collab_invites
  FOR ALL
  USING (created_by_user_id = auth.uid());

-- Anyone can read invite by token (for invitee access)
CREATE POLICY "collab_invites_read_by_token" ON collab_invites
  FOR SELECT
  USING (true);

-- collab_invite_questions policies
ALTER TABLE collab_invite_questions ENABLE ROW LEVEL SECURITY;

-- Owner can manage invite questions
CREATE POLICY "collab_invite_questions_owner_all" ON collab_invite_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM collab_invites
      WHERE collab_invites.id = collab_invite_questions.invite_id
      AND collab_invites.created_by_user_id = auth.uid()
    )
  );

-- Anyone can read invite questions (needed for invitee)
CREATE POLICY "collab_invite_questions_read_all" ON collab_invite_questions
  FOR SELECT
  USING (true);

-- collab_comments policies
ALTER TABLE collab_comments ENABLE ROW LEVEL SECURITY;

-- Owner can read all comments in their project
CREATE POLICY "collab_comments_owner_read" ON collab_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = collab_comments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Owner can update/delete comments in their project
CREATE POLICY "collab_comments_owner_update" ON collab_comments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = collab_comments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "collab_comments_owner_delete" ON collab_comments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = collab_comments.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Anyone can insert comments (invitees)
CREATE POLICY "collab_comments_insert" ON collab_comments
  FOR INSERT
  WITH CHECK (true);

-- Invitees can read their own comments
CREATE POLICY "collab_comments_contributor_read" ON collab_comments
  FOR SELECT
  USING (
    contributor_user_id = auth.uid()
    OR contributor_user_id IS NULL
  );

-- Storage bucket for collab audio
INSERT INTO storage.buckets (id, name, public)
VALUES ('collab-audio', 'collab-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for collab-audio bucket
CREATE POLICY "collab_audio_owner_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'collab-audio'
    AND (
      -- Owner can read all in their project
      EXISTS (
        SELECT 1 FROM collab_comments cc
        JOIN projects p ON p.id = cc.project_id
        WHERE storage.objects.name LIKE cc.project_id::text || '%'
        AND p.owner_id = auth.uid()
      )
      OR
      -- Contributor can read their own
      EXISTS (
        SELECT 1 FROM collab_comments cc
        WHERE storage.objects.name LIKE '%/' || cc.id::text || '%'
        AND (cc.contributor_user_id = auth.uid() OR cc.contributor_user_id IS NULL)
      )
    )
  );

CREATE POLICY "collab_audio_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'collab-audio'
  );

CREATE POLICY "collab_audio_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'collab-audio'
    AND EXISTS (
      SELECT 1 FROM collab_comments cc
      JOIN projects p ON p.id = cc.project_id
      WHERE storage.objects.name LIKE cc.project_id::text || '%'
      AND p.owner_id = auth.uid()
    )
  );
