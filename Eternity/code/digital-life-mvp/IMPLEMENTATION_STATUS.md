# EverArchive 功能实现状态报告
> 基于《ever_archive_全部拟实现功能总览.md》的实施进展

**生成时间**: 2026-01-20
**当前阶段**: Phase 1 - 核心数据模型修复

---

## ✅ 已完成的工作

### 1. 需求分析与规划

- ✅ 完整阅读并理解需求文档（836行）
- ✅ 分析现有代码库架构（数据库、API、前端组件、页面）
- ✅ 识别功能差距（Gap Analysis）
- ✅ 制定7阶段实施计划

**输出文档**:
- `IMPLEMENTATION_PLAN.md` - 完整实施计划（830+行）

### 2. Phase 1: 核心数据模型修复

#### 2.1 数据库Schema（✅ 已完成）

**文件**: `supabase/migrations/20260121000000_photo_5_fields_enforcement.sql`

关键内容：
- ✅ 扩展 `photo_memories` 表，添加5个核心字段
- ✅ 创建 `incomplete_photos` 视图（显示缺失字段）
- ✅ 创建 `photo_annotation_stats` 视图（统计完成度）
- ✅ 创建自动更新触发器（`annotation_status`）
- ✅ 创建 `batch_update_photo_annotations()` 函数（批量操作）
- ✅ 创建 `photo_annotation_reminders` 表（提醒系统）
- ✅ 数据迁移逻辑（处理现有照片）
- ✅ 索引优化（加速查询）

#### 2.2 TypeScript类型定义（✅ 已完成）

**文件**: `lib/types/photos.ts`

新增类型：
- ✅ `PhotoUploadAnnotation` - 上传时的标注数据
- ✅ `IncompletePhoto` - 未完成标注的照片
- ✅ `PhotoAnnotationStats` - 标注统计
- ✅ `PhotoAnnotationReminder` - 提醒记录

修改类型：
- ✅ `PhotoMetadata` - 添加5字段元数据

---

## ⏳ 进行中的工作

### 3. Phase 1 剩余任务

- ⏳ 修改照片上传流程（`app/photos/new/page.tsx`）
  - 添加 Step 0.5: 选择关联问题
  - 更新表单验证逻辑
  - 集成5字段强制检查

- ⏳ 创建API Route: `/api/photos/annotation-stats`
  - 读取 `photo_annotation_stats` 视图
  - 返回项目级别的标注统计

- ⏳ 创建API Route: `/api/photos/reminders`
  - 管理照片标注提醒
  - 支持创建、更新、dismiss操作

- ⏳ 测试数据库迁移
  - 应用迁移：`supabase db push`
  - 验证视图和触发器正常工作
  - 测试现有数据的迁移结果

---

## 📋 待办事项（按优先级）

### Phase 2: Places 地图页面（P0，3-5天）

**数据库**:
- [ ] 创建迁移文件 `20260121000001_places_map_system.sql`
- [ ] 扩展 `places` 表（添加geocoding字段）
- [ ] 创建 `answer_place_extracts` 表
- [ ] 创建 `place_markers` 表

**Edge Function**:
- [ ] 实现 `supabase/functions/extract_places/index.ts`
- [ ] 集成 Gemini AI 地点抽取
- [ ] 集成 Google Maps Geocoding API（或 Nominatim）

**前端**:
- [ ] 重写 `app/places/page.tsx`
- [ ] 集成地图库（Leaflet + OpenStreetMap）
- [ ] 实现地点搜索（Autocomplete）
- [ ] 实现照片上传入口（选中地点后上传）
- [ ] 实现Place Drawer（点击标记显示详情）

### Phase 3: Timeline 时间轴页面（P0，3-5天）

**数据库**:
- [ ] 创建迁移文件 `20260121000002_timeline_system.sql`
- [ ] 扩展 `projects` 表（添加 `birth_date`）
- [ ] 创建 `timeline_fact_extracts` 表
- [ ] 创建 `timeline_nodes` 视图

**Edge Function**:
- [ ] 实现 `supabase/functions/extract_timeline_facts/index.ts`
- [ ] 集成 Gemini AI 时间表达式抽取
- [ ] 实现年龄→年份转换逻辑

**前端**:
- [ ] 重写 `app/timeline/page.tsx`
- [ ] 集成时间轴可视化库（vis-timeline）
- [ ] 实现双轨布局（Photos + Facts）
- [ ] 实现节点编辑功能

### Phase 4: Outline-Question 关联系统（P1，2-3天）

**数据库**:
- [ ] 创建迁移文件 `20260121000003_outline_question_links.sql`
- [ ] 创建 `chapter_question_links` 表

**Edge Function**:
- [ ] 修改 `generate_biography_outline` 函数
- [ ] 在生成大纲时创建 chapter-question 映射

**API**:
- [ ] 创建 `/api/outline/chapter-questions` 路由
- [ ] 支持查询/添加/删除 question links

### Phase 5: Export 照片自动插入（P1，2-3天）

**前端**:
- [ ] 修改 `app/export/page.tsx`
- [ ] 实现 `generateBookWithPhotos()` 函数
- [ ] 根据 chapter-question links 查询照片
- [ ] 实现照片筛选策略（最多N张、优先级规则）
- [ ] 集成到 PDF 生成流程

### Phase 6: 用户专属问题系统（P1，2-3天）

**数据库**:
- [ ] 创建迁移文件 `20260121000004_user_specific_questions.sql`
- [ ] 修改 `questions` 表（添加 `scope`, `owner_user_id`）
- [ ] 修改RLS策略

**Edge Function**:
- [ ] 实现 `generate_followup_questions` 函数

**前端**:
- [ ] 修改 `app/main/page.tsx` 问题加载逻辑
- [ ] 显示问题来源（全局/AI生成/用户添加）

### Phase 7: UI/UX 优化（P2，持续进行）

- [ ] 照片上传进度指示器（5字段完成度）
- [ ] Photos页面"未完成标注"筛选器
- [ ] Family页面人物合并功能
- [ ] 批量操作功能（批量标注地点/时间）

---

## 📊 功能覆盖率

| 功能模块 | 需求文档章节 | 完成度 | 状态 |
|---------|-------------|--------|------|
| 照片5字段模型 | 第二章 | 50% | ⏳ 进行中 |
| Main页照片上传 | 第三章 | 20% | ⏳ 待修改 |
| Photos页照片上传 | 第五章 | 80% | ✅ 基本完成 |
| 照片数据流转 | 第四章 | 70% | ✅ 基本完成 |
| Family人物抽取 | 第四章3节 | 90% | ✅ 已实现 |
| Export照片插入 | 第七章 | 0% | ❌ 未开始 |
| Places地图页面 | 第九章 | 0% | ❌ 未开始 |
| Timeline时间轴 | 第十章 | 10% | ❌ 待重写 |
| Outline-Question链接 | 第十一章3节 | 0% | ❌ 未开始 |
| 用户专属问题 | 第十一章4节 | 0% | ❌ 未开始 |

**总体完成度**: ~30%

---

## 🔧 技术栈确认

### 已选定技术方案

| 功能 | 技术选型 | 理由 |
|------|---------|------|
| 地图 | Leaflet + OpenStreetMap | 免费、轻量、无配额限制 |
| 地点搜索 | Nominatim API（OSM） | 免费，备选：Google Places |
| 时间轴可视化 | vis-timeline / react-vis-timeline | 成熟、支持缩放/拖拽 |
| AI模型 | Gemini 2.0 Flash | 已在用，快速且便宜 |
| 数据库 | Supabase PostgreSQL | 已有，支持RLS和复杂查询 |
| 存储 | Supabase Storage | 已有，支持presigned URLs |

---

## ⚠️ 当前风险与建议

### 1. 数据迁移风险（中等）

**问题**: 现有照片（~100张）可能没有 `linked_question_id`

**建议**:
- ✅ 已实现：数据迁移脚本（设置默认值 + 标记需要补全）
- 🔄 下一步：提示用户补全标注（在Photos页面显示banner）
- 🔄 可选：AI自动推断问题（基于照片上传时间 + 回答时间）

### 2. 用户体验风险（高）

**问题**: 5字段标注可能让用户感到繁琐

**缓解措施**:
- ✅ 已实现：批量操作函数（`batch_update_photo_annotations`）
- 🔄 待实现：智能推荐（基于EXIF时间推荐问题/地点）
- 🔄 待实现：保存草稿功能（部分标注也能保存）

### 3. AI抽取准确率（中等）

**问题**: 地点/时间轴事实抽取可能不准

**缓解措施**:
- ✅ 已设计：置信度字段 + 状态标记
- ✅ 已设计：纠错机制（用户可编辑）
- 🔄 待实现：用户反馈循环（提升模型准确度）

---

## 📅 预计交付时间表

| 阶段 | 预计完成时间 | 关键里程碑 |
|------|------------|-----------|
| Phase 1 | 1月22日 | 照片5字段系统上线 |
| Phase 2 | 1月27日 | Places地图可用 |
| Phase 3 | 2月1日 | Timeline时间轴可用 |
| Phase 4-6 | 2月8日 | 完整功能闭环 |
| Phase 7 | 持续 | 优化与打磨 |

**总预计时间**: 3-4周

---

## 🎯 下一步行动（今天内完成）

### 立即执行

1. ✅ **Review并确认**: 数据库迁移文件
2. ⏳ **应用迁移**: `supabase db push`
3. ⏳ **测试迁移**: 运行验证查询，检查视图和触发器
4. ⏳ **修改上传流程**: 在 `/app/photos/new/page.tsx` 添加问题选择步骤

### 今晚完成

5. ⏳ 创建API Route: `/api/photos/annotation-stats`
6. ⏳ 在Photos页面显示标注完成度提示
7. ⏳ 测试端到端流程（上传 → 标注 → 保存 → 查询）

---

## 📝 用户行动建议

### 请确认以下事项

1. **Review实施计划**: `IMPLEMENTATION_PLAN.md`
   - 是否同意技术选型（Leaflet, vis-timeline）？
   - 是否同意分阶段实施（Phase 1-7）？
   - 是否需要调整优先级？

2. **Review数据库迁移**: `supabase/migrations/20260121000000_photo_5_fields_enforcement.sql`
   - 字段设计是否符合预期？
   - 数据迁移逻辑是否合理？
   - 是否需要修改？

3. **确认执行计划**:
   - 是否立即应用数据库迁移？
   - 是否继续实施Phase 1剩余任务？
   - 是否需要我先演示某些功能？

### 可选操作

- **查看现有数据**: 我可以生成一个脚本查看当前照片的标注情况
- **测试AI抽取**: 我可以先实现一个简单的地点抽取原型
- **优先实现某个功能**: 如果你想先看到某个页面的效果（如Places），我可以调整优先级

---

**等待您的反馈以继续实施！** 🚀
