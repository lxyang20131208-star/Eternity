# 老人扫码录音入口 - 部署指南

## 1. 部署数据库Migration

### 方法一：通过 Supabase Dashboard（推荐）

1. 访问 Supabase Dashboard SQL Editor:
   ```
   https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/sql
   ```

2. 点击 "+ New query"

3. 复制并粘贴以下文件的**完整内容**:
   ```
   supabase/migrations/20260125_elder_entry.sql
   ```

4. 点击 "Run" 按钮

5. 确认所有SQL语句执行成功（无红色错误提示）

### 方法二：通过命令行验证

运行验证脚本确认部署成功：

```bash
node verify-elder-deployment.mjs
```

期望输出：
```
✅ elder_entry_tokens table: EXISTS
```

## 2. 启动开发服务器

```bash
npm run dev
```

## 3. 测试功能

### 家属端测试

1. 访问 http://localhost:3000/elderly
2. 或者点击导航栏的 "👴 老人录音" 按钮
3. 应该看到二维码管理页面
4. 查看二维码是否正确生成
5. 测试 "复制链接" 和 "重置二维码" 功能
6. 查看右侧的"最近录音"列表

### 老人端测试（需要手机）

1. 使用手机扫描二维码或直接访问复制的链接
2. 应该看到极简大字界面 "今天录一段"
3. 测试语音朗读功能（点击 "🔊 再读一遍"）
4. 测试录音功能：
   - 点击 "● 开始录音"
   - 说几句话
   - 点击 "⏹ 结束录音"
5. 确认自动上传并跳到下一题
6. 回到家属端 main 页面，确认能看到新上传的录音

## 4. 功能清单

### ✅ 已实现

- [x] 永久二维码生成
- [x] 家属端二维码展示和管理
- [x] 重置二维码功能
- [x] 老人端极简UI（大字号、高对比）
- [x] 自动朗读题干（Web Speech API）
- [x] 超大录音按钮
- [x] 自动上传功能
- [x] 自动跳下一题
- [x] 已答题过滤
- [x] 安全提示展示
- [x] JWT session管理
- [x] 限流保护（文件大小50MB）
- [x] 复用existing answer_sessions table

### 🔒 安全特性

- httpOnly cookie (防止XSS)
- 30天session过期
- 文件大小限制 (50MB max)
- Token验证机制
- 重置token使旧码失效

## 5. 数据库结构

### 新增表：elder_entry_tokens

```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key → auth.users)
- secret_token: TEXT (UNIQUE) - 64字符hex token
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### RLS策略

- Users can read their own token
- Users can update their own token
- Users can insert their own token

### 复用表：answer_sessions

老人录音直接存储到现有的 `answer_sessions` 表，包含：
- recording_method: 'elder_entry' (标识来源)
- 其他字段与普通录音相同

## 6. API Endpoints

### 家属端

- `POST /api/elder/generate-token` - 生成elder token
- `POST /api/elder/reset-secret` - 重置token

### 老人端

- `POST /api/elder/verify-token` - 验证token并创建session
- `GET /api/elder/next-question` - 获取下一个未答题
- `POST /api/elder/upload` - 上传录音

## 7. 常见问题

### Q: 二维码失效了怎么办？
A: 点击 "重置二维码" 按钮生成新的二维码

### Q: 老人端无法录音？
A: 需要允许浏览器麦克风权限

### Q: 录音没有自动朗读？
A: 部分浏览器不支持Web Speech API，显示"点击朗读"按钮

### Q: 上传的录音在哪里查看？
A: 在 main 页面的问题列表中，与普通录音一起显示

## 8. 环境变量

确保 `.env.local` 包含：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
JWT_SECRET=your-secret-key-change-in-production  # 新增
```

⚠️ **注意**: JWT_SECRET 在生产环境必须使用强密钥！

## 9. 生产部署检查清单

- [ ] JWT_SECRET 已更换为强密钥
- [ ] Migration已在生产数据库执行
- [ ] HTTPS已启用（secure cookie）
- [ ] 测试二维码生成
- [ ] 测试老人端录音流程
- [ ] 测试重置功能
- [ ] 验证RLS策略生效
