# 人物抽取功能验证指南

## ✅ 已完成的修改

### 1. Edge Function改为同步执行
- **文件**: `supabase/functions/extract_people/index.ts`
- **改动**: 移除了异步任务创建，直接返回抽取结果
- **部署时间**: 刚刚部署完成

### 2. API路由简化
- **文件**: `app/api/people/extract/route.ts`
- **改动**: 移除了轮询逻辑，直接返回Edge Function结果

### 3. 前端简化
- **文件**: `app/family/page.tsx`
- **改动**: 移除了ExtractionJob接口和轮询状态，改为直接await

---

## 🧪 验证步骤

### 前提条件（必须满足）

在测试之前，请确保：

1. ✅ **已回答100+个问题**
   ```bash
   # 查询当前问题数量
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM answer_sessions WHERE project_id = 'your-project-id';"
   ```

2. ✅ **已生成传记大纲**
   ```bash
   # 查询大纲是否存在
   psql $DATABASE_URL -c "SELECT id, status, version FROM biography_outlines WHERE project_id = 'your-project-id' ORDER BY version DESC LIMIT 1;"
   ```

   如果没有大纲，访问 `/main` 页面点击"生成大纲"按钮。

---

### 测试流程

#### 步骤1: 打开页面和控制台

1. 访问 `http://localhost:3000/family`
2. 按 `F12` 打开开发者工具
3. 切换到 **Console** 标签页

#### 步骤2: 清理旧数据（可选）

如果之前有失败的抽取记录，可以清理：

```sql
-- 在Supabase SQL Editor中执行
DELETE FROM people WHERE project_id = 'your-project-id';
```

#### 步骤3: 点击"重新抽取人物"按钮

观察控制台输出，预期看到：

```
[Family] Starting people extraction for project: xxxx-xxxx-xxxx
[Family] API response status: 200
[Family] API response data: {
  "success": true,
  "extracted": 5,
  "newPeople": 5,
  "updatedPeople": 0
}
```

#### 步骤4: 观察页面反应

**成功情况**：
- ✅ Toast提示："抽取完成！新增 X 人，更新 Y 人"
- ✅ 1.5秒后页面自动刷新
- ✅ 刷新后能看到人物网络图
- ✅ 中心节点显示"我"
- ✅ 周围节点显示抽取的人物

**边缘情况**：
- 如果没有大纲：Toast提示 "No outlines found. Please generate an outline first."
- 如果大纲为空：Toast提示 "Outline is empty"
- 如果没找到新人物：Toast提示 "没有找到新人物"

---

## 🐛 可能出现的错误

### 错误1: Edge Function超时

**控制台显示**：
```
[Family] 人物抽取失败: Edge Function timed out
```

**原因**：Gemini API调用超时或大纲内容过长

**解决**：
1. 检查Supabase Function日志：
   ```bash
   supabase functions logs extract_people --tail
   ```
2. 查看是否有Gemini API错误
3. 如果大纲过长（>10000字符），考虑分批抽取

---

### 错误2: GEMINI_API_KEY未配置

**控制台显示**：
```
[Family] 人物抽取失败: GEMINI_API_KEY not configured
```

**解决**：
```bash
supabase secrets set GEMINI_API_KEY=your_actual_key
supabase functions deploy extract_people
```

---

### 错误3: RLS权限问题

**控制台显示**：
```
[Family] 人物抽取失败: new row violates row-level security policy
```

**原因**：Edge Function使用的Service Role Key可能未配置

**解决**：
1. 确认Edge Function使用`SUPABASE_SERVICE_ROLE_KEY`
2. 检查`people`表的RLS策略是否正确

---

### 错误4: AI返回格式不正确

**Edge Function日志显示**：
```
[Extract People] AI extraction failed after 3 retries: No valid JSON array found
```

**原因**：Gemini返回的不是JSON数组格式

**解决**：
1. 这种情况较少见，通常会自动重试3次
2. 如果持续失败，检查大纲内容是否包含特殊字符
3. 可以手动调用Edge Function测试：
   ```bash
   curl -X POST https://lpkvgggefyqcibodbowu.supabase.co/functions/v1/extract_people \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"projectId": "your-project-id"}'
   ```

---

## 📊 验证成功的标志

抽取成功后，你应该能看到：

1. ✅ **数据库有新记录**
   ```sql
   SELECT name, relationship_to_user, importance_score, confidence_score
   FROM people
   WHERE project_id = 'your-project-id'
   ORDER BY importance_score DESC;
   ```

2. ✅ **人物网络图正确显示**
   - 中心节点："我"（特殊样式）
   - 周围节点：抽取的人物（按重要性排列）
   - 连线：显示关系

3. ✅ **可以点击节点**
   - 点击人物节点弹出PersonCard
   - 显示姓名、关系、描述、置信度等信息

4. ✅ **统计数据正确**
   - "总人物"数量正确
   - "已确认"/"待确认"分类正确

---

## 🔧 调试命令

### 查看Edge Function日志（实时）
```bash
supabase functions logs extract_people --tail
```

### 手动触发抽取（绕过前端）
```bash
curl -X POST http://localhost:3000/api/people/extract \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat ~/.supabase/cookies.txt)" \
  -d '{"projectId": "your-project-id"}'
```

### 查看最新大纲内容
```sql
SELECT
  outline_json->'sections' as sections,
  version,
  status,
  created_at
FROM biography_outlines
WHERE project_id = 'your-project-id'
ORDER BY version DESC
LIMIT 1;
```

### 检查people表结构
```sql
\d people
```

---

## ✨ 预期结果示例

成功抽取后，数据库中的`people`表应该包含类似这样的记录：

| name | relationship_to_user | importance_score | confidence_score | extraction_status |
|------|---------------------|------------------|------------------|-------------------|
| 李明 | 父亲 | 15 | 0.95 | pending |
| 王芳 | 母亲 | 12 | 0.90 | pending |
| 张伟 | 大学同学 | 8 | 0.80 | pending |

控制台应该显示：

```
[Family] Starting people extraction for project: abc-123
[Family] API response status: 200
[Family] API response data: { success: true, extracted: 3, newPeople: 3, updatedPeople: 0 }
```

页面Toast：
```
✅ 抽取完成！新增 3 人，更新 0 人
```

---

## 📝 代码验证清单

我已验证的代码部分：

- [x] Edge Function是同步的，直接返回结果
- [x] API路由正确调用Edge Function
- [x] 前端正确处理响应，无轮询逻辑
- [x] Edge Function已重新部署
- [x] 错误处理完整（try-catch + 重试机制）
- [x] Console日志齐全（便于调试）
- [x] Toast提示覆盖所有情况

---

## ⚠️ 重要说明

由于我无法直接在浏览器中点击按钮测试，上述验证是基于代码审查完成的。

**请你按照以上步骤测试**，如果遇到任何错误，请提供：
1. 完整的控制台错误信息
2. Supabase Function日志（`supabase functions logs extract_people`）
3. 网络请求的Response（开发者工具 → Network标签）

这样我可以快速定位问题并修复。

---

**最后更新**: 2026-01-20 16:00
**部署状态**: ✅ Edge Function已部署
