-- Timeline System
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birth_year INTEGER;

CREATE TABLE IF NOT EXISTS timeline_fact_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_session_id UUID REFERENCES answer_sessions(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  summary TEXT,
  inferred_time_start TIMESTAMPTZ,
  inferred_time_end TIMESTAMPTZ,
  time_precision TEXT CHECK (time_precision IN ('exact', 'year', 'month', 'range', 'age', 'fuzzy')),
  age_mentioned INTEGER,
  stage_mentioned TEXT,
  confidence DECIMAL(3, 2) DEFAULT 0.5,
  status TEXT DEFAULT 'inferred' CHECK (status IN ('inferred', 'confirmed', 'needs_review')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timeline_fact_extracts_project ON timeline_fact_extracts(project_id);
CREATE INDEX idx_timeline_fact_extracts_time ON timeline_fact_extracts(inferred_time_start);

ALTER TABLE timeline_fact_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage timeline_facts in their projects"
ON timeline_fact_extracts FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
