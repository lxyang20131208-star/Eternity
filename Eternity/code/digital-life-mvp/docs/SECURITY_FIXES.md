# Supabase 安全修复指南

这份指南帮助您修复 Supabase Security Advisor 的安全警告。

## 问题概览

### 1. Security Definer Views (2个)
- `public.incomplete_photos` - 使用了SECURITY DEFINER
- `public.photo_annotation_stats` - 使用了SECURITY DEFINER

**影响**：这些视图使用创建者的权限而非查询者的权限，可能绕过RLS策略

### 2. RLS Disabled (3个表)
- `public.user_question_progress` - 未启用RLS
- `public.project_invites` - 未启用RLS
- `public.answer_comments` - 未启用RLS

**影响**：任何经过身份验证的用户都可以访问这些表中的所有数据

---

## 修复步骤

### 方法1：使用Supabase Dashboard SQL编辑器（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择您的项目
3. 点击左侧菜单的 **SQL Editor**
4. 创建新查询并执行以下SQL

#### 步骤1：移除SECURITY DEFINER视图（重建无SECURITY DEFINER）

```sql
-- 重建 incomplete_photos 视图
DROP VIEW IF EXISTS public.incomplete_photos CASCADE;
CREATE VIEW public.incomplete_photos AS
SELECT
  p.id,
  p.project_id,
  p.url,
  p.title,
  p.description,
  p.taken_at,
  p.uploaded_at,
  p.place_id,
  p.event_id,
  p.tags,
  p.is_sorted,
  p.created_at,
  p.updated_at,
  CASE
    WHEN p.metadata::jsonb->>'linked_question_id' IS NULL THEN 'missing_question'
    WHEN p.metadata::jsonb->>'time_taken' IS NULL THEN 'missing_time'
    WHEN p.metadata::jsonb->>'place_id' IS NULL THEN 'missing_place'
    WHEN p.metadata::jsonb->>'caption' IS NULL THEN 'missing_caption'
    WHEN array_length(p.person_ids, 1) IS NULL OR array_length(p.person_ids, 1) = 0 THEN 'missing_people'
    ELSE 'complete'
  END AS completion_status
FROM public.photos p
WHERE
  p.metadata::jsonb->>'linked_question_id' IS NULL
  OR p.metadata::jsonb->>'time_taken' IS NULL
  OR p.metadata::jsonb->>'place_id' IS NULL
  OR p.metadata::jsonb->>'caption' IS NULL
  OR array_length(p.person_ids, 1) IS NULL
  OR array_length(p.person_ids, 1) = 0;
```

```sql
-- 重建 photo_annotation_stats 视图
DROP VIEW IF EXISTS public.photo_annotation_stats CASCADE;
CREATE VIEW public.photo_annotation_stats AS
SELECT
  p.project_id,
  COUNT(*) as total_photos,
  COUNT(CASE WHEN array_length(p.person_ids, 1) > 0 THEN 1 END) as photos_with_people,
  COUNT(CASE WHEN p.metadata::jsonb->>'linked_question_id' IS NOT NULL THEN 1 END) as photos_with_questions,
  COUNT(CASE WHEN p.place_id IS NOT NULL THEN 1 END) as photos_with_places,
  COUNT(CASE WHEN p.metadata::jsonb->>'caption' IS NOT NULL THEN 1 END) as photos_with_captions,
  ROUND(
    100.0 * COUNT(CASE WHEN
      p.metadata::jsonb->>'linked_question_id' IS NOT NULL
      AND p.metadata::jsonb->>'time_taken' IS NOT NULL
      AND p.metadata::jsonb->>'place_id' IS NOT NULL
      AND p.metadata::jsonb->>'caption' IS NOT NULL
      AND array_length(p.person_ids, 1) > 0
    THEN 1 END)::numeric / NULLIF(COUNT(*), 0),
    2
  ) as annotation_percentage
FROM public.photos p
GROUP BY p.project_id;
```

#### 步骤2：启用RLS并添加策略

```sql
-- 为 user_question_progress 启用RLS
ALTER TABLE public.user_question_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own question progress"
  ON public.user_question_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own question progress"
  ON public.user_question_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own question progress"
  ON public.user_question_progress
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own question progress"
  ON public.user_question_progress
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
```

```sql
-- 为 project_invites 启用RLS
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invites sent to them"
  ON public.project_invites
  FOR SELECT
  TO authenticated
  USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Project owners can view invites for their projects"
  ON public.project_invites
  FOR SELECT
  TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can insert invites for their projects"
  ON public.project_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can update invites for their projects"
  ON public.project_invites
  FOR UPDATE
  TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

CREATE POLICY "Users can delete invites for their projects"
  ON public.project_invites
  FOR DELETE
  TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
```

```sql
-- 为 answer_comments 启用RLS
ALTER TABLE public.answer_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on answers in their projects"
  ON public.answer_comments
  FOR SELECT
  TO authenticated
  USING (
    answer_session_id IN (
      SELECT id FROM public.answer_sessions
      WHERE project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert comments on answers in their projects"
  ON public.answer_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    answer_session_id IN (
      SELECT id FROM public.answer_sessions
      WHERE project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid())
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own comments"
  ON public.answer_comments
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own comments"
  ON public.answer_comments
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
```

### 方法2：使用本地迁移

如果想通过CLI推送迁移：

```bash
# 尝试再次推送（如果迁移系统已修复）
supabase db push

# 或者手动修复迁移历史
supabase migration repair --status applied 20260122000001
```

---

## 验证修复

修复完成后，在Supabase Dashboard中检查 **Security Advisor** 标签：

✅ 所有之前的ERROR警告应该消失
✅ 表格应该显示绿色的"Secure"状态

---

## 这些修复的含义

### 移除SECURITY DEFINER
- **之前**：视图使用PostgreSQL角色（admin）的权限执行
- **之后**：视图使用查询用户的权限执行，RLS策略被正确应用

### 启用RLS
- **之前**：任何经过身份验证的用户都可以查看所有数据
- **之后**：用户只能看到属于他们的数据或项目数据

---

## RLS 策略解释

### user_question_progress
- 用户只能查看和操作自己的进度记录

### project_invites
- 用户可以查看发送给他们的邀请
- 项目所有者可以查看他们项目的邀请
- 只有项目所有者可以创建和管理邀请

### answer_comments
- 用户只能查看他们所在项目的答案评论
- 用户只能创建和删除自己的评论

---

## 安全最佳实践

1. **定期检查** Security Advisor 中的警告
2. **最小权限原则** - RLS策略应该尽可能限制
3. **避免使用SECURITY DEFINER** - 除非有特殊需求
4. **测试RLS** - 确保用户只能访问预期的数据

