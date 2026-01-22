-- Places Map System
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'manual' CHECK (provider IN ('manual', 'google', 'osm')),
  ADD COLUMN IF NOT EXISTS external_place_id TEXT;

CREATE TABLE IF NOT EXISTS answer_place_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_session_id UUID REFERENCES answer_sessions(id) ON DELETE CASCADE,
  place_text TEXT NOT NULL,
  evidence_snippet TEXT,
  confidence DECIMAL(3, 2) DEFAULT 0.5,
  resolved_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'confirmed', 'rejected')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS place_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('photo', 'answer', 'manual')),
  source_ref_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_answer_place_extracts_project ON answer_place_extracts(project_id);
CREATE INDEX idx_answer_place_extracts_question ON answer_place_extracts(question_id);
CREATE INDEX idx_place_markers_project ON place_markers(project_id);
CREATE INDEX idx_place_markers_place ON place_markers(place_id);

ALTER TABLE answer_place_extracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage place_extracts in their projects"
ON answer_place_extracts FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage place_markers in their projects"
ON place_markers FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
