# EverArchive 功能完整实现计划
> 基于现有架构，实现全部拟定功能的分阶段执行方案

**文档版本**: v1.0
**创建时间**: 2026-01-20
**目标**: 在不破坏现有架构的前提下，完成《ever_archive_全部拟实现功能总览.md》中的所有功能

---

## 一、现状分析（Gap Analysis）

### ✅ 已实现的功能

| 功能模块 | 完成度 | 说明 |
|---------|--------|------|
| Photos 基础系统 | 90% | 有完整的上传流程、数据库表、API、组件 |
| 照片上传流程 | 80% | 4步上传流程已实现，但缺少"关联问题"强制字段 |
| People/Family 页面 | 70% | 人物图谱、抽取、关系管理已实现 |
| 数据库架构 | 85% | 核心表已建立，部分关联逻辑需补充 |
| API Routes | 75% | 基础CRUD已完成，缺少AI抽取相关API |
| 组件库 | 80% | 照片卡片、上传进度、Masonry布局已实现 |

### ❌ 缺失的关键功能

| 功能模块 | 优先级 | 说明 |
|---------|--------|------|
| **照片5字段强制标注** | P0 | 当前上传流程缺少"关联问题"必填字段 |
| **Places 地图页面** | P0 | 完全缺失，需从零实现 |
| **Timeline 时间轴页面** | P0 | 页面存在但功能不完整 |
| **Export 照片自动插入** | P1 | Export页面存在但照片按章节插入逻辑缺失 |
| **Outline-Question 关联** | P1 | 大纲与问题的映射关系未建立 |
| **用户专属问题系统** | P1 | 当前所有问题都是全局的 |
| **AI 地点抽取** | P2 | 从回答中抽取地点的Edge Function缺失 |
| **AI 时间轴事实抽取** | P2 | 从回答中抽取时间事件的Edge Function缺失 |

---

## 二、架构设计原则

### 2.1 数据一致性原则

> **照片的5个核心字段必须在所有入口保持一致**

无论从哪个页面上传（Main / Photos / Places），照片对象必须包含：

1. `linked_question_id` - 关联问题
2. `people_ids[]` - 人物
3. `time` - 时间
4. `place_id` - 地点
5. `caption` - 一句话描述

### 2.2 数据复用原则

> **People、Places 是全局实体，可被多张照片、多个回答复用**

- 不在照片表中存储人物名字，而是存储 `people_ids[]`
- 不在照片表中存储地点文本，而是存储 `place_id`
- 所有实体通过ID引用，确保修改时全局生效

### 2.3 数据溯源原则

> **所有衍生数据（大纲、Export）必须可回溯到原始数据源（Question/Answer/Photo）**

- Outline Chapter → Questions[] 映射
- Timeline Node → Question/Photo 映射
- Export Photo → Question → Chapter 映射

---

## 三、分阶段实施计划

### 🎯 Phase 1: 核心数据模型修复（P0，1-2天）

**目标**: 确保照片5字段模型在数据库和代码中完整实现

#### 1.1 数据库Schema修改

**文件**: `supabase/migrations/20260121000000_photo_5_fields_enforcement.sql`

```sql
-- 1. 确保 photo_memories 表有所有必需字段
ALTER TABLE photo_memories
  ADD COLUMN IF NOT EXISTS linked_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS time_taken TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_precision TEXT CHECK (time_precision IN ('exact', 'year', 'month', 'range', 'fuzzy')),
  ADD COLUMN IF NOT EXISTS place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS caption TEXT;

-- 2. 添加约束和索引
CREATE INDEX idx_photo_memories_question ON photo_memories(linked_question_id);
CREATE INDEX idx_photo_memories_time ON photo_memories(time_taken);
CREATE INDEX idx_photo_memories_place ON photo_memories(place_id);

-- 3. 创建视图：未完成标注的照片
CREATE OR REPLACE VIEW incomplete_photos AS
SELECT
  id,
  user_id,
  url,
  CASE
    WHEN linked_question_id IS NULL THEN 'missing_question'
    WHEN NOT EXISTS (SELECT 1 FROM photo_people WHERE photo_id = photo_memories.id) THEN 'missing_people'
    WHEN time_taken IS NULL THEN 'missing_time'
    WHEN place_id IS NULL THEN 'missing_place'
    WHEN caption IS NULL OR caption = '' THEN 'missing_caption'
    ELSE 'complete'
  END as missing_field
FROM photo_memories
WHERE project_id IS NOT NULL;
```

#### 1.2 TypeScript类型更新

**文件**: `lib/types/photos.ts`

```typescript
export interface PhotoMetadata {
  // 现有字段...

  // 5个必填字段
  linked_question_id: string        // UUID
  people_ids: string[]               // UUID[]
  time_taken: string | null          // ISO timestamp
  time_precision: 'exact' | 'year' | 'month' | 'range' | 'fuzzy'
  place_id: string | null            // UUID
  caption: string                    // 一句话描述
}

export interface PhotoUploadAnnotation {
  questionId: string                 // 必填
  peopleIds: string[]                // 必填
  timeTaken: Date | null             // 必填
  timePrecision: string              // 必填
  placeId: string | null             // 必填
  caption: string                    // 强烈建议
}
```

#### 1.3 修改上传流程

**文件**: `app/photos/new/page.tsx`

需要添加：
- Step 0.5: 选择关联问题（在上传照片后立即出现）
- 验证逻辑：5个字段都填写后才能保存

---

### 🎯 Phase 2: Places 地图页面（P0，3-5天）

**目标**: 实现完整的Places地图功能

#### 2.1 数据库Schema

**文件**: `supabase/migrations/20260121000001_places_map_system.sql`

```sql
-- 1. 扩展 places 表
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'manual' CHECK (provider IN ('manual', 'google', 'osm')),
  ADD COLUMN IF NOT EXISTS external_place_id TEXT; -- Google Place ID 或 OSM ID

-- 2. 地点抽取记录表（从回答中抽取）
CREATE TABLE IF NOT EXISTS answer_place_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_session_id UUID REFERENCES answer_sessions(id) ON DELETE CASCADE,

  place_text TEXT NOT NULL,              -- 原文提到的地点
  evidence_snippet TEXT,                 -- 证据片段
  confidence DECIMAL(3, 2) DEFAULT 0.5,  -- 0.0-1.0

  resolved_place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'needs_review' CHECK (status IN ('needs_review', 'confirmed', 'rejected')),

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 地图标记表（统一照片和回答的地点）
CREATE TABLE IF NOT EXISTS place_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,

  source_type TEXT NOT NULL CHECK (source_type IN ('photo', 'answer', 'manual')),
  source_ref_id UUID,  -- photo_id 或 answer_extract_id

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_answer_place_extracts_project ON answer_place_extracts(project_id);
CREATE INDEX idx_answer_place_extracts_question ON answer_place_extracts(question_id);
CREATE INDEX idx_place_markers_project ON place_markers(project_id);
CREATE INDEX idx_place_markers_place ON place_markers(place_id);

-- RLS
ALTER TABLE answer_place_extracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage place_extracts in their projects"
ON answer_place_extracts FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can manage place_markers in their projects"
ON place_markers FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
```

#### 2.2 Edge Function: 地点抽取

**文件**: `supabase/functions/extract_places/index.ts`

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

interface ExtractedPlace {
  place_text: string
  evidence_snippet: string
  confidence: number
  inferred_lat?: number
  inferred_lng?: number
}

Deno.serve(async (req) => {
  // 类似 extract_people 的逻辑
  // 1. 读取 answer_sessions
  // 2. 调用 Gemini 抽取地点
  // 3. 尝试 geocoding（通过 Google Maps API）
  // 4. 写入 answer_place_extracts 表
  // 5. 返回结果
})
```

#### 2.3 前端页面

**文件**: `app/places/page.tsx` (重写现有页面)

关键功能：
- 集成 Google Maps 或 Leaflet
- 显示两类标记：照片标记（蓝色）、回答标记（黄色）
- 点击标记显示 Drawer：照片列表 + 相关回答
- 搜索地点 + 上传照片入口
- 地点编辑/纠错功能

---

### 🎯 Phase 3: Timeline 时间轴页面（P0，3-5天）

**目标**: 实现可浏览的人生时间轴

#### 3.1 数据库Schema

**文件**: `supabase/migrations/20260121000002_timeline_system.sql`

```sql
-- 1. 用户档案（出生日期）
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birth_year INTEGER;

-- 2. 时间轴事实抽取表
CREATE TABLE IF NOT EXISTS timeline_fact_extracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_session_id UUID REFERENCES answer_sessions(id) ON DELETE CASCADE,

  quote TEXT NOT NULL,                    -- 原文引用
  summary TEXT,                           -- 摘要

  inferred_time_start TIMESTAMPTZ,        -- 推断的开始时间
  inferred_time_end TIMESTAMPTZ,          -- 推断的结束时间
  time_precision TEXT CHECK (time_precision IN ('exact', 'year', 'month', 'range', 'age', 'fuzzy')),

  age_mentioned INTEGER,                  -- 如果原文提到年龄
  stage_mentioned TEXT,                   -- 如果原文提到阶段（如"小学时"）

  confidence DECIMAL(3, 2) DEFAULT 0.5,
  status TEXT DEFAULT 'inferred' CHECK (status IN ('inferred', 'confirmed', 'needs_review')),

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 统一时间轴节点视图（照片 + 事实）
CREATE OR REPLACE VIEW timeline_nodes AS
-- 照片节点
SELECT
  'photo' as node_type,
  pm.id as source_id,
  pm.project_id,
  pm.time_taken as time_start,
  NULL as time_end,
  pm.time_precision,
  pm.caption as content,
  pm.linked_question_id as question_id,
  1.0 as confidence,
  pm.created_at
FROM photo_memories pm
WHERE pm.time_taken IS NOT NULL

UNION ALL

-- 事实节点
SELECT
  'fact' as node_type,
  tfe.id as source_id,
  tfe.project_id,
  tfe.inferred_time_start as time_start,
  tfe.inferred_time_end as time_end,
  tfe.time_precision,
  tfe.quote as content,
  tfe.question_id,
  tfe.confidence,
  tfe.created_at
FROM timeline_fact_extracts tfe

ORDER BY time_start ASC NULLS LAST;

-- 索引
CREATE INDEX idx_timeline_fact_extracts_project ON timeline_fact_extracts(project_id);
CREATE INDEX idx_timeline_fact_extracts_time ON timeline_fact_extracts(inferred_time_start);

-- RLS
ALTER TABLE timeline_fact_extracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage timeline_facts in their projects"
ON timeline_fact_extracts FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
```

#### 3.2 Edge Function: 时间轴事实抽取

**文件**: `supabase/functions/extract_timeline_facts/index.ts`

逻辑：
1. 读取 answer_sessions
2. 调用 Gemini 提取时间表达式（年龄、日期、阶段）
3. 如果用户提供了出生日期，将年龄转换为年份
4. 写入 timeline_fact_extracts 表

#### 3.3 前端页面

**文件**: `app/timeline/page.tsx` (重写现有页面)

关键功能：
- 纵向时间轴（可缩放）
- 左侧：Facts，右侧：Photos
- 点击节点可查看详情、跳转到问题
- 编辑时间/确认节点
- 按时间范围筛选

---

### 🎯 Phase 4: Outline-Question 关联系统（P1，2-3天）

**目标**: 建立大纲章节与问题的映射关系

#### 4.1 数据库Schema

**文件**: `supabase/migrations/20260121000003_outline_question_links.sql`

```sql
-- 1. 章节-问题关联表
CREATE TABLE IF NOT EXISTS chapter_question_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  outline_version_id UUID,  -- 指向某一版大纲
  chapter_id TEXT NOT NULL, -- 章节标识（可以是outline_json中的key）
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,

  order_in_chapter INTEGER DEFAULT 0,
  weight DECIMAL(3, 2) DEFAULT 1.0,  -- 该问题在该章节的权重

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(outline_version_id, chapter_id, question_id)
);

CREATE INDEX idx_chapter_question_links_project ON chapter_question_links(project_id);
CREATE INDEX idx_chapter_question_links_outline ON chapter_question_links(outline_version_id);
CREATE INDEX idx_chapter_question_links_chapter ON chapter_question_links(chapter_id);
CREATE INDEX idx_chapter_question_links_question ON chapter_question_links(question_id);

-- RLS
ALTER TABLE chapter_question_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage chapter_question_links in their projects"
ON chapter_question_links FOR ALL TO authenticated
USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- 2. 触发器：大纲生成后自动创建 chapter_question_links
-- 这部分逻辑可以在 Edge Function 中实现
```

#### 4.2 修改大纲生成逻辑

**文件**: `supabase/functions/generate_biography_outline/index.ts`

在生成大纲时：
1. 生成 outline_json
2. 对每个章节，明确列出 `questions: [q1_id, q2_id, ...]`
3. 写入 `chapter_question_links` 表

#### 4.3 API Route

**文件**: `app/api/outline/chapter-questions/route.ts`

```typescript
// GET /api/outline/chapter-questions?outlineVersionId=xxx&chapterId=xxx
// 返回该章节关联的所有问题

// POST /api/outline/chapter-questions
// 手动添加/移除问题到章节
```

---

### 🎯 Phase 5: Export 照片自动插入（P1，2-3天）

**目标**: 在生成书稿时，根据章节自动插入相关照片

#### 5.1 照片插入逻辑

**文件**: `app/export/page.tsx` 或相关生成逻辑

伪代码：
```typescript
async function generateBookWithPhotos(outlineVersionId: string) {
  const outline = await getOutlineVersion(outlineVersionId)

  for (const chapter of outline.chapters) {
    // 1. 获取章节关联的问题
    const questionIds = await getChapterQuestions(chapter.id)

    // 2. 查询这些问题关联的照片
    const photos = await getPhotosByQuestions(questionIds)

    // 3. 筛选照片（最多N张，优先caption完整的）
    const selectedPhotos = selectPhotosForChapter(photos, {
      maxCount: 5,
      priorityCriteria: ['has_caption', 'high_people_count', 'recent_upload']
    })

    // 4. 插入到章节内容中
    chapter.photos = selectedPhotos
  }

  // 生成PDF/EPUB
  return generateBook(outline)
}
```

#### 5.2 照片插入策略配置

可以在 Export 页面提供配置选项：
- 每章最多照片数
- 插入位置（章首/章中/章尾）
- 优先级规则

---

### 🎯 Phase 6: 用户专属问题系统（P1，2-3天）

**目标**: 支持AI生成的follow-up问题，只对特定用户可见

#### 6.1 数据库Schema

**文件**: `supabase/migrations/20260121000004_user_specific_questions.sql`

```sql
-- 1. 修改 questions 表
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'global' CHECK (scope IN ('global', 'user')),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'system' CHECK (created_by IN ('system', 'ai', 'user'));

-- 2. 索引
CREATE INDEX idx_questions_scope ON questions(scope);
CREATE INDEX idx_questions_owner ON questions(owner_user_id);
CREATE INDEX idx_questions_parent ON questions(parent_question_id);

-- 3. RLS (修改现有策略)
-- 全局问题：所有人可见
-- 用户问题：只有owner可见

DROP POLICY IF EXISTS "Users can view questions" ON questions;

CREATE POLICY "Users can view global and own questions"
ON questions FOR SELECT TO authenticated
USING (
  scope = 'global'
  OR (scope = 'user' AND owner_user_id = auth.uid())
);

CREATE POLICY "Users can insert their own questions"
ON questions FOR INSERT TO authenticated
WITH CHECK (
  scope = 'user' AND owner_user_id = auth.uid()
);
```

#### 6.2 Edge Function: 生成Follow-up问题

**文件**: `supabase/functions/generate_followup_questions/index.ts`

逻辑：
1. 读取用户已回答的某个问题
2. 分析回答内容，找出需要深挖的点
3. 调用 Gemini 生成2-3个follow-up问题
4. 写入 questions 表，设置：
   - `scope = 'user'`
   - `owner_user_id = current_user_id`
   - `parent_question_id = original_question_id`
   - `created_by = 'ai'`

#### 6.3 Main 页面修改

**文件**: `app/main/page.tsx`

加载问题列表时：
```typescript
const questions = await supabase
  .from('questions')
  .select('*')
  .or(`scope.eq.global,and(scope.eq.user,owner_user_id.eq.${userId})`)
  .order('created_at')
```

---

### 🎯 Phase 7: UI/UX 优化（P2，持续进行）

#### 7.1 照片上传流程优化

- 添加进度指示器（5个字段是否完成）
- 提供"保存草稿"功能（部分标注也能保存）
- 批量操作（一次为多张照片标注相同的地点/人物）

#### 7.2 Photos 页面增强

- 添加"未完成标注"筛选器
- 显示每张照片缺失哪些字段
- 提供快捷编辑入口

#### 7.3 Family 页面增强

- 从大纲和照片同时抽取人物，合并去重
- 显示人物来源（大纲/照片/手动添加）
- 人物合并功能（解决重复人物问题）

---

## 四、技术实现细节

### 4.1 AI 抽取的统一框架

所有AI抽取（人物/地点/时间轴事实）共享相同的模式：

```typescript
// 通用抽取接口
interface AIExtractTask {
  projectId: string
  sourceType: 'outline' | 'answers'
  extractType: 'people' | 'places' | 'timeline_facts'
}

interface ExtractResult {
  success: boolean
  extracted: number
  newEntries: number
  updatedEntries: number
  errors?: string[]
}
```

### 4.2 地图集成方案

推荐使用 **Leaflet + OpenStreetMap**（免费）：

```typescript
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'

// 优点：
// - 免费，无API配额限制
// - 轻量级，性能好
// - 支持自定义标记

// 如需地点搜索（Autocomplete），可使用：
// - Nominatim API（OSM官方，免费）
// - Google Places API（付费，但更准确）
```

### 4.3 时间轴可视化方案

推荐使用 **vis-timeline** 或 **react-timeline-vis**：

```typescript
import Timeline from 'react-vis-timeline'

const items = [
  {
    id: 1,
    content: '出生',
    start: '1998-01-01',
    type: 'point'
  },
  {
    id: 2,
    content: '上小学',
    start: '2005-09-01',
    end: '2011-06-30',
    type: 'range'
  }
]
```

### 4.4 PDF生成照片插入

已有 `vivliostyleBookGenerator`，扩展逻辑：

```typescript
function generateChapterHTML(chapter: Chapter) {
  let html = `<h2>${chapter.title}</h2>`

  // 插入照片
  if (chapter.photos && chapter.photos.length > 0) {
    html += '<div class="chapter-photos">'
    for (const photo of chapter.photos) {
      html += `
        <figure>
          <img src="${photo.url}" alt="${photo.caption}" />
          <figcaption>${photo.caption}</figcaption>
        </figure>
      `
    }
    html += '</div>'
  }

  html += `<p>${chapter.content}</p>`
  return html
}
```

---

## 五、数据迁移计划

### 5.1 现有数据兼容性

**问题**: 现有照片可能没有 `linked_question_id`、`time_taken`、`place_id` 等字段

**解决方案**:

#### 方案A：数据修复脚本

```sql
-- 1. 为现有照片生成默认值
UPDATE photo_memories
SET
  time_taken = created_at,  -- 使用上传时间作为默认
  time_precision = 'fuzzy'
WHERE time_taken IS NULL;

-- 2. 标记需要用户补全的照片
UPDATE photo_memories
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'),
  '{needs_annotation}',
  'true'
)
WHERE linked_question_id IS NULL
   OR place_id IS NULL;
```

#### 方案B：渐进式迁移

- 不强制要求旧照片补全5字段
- 但新上传的照片必须补全
- 在 Photos 页面提示用户"X张照片需要补全标注"

### 5.2 测试数据准备

为测试各功能，需要准备：

1. **种子问题**（10-20个，涵盖童年/青年/工作/家庭）
2. **示例回答**（包含地点/时间表达式）
3. **示例照片**（有人物/地点/时间标签）

---

## 六、开发里程碑

### Week 1: 核心数据模型

- [ ] Day 1-2: 数据库Schema修改 + 类型定义
- [ ] Day 3-4: 照片上传流程修复（添加问题选择）
- [ ] Day 5-7: 测试 + 数据迁移脚本

### Week 2: Places 地图

- [ ] Day 1-2: Places数据库表 + Edge Function
- [ ] Day 3-5: 前端地图页面（Leaflet集成）
- [ ] Day 6-7: 地点搜索 + 照片上传入口

### Week 3: Timeline 时间轴

- [ ] Day 1-2: Timeline数据库表 + Edge Function
- [ ] Day 3-5: 前端时间轴页面
- [ ] Day 6-7: 年龄推算 + 节点编辑

### Week 4: Export + Outline 联动

- [ ] Day 1-2: Outline-Question关联系统
- [ ] Day 3-4: Export照片自动插入
- [ ] Day 5-7: 用户专属问题系统

### Week 5: 优化与测试

- [ ] 端到端测试
- [ ] 性能优化
- [ ] UI/UX打磨
- [ ] 文档更新

---

## 七、风险与挑战

### 7.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 地图API配额超限 | 高 | 使用OSM（免费）+ 缓存地理编码结果 |
| AI抽取准确率低 | 中 | 提供纠错机制 + 置信度标记 |
| 照片加载性能问题 | 中 | 缩略图 + 懒加载 + CDN |
| 数据库查询性能 | 低 | 添加索引 + 使用视图 |

### 7.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 用户不愿意标注5字段 | 高 | 简化流程 + 智能推荐 + 批量操作 |
| 旧数据迁移困难 | 中 | 渐进式迁移 + 宽容策略 |
| 功能过于复杂 | 中 | 分阶段发布 + 引导教程 |

---

## 八、成功指标

### 8.1 技术指标

- [ ] 照片5字段完成率 > 80%
- [ ] Places地图标记覆盖率 > 60%
- [ ] Timeline节点准确率 > 70%
- [ ] Export照片自动插入成功率 > 90%

### 8.2 用户体验指标

- [ ] 照片上传流程完成率 > 85%
- [ ] Places页面平均停留时间 > 2分钟
- [ ] Timeline页面交互次数 > 10次/会话

---

## 九、下一步行动

### 立即执行（今天）

1. ✅ Review这份计划文档
2. ⏳ 创建 Phase 1 的数据库迁移文件
3. ⏳ 修改 `photo_memories` 表结构
4. ⏳ 更新 TypeScript 类型定义

### 本周内完成

- Phase 1: 核心数据模型修复
- 准备测试数据

### 两周内完成

- Phase 2: Places 地图页面
- Phase 3: Timeline 时间轴页面

---

**文档结束**

如有疑问或需要调整优先级，请随时反馈。
