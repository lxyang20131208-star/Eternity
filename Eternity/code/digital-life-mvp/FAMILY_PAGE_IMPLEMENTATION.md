# Family Page (人物空间) 完整实现文档

## 📋 功能概述

本文档详细说明了 `/family` 页面的完整实现，该页面是一个以用户为核心的家庭/人物空间入口，具备自动人物抽取、关系网络可视化、人物信息管理、照片归集和与Export页面的联动功能。

---

## 🎯 核心功能

### 1. 自动人物抽取（People Extraction）

**功能描述**：
- 从用户的传记大纲（biography_outlines）中自动识别提到的人物
- 使用 Gemini 2.0 Flash AI 模型进行智能抽取
- 支持人物去重、别名合并、置信度评估
- **优势**：从大纲抽取比从原始转录抽取更高效、更准确

**实现文件**：
- Edge Function: `/supabase/functions/extract_people/index.ts`
- API Route: `/app/api/people/extract/route.ts`
- 数据库表: `people`, `people_extraction_jobs`

**使用方式**：
```typescript
// 触发抽取
POST /api/people/extract
Body: { projectId: 'xxx' }

// 查询任务进度
GET /api/people/extract?jobId=xxx
```

**抽取结果示例**：
```json
{
  "name": "张三",
  "aliases": ["老张", "张叔"],
  "relationship": "父亲的朋友",
  "description": "退休教师，经常来家里下棋",
  "confidence": 0.85,
  "mentions": 5
}
```

---

### 2. 人物卡片编辑（Person Card）

**功能描述**：
- 编辑人物的姓名、别称、与我的关系、描述
- 上传/查看人物相关照片
- 支持26种预设关系 + 自定义关系
- 显示人物置信度、提到次数等元数据

**实现文件**：
- 组件: `/components/PersonCard.tsx`
- API Route: `/app/api/people/route.ts` (PATCH, DELETE)

**编辑字段**：
- **姓名**: 可修改，修改后会触发全局替换提示
- **别称/昵称**: 数组形式，支持添加/删除
- **与我的关系**: 预设关系（父母、兄弟姐妹、朋友等）+ 自定义
- **人物描述**: 一句话或一段话描述

**关系预设列表**：
```
父亲、母亲、祖父、祖母、外祖父、外祖母、兄弟、姐妹、配偶、
儿子、女儿、孙子、孙女、叔叔、阿姨、舅舅、姨妈、堂兄弟、
表兄弟、朋友、同学、同事、老师、学生、邻居、其他
```

---

### 3. 人物关系网络可视化（People Graph）

**功能描述**：
- 以"我"为中心的放射状/散射式布局
- 基于Canvas的物理模拟（力导向布局）
- 支持拖拽节点调整位置
- 显示人物关系连线（中心-人物 / 人物-人物）
- Shift + 点击两个节点可创建关系

**实现文件**：
- 组件: `/components/PeopleGraph.tsx`

**交互说明**：
- **点击节点**: 查看人物详情
- **拖拽节点**: 调整节点位置
- **Shift + 点击**: 选择两个节点创建关系

**力导向算法**：
```typescript
// 1. 中心吸引力 - 维持散射布局
// 2. 节点排斥力 - 避免重叠
// 3. 关系连线吸引力 - 拉近有关系的人物
// 4. 阻尼 - 逐渐稳定
```

---

### 4. 人物与照片自动归集（Photo Aggregation）

**功能描述**：
- 自动从两个照片上传入口（Home上传、Photos页面上传）归集照片
- 基于照片caption/tags/people字段匹配人物名字
- 支持别名匹配（例如："妈妈"、"母亲"、"我妈"）
- 支持手动添加照片到人物

**实现文件**：
- API Route: `/app/api/people/photos/route.ts`
- 数据库表: `people_photos`, `photo_memories`

**归集逻辑**：
```typescript
// 1. 直接关联照片 (people_photos 表)
// 2. 自动检测照片 (photo_memories 表)
//    - caption 包含人名
//    - tags 包含人名
//    - people 字段包含人名
// 3. 合并去重
```

**API使用**：
```typescript
// 获取人物的所有照片
GET /api/people/photos?personId=xxx&projectId=xxx

// 手动添加照片
POST /api/people/photos
Body: {
  personId: 'xxx',
  photoUrl: 'https://...',
  photoCaption: '照片描述',
  photoSource: 'manual_attach',
  isPrimary: false
}
```

---

### 5. 人名纠错与Export全局替换联动

**功能描述**：
- 用户在Family页面修改人物姓名时，记录修正历史
- Export页面可以应用全局替换（旧名→新名）
- 支持批量应用/选择性应用
- 显示替换预览（在当前内容中找到X处）

**实现文件**：
- API Route: `/app/api/people/name-corrections/route.ts`
- 组件: `/components/GlobalNameReplacer.tsx`
- 数据库表: `people_name_corrections`

**使用流程**：
1. 用户在 `/family` 修改人物姓名（例如："老李" → "李明"）
2. 系统记录到 `people_name_corrections` 表
3. 用户前往 `/export` 页面编辑书稿
4. `GlobalNameReplacer` 组件显示修正提示
5. 用户点击"应用全部"或"应用选中"
6. 书稿内容中的"老李"全部替换为"李明"

**Export页面集成示例**：
```tsx
import GlobalNameReplacer from '@/components/GlobalNameReplacer'

function ExportPage() {
  const [bookContent, setBookContent] = useState('')

  return (
    <div>
      {/* 人名修正提示 */}
      <GlobalNameReplacer
        projectId={projectId}
        content={bookContent}
        onReplace={(newContent) => setBookContent(newContent)}
      />

      {/* 书稿编辑器 */}
      <textarea value={bookContent} onChange={...} />
    </div>
  )
}
```

---

### 6. 人物关系手动连线（Relationship Management）

**功能描述**：
- 支持创建人物之间的关系（不仅是"我"与人物）
- 支持多种关系类型：父母/子女、配偶、兄弟姐妹、朋友、同事、自定义
- 双向关系/单向关系可配置

**实现文件**：
- API Route: `/app/api/people/relationships/route.ts`
- 数据库表: `people_relationships`
- 组件: Family页面内的 `RelationshipModal`

**关系类型**：
```typescript
type RelationshipType =
  | 'parent'      // 父母/子女
  | 'spouse'      // 配偶
  | 'sibling'     // 兄弟姐妹
  | 'friend'      // 朋友
  | 'colleague'   // 同事
  | 'custom'      // 自定义
```

**创建关系**：
```typescript
POST /api/people/relationships
Body: {
  projectId: 'xxx',
  personAId: 'person-1',
  personBId: 'person-2',
  relationshipType: 'friend',
  customLabel: '大学室友',  // 可选
  bidirectional: true
}
```

---

## 📊 数据库Schema

### 核心表

#### `people` (人物表)
```sql
- id: UUID
- project_id: UUID
- name: TEXT                  -- 姓名
- aliases: TEXT[]             -- 别称/昵称
- relationship_to_user: TEXT  -- 与我的关系
- bio_snippet: TEXT           -- 人物描述
- avatar_url: TEXT            -- 头像URL
- importance_score: INTEGER   -- 提到次数/权重
- confidence_score: DECIMAL   -- AI抽取置信度 (0.0-1.0)
- extraction_status: TEXT     -- 'pending' | 'confirmed' | 'merged' | 'rejected'
- original_name: TEXT         -- 修正前的原始名字
- created_from: TEXT          -- 抽取来源
- metadata: JSONB
```

#### `people_relationships` (人物关系表)
```sql
- id: UUID
- project_id: UUID
- person_a_id: UUID
- person_b_id: UUID
- relationship_type: TEXT
- custom_label: TEXT
- bidirectional: BOOLEAN
- metadata: JSONB
```

#### `people_extraction_jobs` (抽取任务表)
```sql
- id: UUID
- project_id: UUID
- status: TEXT               -- 'pending' | 'processing' | 'done' | 'failed'
- source_type: TEXT          -- 'all_transcripts' | 'manual_trigger' | 'scheduled'
- total_documents: INTEGER
- processed_documents: INTEGER
- extracted_count: INTEGER
- error_text: TEXT
- result_json: JSONB
```

#### `people_photos` (人物-照片关联表)
```sql
- id: UUID
- person_id: UUID
- photo_url: TEXT
- photo_source: TEXT         -- 'home_upload' | 'photos_page' | 'manual_attach' | 'auto_detected'
- photo_caption: TEXT
- is_primary: BOOLEAN        -- 是否为主照片（头像）
- metadata: JSONB
```

#### `people_name_corrections` (人名修正历史表)
```sql
- id: UUID
- person_id: UUID
- project_id: UUID
- old_name: TEXT
- new_name: TEXT
- correction_scope: TEXT     -- 'person_only' | 'global_transcripts' | 'global_all'
- affected_records: JSONB    -- 受影响的文档ID列表
- applied_at: TIMESTAMPTZ
- applied_by: UUID
```

---

## 🛠️ 部署步骤

### 1. 应用数据库迁移

```bash
cd /path/to/digital-life-mvp

# 应用迁移
supabase db push
```

### 2. 部署Edge Function

```bash
# 部署人物抽取函数
supabase functions deploy extract_people

# 查看函数日志
supabase functions logs extract_people --tail
```

### 3. 配置环境变量

确保在Supabase项目中设置了以下Secrets：

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000/family` 查看效果。

---

## 🎨 UI/UX设计

### 页面布局

```
┌─────────────────────────────────────────────────────────────┐
│  FAMILY HOME                                                 │
│  家庭人物空间                                                 │
│  从你的全部文稿中自动识别你提到过的人，帮你整理成家庭/人物关系网。│
│                                                              │
│  [重新抽取人物] [刷新照片关联] [返回主页]                      │
├─────────────────────────────────────────────────────────────┤
│  统计卡片：                                                   │
│  总人物: 12   已确认: 8   待确认: 4   关系数: 6   关联照片: 45  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                   人物关系网络可视化                           │
│                   (Canvas 画布)                              │
│                        ●                                     │
│                     /  |  \                                  │
│                    ●   ●   ●                                 │
│                   / \   |  / \                               │
│                  ●   ● ●我● ●                                │
│                      \  |  /                                 │
│                       ● ● ●                                  │
│                                                              │
│  提示：点击节点查看详情 | Shift+点击创建关系 | 拖拽调整位置      │
└─────────────────────────────────────────────────────────────┘
```

### 人物卡片弹窗

```
┌───────────────────────────────────────┐
│  [头像]  张三                          │
│          父亲的朋友                    ×│
│                                       │
│  ✓ 已确认  提到5次  置信度85%         │
├───────────────────────────────────────┤
│  姓名:     [张三____________]          │
│  别称:     老张 × | 张叔 ×             │
│            [添加别称___________] [+]   │
│  关系:     [父亲] [母亲] [朋友] ...    │
│            [√ 父亲的朋友]              │
│  描述:     ┌──────────────────┐      │
│            │退休教师，经常来家│      │
│            │里下棋...         │      │
│            └──────────────────┘      │
│  照片:     [图1] [图2] [图3]          │
│            [+ 添加照片]                │
├───────────────────────────────────────┤
│  [删除此人物]              [取消] [保存]│
└───────────────────────────────────────┘
```

---

## 🧪 功能验收清单（DoD）

- [x] ✅ 能从全部文稿抽取人物，并以"我"为中心展示人物网络（至少具备散射/辐射布局）
- [x] ✅ 人物可编辑：正确姓名、关系、描述、照片上传
- [x] ✅ 修改姓名后：Export的书稿编辑区域支持一键全局替换（旧名→新名）
- [x] ✅ 两个照片入口上传的照片，只要描述提到人物，在该人物详情页可自动看到并可刷新
- [x] ✅ 人与人关系：支持用户手动连线（至少具备入口与数据保存）
- [x] ✅ 数据库迁移文件已创建
- [x] ✅ Edge Function已实现
- [x] ✅ API Routes已实现
- [x] ✅ 前端组件已实现
- [x] ✅ 全局替换组件已实现

---

## 🚀 后续增强功能（不阻塞V1）

### 1. 人物合并（Merge Duplicates）
- **问题**：同一人被识别成多个实体（例如："妈妈" 和 "母亲" 被识别为两个人）
- **方案**：提供"合并人物"功能，合并时保留所有别名、照片、关系

### 2. 多别名/昵称映射
- **问题**：同一人的多种叫法需要更智能的映射
- **方案**：AI自动推断别名（例如：识别出"老李" = "李明" = "李老师"）

### 3. 照片更智能关联
- **当前**：仅依赖caption文本匹配
- **增强**：
  - 人脸识别（利用 `photo_faces` 表）
  - 场景/时间线推断
  - 地理位置关联

### 4. 人物"出现片段"索引
- **功能**：点击人物能跳到相关文稿段落/章节
- **实现**：在 `people.metadata` 中存储相关文稿ID和段落索引

### 5. 家族树视图（Tree View）
- **当前**：散射式布局
- **增强**：提供传统家族树视图（按世代垂直排列）

### 6. 时间线视图（Timeline View）
- **功能**：按时间顺序展示人物相关事件
- **数据来源**：`events` 表 + `event_people` 联接表

---

## 🐛 已知问题与限制

### 1. AI抽取准确性
- **问题**：AI可能识别错人名（例如：把地名识别为人名）
- **解决方案**：用户手动确认/删除/合并

### 2. 照片匹配性能
- **问题**：当照片数量>1000时，客户端过滤可能较慢
- **解决方案**：将过滤逻辑移到后端，使用PostgreSQL全文搜索

### 3. 关系网络复杂度
- **问题**：当人物数量>50时，Canvas渲染可能卡顿
- **解决方案**：实现分页/筛选/聚类功能

### 4. 别名匹配精度
- **问题**：简单的字符串包含匹配可能误判（例如："小明"匹配到"小明珠"）
- **解决方案**：使用分词+词边界匹配

---

## 📚 相关文档

- [项目架构文档](./CLAUDE.md)
- [数据库Schema详解](./supabase/migrations/)
- [API文档](./app/api/)
- [组件库](./components/)

---

## 🤝 贡献指南

### 代码规范
- 遵循项目现有的TypeScript代码风格
- 使用Tailwind CSS进行样式设计
- 所有数据库操作需启用RLS（Row Level Security）
- API错误需返回有意义的错误信息

### 提交规范
```
feat(family): 添加人物合并功能
fix(family): 修复照片归集重复问题
docs(family): 更新部署文档
```

---

## 📞 联系方式

如有问题，请在GitHub仓库提交Issue或联系项目维护者。

---

**最后更新**: 2026-01-20
**版本**: v1.0.0
