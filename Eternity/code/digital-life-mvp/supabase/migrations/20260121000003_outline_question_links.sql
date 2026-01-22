-- Outline-Question Links
CREATE TABLE IF NOT EXISTS chapter_question_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  outline_version_id UUID,
  chapter_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  order_in_chapter INTEGER DEFAULT 0,
  weight DECIMAL(3, 2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(outline_version_id, chapter_id, question_id)
);

CREATE INDEX idx_chapter_question_links_project ON chapter_question_links(project_id);
CREATE INDEX idx_chapter_question_links_outline ON chapter_question_links(outline_version_id);
CREATE INDEX idx_chapter_question_links_chapter ON chapter_question_links(chapter_id);
CREATE INDEX idx_chapter_question_links_question ON chapter_question_links(question_id);

ALTER TABLE chapter_question_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chapter_question_links in their projects"
ON chapter_question_links FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
