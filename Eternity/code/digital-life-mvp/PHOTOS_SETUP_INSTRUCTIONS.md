# 📸 照片系统部署说明

## 快速开始（3步完成）

### 第 1 步：执行数据库迁移

在 Supabase Dashboard 中执行以下操作：

1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目：`lpkvgggefyqcibodbowu`
3. 点击左侧 **SQL Editor**
4. 点击 **New Query**

#### 执行迁移文件 1：表结构

复制并执行文件内容：
```bash
supabase/migrations/20260115_photos_system.sql
```

这将创建：
- ✅ `photos` 表（照片主表）
- ✅ `albums` 表（相册）
- ✅ `album_photos` 表（相册-照片关联）
- ✅ `upload_reminders` 表（上传提醒）
- ✅ `photo_faces` 表（人脸识别，V2功能）
- ✅ 所有表的 RLS 策略
- ✅ 索引优化
- ✅ 自动更新触发器

#### 执行迁移文件 2：Storage 配置

复制并执行文件内容：
```bash
supabase/migrations/20260115_storage_photos.sql
```

这将配置：
- ✅ Storage bucket `photos`
- ✅ Storage RLS 策略

### 第 2 步：创建 Storage Bucket

1. 在 Supabase Dashboard 左侧点击 **Storage**
2. 点击 **Create a new bucket**
3. 配置如下：
   - **Name**: `photos`
   - **Public bucket**: ✅ **开启**（允许公开访问照片）
   - **File size limit**: 10 MB
   - **Allowed MIME types**: `image/jpeg`, `image/jpg`, `image/png`, `image/heic`, `image/heif`
4. 点击 **Create bucket**

### 第 3 步：修改项目ID占位符（开发阶段可选）

在开发阶段，你需要在代码中获取真实的 `projectId`。以下文件包含 `'YOUR_PROJECT_ID'` 占位符：

1. [app/photos/page.tsx](code/digital-life-mvp/app/photos/page.tsx#L25)
2. [app/photos/upload/page.tsx](code/digital-life-mvp/app/photos/upload/page.tsx#L98)
3. [app/photos/[id]/page.tsx](code/digital-life-mvp/app/photos/%5Bid%5D/page.tsx)
4. [app/photos/reminders/page.tsx](code/digital-life-mvp/app/photos/reminders/page.tsx#L22)
5. [app/photos/camera/page.tsx](code/digital-life-mvp/app/photos/camera/page.tsx#L111)
6. [app/photos/unsorted/page.tsx](code/digital-life-mvp/app/photos/unsorted/page.tsx#L21)

**临时解决方案（测试用）：**
创建一个测试项目并硬编码ID：

```sql
-- 在 Supabase SQL Editor 中执行
INSERT INTO projects (id, user_id, title)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM auth.users LIMIT 1),
  '测试项目'
)
ON CONFLICT DO NOTHING;
```

然后在代码中替换：
```typescript
const projectId = '00000000-0000-0000-0000-000000000001';
```

**正式解决方案：**
从用户 session 或上下文中获取：

```typescript
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

const user = useUser();
const supabase = useSupabaseClient();

// 获取用户的当前项目
const { data: project } = await supabase
  .from('projects')
  .select('id')
  .eq('user_id', user.id)
  .single();

const projectId = project.id;
```

## ✅ 验证部署

### 1. 检查数据库表

在 Supabase SQL Editor 中运行：

```sql
-- 检查表是否创建成功
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%photo%'
ORDER BY table_name;

-- 应该看到：
-- album_photos
-- albums
-- photo_faces
-- photos
-- upload_reminders
```

### 2. 检查 Storage Bucket

```sql
-- 检查 bucket 是否创建
SELECT * FROM storage.buckets WHERE id = 'photos';
```

### 3. 启动开发服务器

```bash
cd /Users/liuxuyang/Desktop/Eternity/code/digital-life-mvp
npm run dev
```

### 4. 测试页面

访问以下页面确认功能正常：

- ✅ **照片库主页**: http://localhost:3000/photos
- ✅ **上传照片**: http://localhost:3000/photos/upload
- ✅ **提醒管理**: http://localhost:3000/photos/reminders
- ✅ **未整理队列**: http://localhost:3000/photos/unsorted
- ✅ **移动端拍摄**: http://localhost:3000/photos/camera

## 🎯 测试清单

- [ ] 拖拽上传照片
- [ ] 多选文件上传
- [ ] 查看上传进度
- [ ] 在网格视图中浏览照片
- [ ] 点击照片查看详情
- [ ] 编辑照片标题和描述
- [ ] 删除照片
- [ ] 标记照片为已整理
- [ ] 查看提醒列表
- [ ] Snooze 提醒
- [ ] 使用移动端相机拍摄

## 🔧 常见问题

### Q1: 数据库迁移失败 - 外键约束错误

**错误信息**: `relation "places" does not exist`

**解决方案**: 你的数据库中可能还没有 `places` 或 `events` 表。这些是可选的外键。你可以：

1. **创建这些表**（推荐）：
```sql
CREATE TABLE IF NOT EXISTS places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

2. **或者修改外键为可选**（临时方案）：
修改 `20260115_photos_system.sql` 中的外键定义，移除 `REFERENCES` 约束。

### Q2: Storage 权限错误

**错误信息**: `new row violates row-level security policy`

**解决方案**: 
1. 确保 RLS 策略已正确创建（执行了 `20260115_storage_photos.sql`）
2. 确认用户已登录（有 auth token）
3. 检查 Storage bucket 是否设置为 public

### Q3: 上传照片没有反应

**检查清单**:
- [ ] Storage bucket `photos` 是否已创建
- [ ] 环境变量 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 是否正确
- [ ] 浏览器控制台是否有错误信息
- [ ] 网络请求是否成功（查看 Network 面板）

### Q4: projectId 获取不到

这是开发阶段的常见问题。参考上面的 **第 3 步** 使用测试 project ID 或实现完整的用户 session 管理。

## 📚 更多文档

- [完整部署指南](PHOTOS_DEPLOYMENT_GUIDE.md)
- [API 使用示例](PHOTOS_DEPLOYMENT_GUIDE.md#api-使用示例)
- [待优化功能列表](PHOTOS_DEPLOYMENT_GUIDE.md#待优化功能v2)

## 🎉 部署完成！

如果所有测试都通过，恭喜你成功部署了照片系统！

现在你可以：
- 📸 上传和管理照片
- 🗂️ 创建相册
- 🔔 接收上传提醒
- 📱 使用移动端扫描老照片
- ✅ 整理未分类的照片

有任何问题，请查看 [常见问题](#🔧-常见问题) 或联系技术支持。
