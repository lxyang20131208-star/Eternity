-- ====================================
-- 传记知识图谱核心数据模型
-- Knowledge Graph for Biography System
-- ====================================

-- 1. Person（人物表）
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] DEFAULT '{}', -- 昵称/别称数组
  role TEXT, -- 父亲/母亲/朋友/老师等
  avatar_url TEXT,
  cover_photos TEXT[] DEFAULT '{}',
  bio_snippet TEXT, -- 一句话定位
  importance_score INTEGER DEFAULT 0, -- 权重/高频度
  created_from TEXT, -- 从哪些对话/文本抽取
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Place（地点表）
CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lat DECIMAL(10, 8), -- 纬度
  lng DECIMAL(11, 8), -- 经度
  place_level TEXT, -- country/city/district/point
  parent_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  photos TEXT[] DEFAULT '{}',
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TimeRef（时间引用表）
CREATE TABLE IF NOT EXISTS time_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('exact', 'range', 'fuzzy')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  text TEXT NOT NULL, -- 原文："那年冬天"、"小学三年级"等
  confidence DECIMAL(3, 2) DEFAULT 0.5, -- 0.0-1.0
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Event（事件表）
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  time_ref_id UUID REFERENCES time_refs(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  evidence JSONB DEFAULT '[]', -- 原文片段数组
  importance_score INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE, -- 用户是否已确认
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Memory（回忆表）
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  time_ref_id UUID REFERENCES time_refs(id) ON DELETE SET NULL,
  snippet TEXT, -- 回忆摘要
  quote TEXT, -- 原文引用
  photos TEXT[] DEFAULT '{}',
  importance_score INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- 关联表（多对多关系）
-- ====================================

-- Event-Person 关联
CREATE TABLE IF NOT EXISTS event_people (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE CASCADE,
  role TEXT, -- 主角/配角/见证者等
  PRIMARY KEY (event_id, person_id)
);

-- Event-Place 关联
CREATE TABLE IF NOT EXISTS event_places (
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, place_id)
);

-- ====================================
-- 索引优化
-- ====================================

-- People 索引
CREATE INDEX idx_people_project ON people(project_id);
CREATE INDEX idx_people_importance ON people(importance_score DESC);
CREATE INDEX idx_people_name ON people(name);

-- Places 索引
CREATE INDEX idx_places_project ON places(project_id);
CREATE INDEX idx_places_geo ON places(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX idx_places_parent ON places(parent_place_id);

-- TimeRefs 索引
CREATE INDEX idx_time_refs_project ON time_refs(project_id);
CREATE INDEX idx_time_refs_dates ON time_refs(start_date, end_date);

-- Events 索引
CREATE INDEX idx_events_project ON events(project_id);
CREATE INDEX idx_events_time ON events(time_ref_id);
CREATE INDEX idx_events_verified ON events(verified);
CREATE INDEX idx_events_importance ON events(importance_score DESC);

-- Memories 索引
CREATE INDEX idx_memories_project ON memories(project_id);
CREATE INDEX idx_memories_person ON memories(person_id);
CREATE INDEX idx_memories_event ON memories(event_id);
CREATE INDEX idx_memories_place ON memories(place_id);
CREATE INDEX idx_memories_verified ON memories(verified);

-- ====================================
-- RLS（行级安全策略）
-- ====================================

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_places ENABLE ROW LEVEL SECURITY;

-- People 策略
CREATE POLICY "Users can view people in their projects"
ON people FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert people in their projects"
ON people FOR INSERT
TO authenticated
WITH CHECK (
  project_id IN (
    SELECT id FROM projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update people in their projects"
ON people FOR UPDATE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete people in their projects"
ON people FOR DELETE
TO authenticated
USING (
  project_id IN (
    SELECT id FROM projects WHERE owner_id = auth.uid()
  )
);

-- Places 策略（复制 People 的模式）
CREATE POLICY "Users can view places in their projects"
ON places FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert places in their projects"
ON places FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update places in their projects"
ON places FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete places in their projects"
ON places FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- TimeRefs 策略
CREATE POLICY "Users can view time_refs in their projects"
ON time_refs FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert time_refs in their projects"
ON time_refs FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update time_refs in their projects"
ON time_refs FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete time_refs in their projects"
ON time_refs FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Events 策略
CREATE POLICY "Users can view events in their projects"
ON events FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert events in their projects"
ON events FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update events in their projects"
ON events FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete events in their projects"
ON events FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Memories 策略
CREATE POLICY "Users can view memories in their projects"
ON memories FOR SELECT TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert memories in their projects"
ON memories FOR INSERT TO authenticated
WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update memories in their projects"
ON memories FOR UPDATE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete memories in their projects"
ON memories FOR DELETE TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Event-People 关联策略
CREATE POLICY "Users can manage event_people"
ON event_people FOR ALL TO authenticated
USING (
  event_id IN (
    SELECT id FROM events WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- Event-Places 关联策略
CREATE POLICY "Users can manage event_places"
ON event_places FOR ALL TO authenticated
USING (
  event_id IN (
    SELECT id FROM events WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ====================================
-- 更新时间戳触发器
-- ====================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON people
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_places_updated_at BEFORE UPDATE ON places
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON memories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
