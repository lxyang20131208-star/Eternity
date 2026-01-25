# Collaboration Feature - Quick Start Guide

## 快速部署步骤

### 方法 1: Supabase Dashboard（推荐）

这是最简单可靠的方法：

1. **打开 Supabase Dashboard**
   - 访问: https://supabase.com/dashboard
   - 登录您的账户
   - 选择项目: `lpkvgggefyqcibodbowu`

2. **运行迁移 SQL**
   - 在左侧菜单点击 **SQL Editor**
   - 点击 **New Query**
   - 复制整个文件内容: `supabase/migrations/20260125_collab_feature.sql`
   - 粘贴到 SQL Editor
   - 点击 **Run** 执行

3. **验证表已创建**
   - 在左侧菜单点击 **Table Editor**
   - 确认以下表已创建：
     * `collab_invites`
     * `collab_invite_questions`
     * `collab_comments`

4. **验证 Storage Bucket**
   - 在左侧菜单点击 **Storage**
   - 确认 `collab-audio` bucket 已创建
   - 如果没有，点击 **New bucket**:
     * Name: `collab-audio`
     * Public: NO (不勾选)
     * 点击 Create

5. **测试功能**
   - 启动开发服务器: `npm run dev`
   - 访问: http://localhost:3000/collab
   - 创建第一个邀请链接

---

### 方法 2: Supabase CLI

如果您已经配置了 Supabase CLI：

```bash
# 1. 登录 Supabase（如果还没登录）
supabase login

# 2. 链接项目（如果还没链接）
supabase link --project-ref lpkvgggefyqcibodbowu

# 3. 运行迁移
supabase db push

# 4. 验证
supabase db diff
```

---

## 功能测试步骤

### 作为 Owner（项目拥有者）测试

1. 访问 `/collab` 页面
2. 点击 "Create Invite Link"
3. 选择 2-3 个问题（如选择第一章的问题）
4. 可选：勾选 "Allow contributors to see your answers"
5. 可选：添加消息，例如："请分享您关于我童年的记忆"
6. 点击 "Generate Link"
7. 复制生成的链接

### 作为 Invitee（受邀者）测试

1. 打开新的浏览器窗口（或无痕模式）
2. 粘贴邀请链接访问
3. 输入您的名字（例如："测试用户"）
4. 为第一个问题点击 "Record Your Memory"
5. 允许麦克风访问
6. 说几句话（5-10秒），例如："这是一个测试录音"
7. 点击 "Stop Recording"
8. 可选：添加文字评论
9. 点击 "Submit Contribution"
10. 看到成功提示

### 回到 Owner 查看贡献

1. 刷新 `/collab` 页面
2. 在 "Recent Contributions" 区域查看新贡献
3. 点击 "Play Audio" 播放录音
4. 使用下拉菜单将状态改为 "Reviewed"

---

## 常见问题排查

### ❌ 问题: SQL 执行失败

**解决方案:**
- 确保在 Supabase Dashboard 的 SQL Editor 中执行
- 不要使用 psql 或其他客户端（可能有权限问题）
- 如果某些语句失败，检查表是否已存在（重复运行是安全的）

### ❌ 问题: Storage bucket 未创建

**解决方案:**
1. 打开 Supabase Dashboard > Storage
2. 手动创建 bucket：
   - Name: `collab-audio`
   - Public: 不勾选
3. 创建后，重新运行 Storage policies 部分的 SQL

### ❌ 问题: 无法录音

**解决方案:**
- 确保使用 HTTPS 或 localhost
- 检查浏览器麦克风权限
- 尝试其他浏览器（Chrome/Edge 推荐）

### ❌ 问题: RLS 策略错误

**解决方案:**
- 确保所有表的 RLS 都已启用
- 在 SQL Editor 运行：
  ```sql
  ALTER TABLE collab_invites ENABLE ROW LEVEL SECURITY;
  ALTER TABLE collab_invite_questions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE collab_comments ENABLE ROW LEVEL SECURITY;
  ```

---

## 验证迁移成功

运行以下 SQL 查询验证：

```sql
-- 检查表是否存在
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'collab%';

-- 应该返回 3 行:
-- collab_invites
-- collab_invite_questions
-- collab_comments

-- 检查 RLS 是否启用
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'collab%';

-- 所有行的 rowsecurity 应该是 true

-- 检查 Storage bucket
SELECT * FROM storage.buckets WHERE id = 'collab-audio';

-- 应该返回 1 行
```

---

## 功能解锁要求

⚠️ **重要**: COLLAB 功能需要回答 **90 个问题**才能解锁

如果您想立即测试，可以：

1. **临时降低阈值**（仅用于开发）:
   - 编辑 `app/components/UnifiedNav.tsx`
   - 找到 `collab: 90`
   - 改为 `collab: 0`
   - 保存并重启开发服务器

2. **测试完成后记得改回 90**

---

## 下一步

✅ 迁移完成后：

1. 📱 测试录音功能
2. 👥 邀请真实用户测试
3. 📊 查看贡献仪表板
4. 🔒 验证 RLS 安全性
5. 🚀 部署到生产环境

---

## 需要帮助？

- 检查浏览器控制台错误
- 查看 Supabase Dashboard > Logs
- 参考完整文档: `COLLAB_DEPLOYMENT_GUIDE.md`
