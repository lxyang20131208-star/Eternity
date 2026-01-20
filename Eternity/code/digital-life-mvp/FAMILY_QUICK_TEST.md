# Family Page 快速测试指南

## ✅ 已修复的问题

1. ✅ 数据库迁移已应用
2. ✅ API 查询错误已修复（使用 limit(1) 代替 single()）
3. ✅ Edge Function 错误处理已增强
4. ✅ 前端日志已增强（便于调试）
5. ✅ 人物抽取逻辑已改为从大纲抽取

---

## 🧪 测试步骤

### 前提条件

在测试人物抽取之前，请确保：

1. **已回答至少 100 个问题**
   - 访问：`http://localhost:3000/main`
   - 回答问题直到达到 100+ 条

2. **已生成传记大纲**
   - 在主页点击"生成大纲"按钮
   - 等待大纲生成完成（会自动进行）
   - 验证：访问大纲页面能看到章节

---

### 测试流程

#### 步骤 1: 打开浏览器控制台

1. 访问 `http://localhost:3000/family`
2. 按 `F12` 打开开发者工具
3. 切换到 **Console** 标签

#### 步骤 2: 触发人物抽取

1. 点击页面上的"重新抽取人物"按钮
2. 观察控制台输出

**预期控制台输出**：
```
[Family] Starting people extraction for project: xxxx-xxxx-xxxx
[Family] API response status: 200
[Family] API response data: { success: true, jobId: "xxxx-...", ... }
[Family] Starting to poll job: xxxx-xxxx-xxxx
[Family] Polling job xxxx-xxxx-xxxx, attempt 1
[Family] Poll response status: 200
[Family] Poll response data: { job: { status: "processing", ... } }
...
[Family] Extraction completed: { new_people: 5, updated_people: 2, ... }
```

#### 步骤 3: 等待完成

- 正常情况下，3-10 秒即可完成
- 页面会显示："抽取完成！新增 X 人，更新 Y 人"
- 页面自动刷新，显示人物网络图

---

## 🐛 可能的错误情况

### 情况 1: 没有大纲

**错误消息**：
```
No outlines found. Please generate an outline first.
```

**解决方案**：
1. 返回主页 (`/main`)
2. 确保回答了 100+ 个问题
3. 等待系统自动生成大纲
4. 再次尝试抽取人物

---

### 情况 2: Edge Function 错误

**控制台显示**：
```
[Family] Extraction error: Edge Function returned a non-2xx status code
```

**检查步骤**：

1. 查看 Supabase Dashboard 日志：
   - 访问：https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/functions
   - 点击 `extract_people` 函数
   - 查看日志

2. 常见错误：
   - `GEMINI_API_KEY not configured` → 设置 API Key
   - `Outline is empty` → 大纲内容为空，重新生成
   - `AI extraction failed` → Gemini API 调用失败，重试

---

### 情况 3: 数据库查询错误

**错误消息**：
```
Cannot coerce the result to a single JSON object
```

**已修复**：最新代码使用 `limit(1)` 而不是 `single()`

如果仍然出现，可能是旧数据问题：

```sql
-- 清理重复的任务记录（在 Supabase SQL Editor 中执行）
DELETE FROM people_extraction_jobs
WHERE id NOT IN (
  SELECT DISTINCT ON (project_id, created_at) id
  FROM people_extraction_jobs
  ORDER BY project_id, created_at DESC, id
);
```

---

## 📊 验证成功

抽取成功后，你应该看到：

1. ✅ 页面显示人物网络图
2. ✅ 中心节点："我"
3. ✅ 周围节点：从大纲中识别的人物
4. ✅ 点击节点可以查看人物详情
5. ✅ 统计卡片显示正确数量

---

## 🔍 调试工具

### 查看数据库中的人物

在 Supabase SQL Editor 中执行：

```sql
-- 查看所有人物
SELECT
  name,
  relationship_to_user,
  importance_score,
  confidence_score,
  extraction_status,
  created_at
FROM people
WHERE project_id = 'your-project-id'
ORDER BY importance_score DESC;
```

### 查看抽取任务历史

```sql
-- 查看最近的抽取任务
SELECT
  id,
  status,
  extracted_count,
  result_json,
  error_text,
  created_at
FROM people_extraction_jobs
WHERE project_id = 'your-project-id'
ORDER BY created_at DESC
LIMIT 10;
```

---

## 📞 需要帮助？

如果遇到问题：

1. **检查控制台日志**：所有日志都以 `[Family]` 开头
2. **检查 Supabase 函数日志**：Dashboard → Functions → extract_people → Logs
3. **检查数据库**：确保表已创建、大纲已生成
4. **重启开发服务器**：`npm run dev`

---

**祝测试顺利！** 🎉
