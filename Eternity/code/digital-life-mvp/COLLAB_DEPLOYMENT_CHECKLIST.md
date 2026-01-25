# Collaboration Feature - 部署检查清单

## ✅ 已完成的准备工作

- [x] 创建数据库迁移文件 (`supabase/migrations/20260125_collab_feature.sql`)
- [x] 创建 API Helper 函数 (`lib/collabApi.ts`)
- [x] 创建 Owner 仪表板页面 (`app/collab/page.tsx`)
- [x] 创建 Invitee 贡献页面 (`app/collab/invite/page.tsx`)
- [x] 修复导航按钮 (`app/components/UnifiedNav.tsx`)
- [x] 临时降低解锁阈值（设置为 0 以便测试）

## 🚀 立即执行的步骤

### 步骤 1: 运行数据库迁移（5 分钟）

**使用 Supabase Dashboard（最简单）：**

1. 打开浏览器访问: https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu
2. 点击左侧 **SQL Editor**
3. 点击 **New Query**
4. 打开文件: `supabase/migrations/20260125_collab_feature.sql`
5. 全选复制所有内容
6. 粘贴到 SQL Editor
7. 点击右下角 **Run** 按钮
8. 等待执行完成（应该显示 "Success"）

### 步骤 2: 验证设置（2 分钟）

在 Supabase Dashboard 中验证：

**检查表:**
1. 点击左侧 **Table Editor**
2. 确认看到这些新表：
   - `collab_invites`
   - `collab_invite_questions`
   - `collab_comments`

**检查 Storage:**
1. 点击左侧 **Storage**
2. 如果看到 `collab-audio` bucket → ✅ 完美
3. 如果没有看到 → 点击 **New bucket**:
   - Name: `collab-audio`
   - Public: **不要勾选**（保持私有）
   - 点击 **Create bucket**

### 步骤 3: 启动应用测试（5 分钟）

```bash
# 在项目目录中运行
npm run dev
```

打开浏览器访问: http://localhost:3000/collab

如果看到 Collaboration 页面 → ✅ 成功！

## 🧪 完整测试流程

### A. Owner 创建邀请

1. 访问 http://localhost:3000/collab
2. 点击 **+ Create Invite Link** 按钮
3. 选择 2-3 个问题（随便选）
4. 勾选 "Allow contributors to see your answers"（可选）
5. 在 Message 框输入: "请分享您的记忆"
6. 点击 **Generate Link**
7. 看到绿色成功提示
8. 点击 **📋 Copy Link** 复制链接

### B. Invitee 贡献记忆

1. 打开新的浏览器窗口（或无痕模式）
2. 粘贴刚才复制的链接
3. 在 "Your Name" 输入: 测试用户
4. 找到第一个问题，点击 **🎙 Record Your Memory**
5. 允许麦克风权限（浏览器会弹窗询问）
6. 说几句话（例如: "这是一个测试录音，测试协作功能"）
7. 点击 **⏹ Stop Recording**
8. 可选：在 "Additional Notes" 添加文字
9. 点击 **✓ Submit Contribution**
10. 看到绿色成功提示 → ✅ 录音已提交

### C. Owner 查看贡献

1. 回到 http://localhost:3000/collab
2. 刷新页面
3. 在 "Recent Contributions" 区域应该看到新贡献
4. 点击 **▶ Play Audio** 播放录音
5. 应该能听到刚才的录音
6. 将状态改为 "Reviewed" → ✅ 完整流程成功

## 🔧 常见问题

### ❌ 无法看到 COLLAB 按钮
- **原因**: 未解锁
- **解决**: 已临时设置为 0，重启 `npm run dev`

### ❌ SQL 执行报错
- **检查**: 是否在 Supabase Dashboard SQL Editor 中执行
- **提示**: 某些重复执行的警告是正常的（如表已存在）

### ❌ 无法录音
- **检查**: 浏览器是否允许麦克风权限
- **提示**: 使用 Chrome/Edge 浏览器效果最佳
- **注意**: 必须是 HTTPS 或 localhost

### ❌ 上传音频失败
- **检查**: Storage bucket 是否创建
- **检查**: Bucket 名称是否为 `collab-audio`
- **检查**: Bucket 是否设置为私有（不是 Public）

### ❌ 找不到表
```sql
-- 在 SQL Editor 运行这个查询检查
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'collab%';

-- 应该返回 3 行
```

## 📋 生产部署前的清单

在将功能部署到生产环境前：

- [ ] 将 `UnifiedNav.tsx` 中的 `collab: 0` 改回 `collab: 80`
- [ ] 在生产数据库运行相同的迁移 SQL
- [ ] 验证生产环境的 Storage bucket 已创建
- [ ] 测试 HTTPS 环境下的录音功能
- [ ] 验证 RLS 策略正常工作（用不同账户测试）

## 🎯 功能特点提醒

✨ **Owner 可以:**
- 选择特定问题分享
- 控制是否让贡献者看到自己的回答
- 添加引导消息
- 查看所有贡献
- 播放录音
- 管理贡献状态

✨ **Invitee 可以:**
- 无需注册账号
- 录制语音回忆
- 添加文字补充
- 查看 Owner 的原始回答（如果允许）

✨ **安全性:**
- 完整的 RLS 保护
- Invitee 只能看到分享给他们的问题
- 录音存储在私有 bucket
- Owner 完全控制数据

## ✅ 下一步行动

1. **现在**: 按照上面步骤运行迁移并测试
2. **测试成功后**: 邀请真实用户体验
3. **收集反馈**: 记录用户意见
4. **生产部署**: 准备好后改回阈值并部署

## 📞 需要帮助？

遇到问题请检查：
1. 浏览器控制台（F12 → Console）
2. Supabase Dashboard → Logs
3. 网络请求（F12 → Network）

祝测试顺利！🎉
