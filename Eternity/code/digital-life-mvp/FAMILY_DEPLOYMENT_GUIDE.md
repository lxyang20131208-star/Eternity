# Family Page 快速部署指南

## 🚀 快速开始（5分钟部署）

### 步骤 1: 应用数据库迁移

```bash
cd /Users/gabliu/Documents/GitHub/Eternity/Eternity/code/digital-life-mvp

# 应用新的迁移文件
supabase db push
```

**预期输出**：
```
Applying migration 20260120000000_people_extraction_enhancements.sql...
✓ Finished supabase db push
```

---

### 步骤 2: 部署 Edge Function

```bash
# 部署人物抽取函数
supabase functions deploy extract_people

# 验证部署成功
supabase functions list
```

**预期输出**：
```
extract_people         deployed
```

---

### 步骤 3: 配置 Gemini API Key

```bash
# 设置 Gemini API Key（如果尚未设置）
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here

# 验证
supabase secrets list
```

---

### 步骤 4: 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000/family` 即可看到新的人物空间页面。

---

## ✅ 功能测试清单

### 1. 基础功能测试

#### 测试人物抽取
1. 确保你有至少几条回答记录（通过主页回答问题）
2. 访问 `/family` 页面
3. 点击"重新抽取人物"按钮
4. 等待抽取完成（通常10-30秒）
5. 查看抽取结果，应该显示提到的人物

**预期结果**：
- 抽取进度条显示
- 完成后显示"新增X人，更新Y人"
- 人物网络图显示抽取的人物

---

#### 测试人物编辑
1. 点击人物网络图中的任意节点
2. 人物卡片弹出
3. 点击"编辑信息"
4. 修改姓名、添加别称、选择关系、填写描述
5. 点击"保存"

**预期结果**：
- 修改成功提示
- 人物信息更新
- 如果修改了姓名，显示"请前往Export页面进行全局替换"

---

#### 测试照片归集
1. 先上传一些照片（通过 `/photos/new` 或主页上传）
2. 在照片描述/标签中提到某个人物的名字
3. 回到 `/family` 页面
4. 点击"刷新照片关联"按钮
5. 点击该人物节点查看详情

**预期结果**：
- 人物卡片中显示相关照片
- 照片来源显示（home_upload / photos_page / auto_detected）

---

#### 测试关系创建
1. 在人物网络图中按住 Shift 键
2. 依次点击两个人物节点
3. 关系创建弹窗出现
4. 选择关系类型（或输入自定义关系）
5. 点击"创建"

**预期结果**：
- 两个节点之间出现连线
- 连线上显示关系类型

---

### 2. Export 页面全局替换测试

#### 测试步骤
1. 在 `/family` 页面修改某个人物的姓名（例如："老李" → "李明"）
2. 前往 `/export` 页面
3. 在页面中集成 `<GlobalNameReplacer>` 组件（见下方代码）
4. 查看是否显示人名修正提示
5. 点击"应用全部"或"应用选中"
6. 验证书稿内容中的"老李"是否全部替换为"李明"

**Export 页面集成代码**（添加到 `app/export/page.tsx`）：

```tsx
import GlobalNameReplacer from '@/components/GlobalNameReplacer'

// 在 Export 页面的编辑器上方添加
{projectId && expandedContent && (
  <GlobalNameReplacer
    projectId={projectId}
    content={expandedContent}
    onReplace={(newContent) => {
      setExpandedContent(newContent)
      // 可选：同时更新数据库
    }}
  />
)}
```

**预期结果**：
- 显示黄色提示框"人名修正提醒"
- 列出所有修正记录（旧名→新名）
- 显示在当前内容中找到X处
- 点击应用后，内容中的旧名全部替换为新名

---

## 🔍 故障排查

### 问题 1: 抽取任务一直卡在"处理中"

**原因**：Edge Function 可能遇到错误

**解决方案**：
```bash
# 查看函数日志
supabase functions logs extract_people --tail

# 检查是否有错误信息
# 常见错误：
# - GEMINI_API_KEY not configured
# - No transcripts found
# - API rate limit exceeded
```

---

### 问题 2: 人物网络图不显示

**原因**：前端组件加载失败或数据为空

**解决方案**：
1. 打开浏览器开发者工具（F12）
2. 查看 Console 是否有错误
3. 查看 Network 标签，检查 API 请求是否成功
4. 确认 `/api/people?projectId=xxx` 返回了数据

---

### 问题 3: 照片归集没有照片

**原因**：照片描述中没有提到人物名字

**解决方案**：
1. 确认照片的 caption/tags 中包含人物名字
2. 检查人物的 aliases（别称）是否正确
3. 在 `/api/people/photos` 的代码中添加日志，查看匹配逻辑

---

### 问题 4: 全局替换不生效

**原因**：
- 没有人名修正记录
- 内容中不包含旧名字
- Export 页面未集成 GlobalNameReplacer 组件

**解决方案**：
1. 确认数据库中有 `people_name_corrections` 记录
2. 确认 Export 页面已添加 `<GlobalNameReplacer>` 组件
3. 检查 `/api/people/name-corrections?projectId=xxx` 返回数据

---

## 📊 数据库验证

### 验证迁移是否成功

```sql
-- 检查新表是否创建
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'people_relationships',
    'people_extraction_jobs',
    'people_photos',
    'people_name_corrections'
  );
```

**预期结果**：应该返回4行数据

---

### 验证Edge Function是否可调用

```bash
# 使用 cURL 测试
curl -X POST \
  https://your-project.supabase.co/functions/v1/extract_people \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"your-project-id"}'
```

**预期结果**：返回 JSON，包含 `jobId` 字段

---

## 🎯 下一步

### 1. 优化 UI/UX
- 调整人物网络图的布局参数（半径、力度等）
- 优化人物卡片的样式
- 添加加载骨架屏

### 2. 增强功能
- 实现人物合并功能
- 添加家族树视图切换
- 实现人脸识别自动归集照片

### 3. 性能优化
- 当人物数量>50时，实现分页/筛选
- 照片归集改为后端全文搜索
- 人物网络图使用 WebGL 渲染

---

## 📞 需要帮助？

如果遇到问题，请检查：

1. **数据库日志**：`supabase logs db`
2. **Edge Function日志**：`supabase functions logs extract_people`
3. **浏览器Console**：检查前端错误
4. **Network请求**：检查API调用是否成功

---

**祝部署顺利！** 🎉
