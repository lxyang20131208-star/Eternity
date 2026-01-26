# 图书封面生成功能

## 概述
在 export 页面新增了一个图书封面生成器，允许用户为他们的传记创建专业的封面。

## 功能特性

### 1. 封面预览
- 实时预览封面效果
- 显示图书标题和作者名
- 支持背景图片或纯色渐变

### 2. 图片上传
- 支持本地图片上传
- 自动适配封面尺寸
- 添加半透明遮罩确保文字可读

### 3. AI 图片生成
- 使用 Gemini Imagen 3 API 生成专业封面图片
- 用户可以描述想要的封面风格
- 自动优化提示词以生成高质量图片

### 4. 高质量输出
- Canvas 生成分辨率：1748×2480 (A5 @ 300DPI)
- 适合专业印刷的质量
- PNG 格式输出

## 使用方法

### 前端操作
1. 在 export 页面点击"📚 生成图书封面"按钮
2. 弹出封面生成器窗口
3. 选择以下方式之一：
   - **上传图片**：点击"📤 上传图片"按钮选择本地图片
   - **AI 生成**：点击"✨ AI 生成图片"，输入描述，点击生成
4. 预览封面效果
5. 点击"💾 保存封面"保存到云端

### 后端配置

#### 1. 部署 Edge Function
```bash
cd /Users/liuxuyang/Desktop/Git\ -\ TRAE/Eternity/Eternity/code/digital-life-mvp
supabase functions deploy generate-cover-image
```

#### 2. 配置 Gemini API Key
```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
```

如果还没有 Gemini API Key，请访问：
https://makersuite.google.com/app/apikey

#### 3. 确保 Storage Bucket 存在
封面会保存到 `biography-exports` bucket 的 `covers/{projectId}/` 路径下。

检查 bucket 是否存在：
```sql
SELECT * FROM storage.buckets WHERE name = 'biography-exports';
```

如果不存在，创建：
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('biography-exports', 'biography-exports', true);
```

## 技术实现

### 文件结构
```
app/components/BookCoverGenerator.tsx    # 封面生成器组件
app/export/page.tsx                      # 添加了封面生成按钮
supabase/functions/generate-cover-image/ # AI 图片生成 Edge Function
```

### 关键技术
- **Canvas API**：用于绘制高质量封面
- **Gemini Imagen 3**：AI 图片生成
- **Supabase Storage**：保存封面图片
- **React Hooks**：状态管理

### API 调用流程
```
用户输入描述
  ↓
前端调用 supabase.functions.invoke('generate-cover-image')
  ↓
Edge Function 增强提示词
  ↓
调用 Gemini Imagen 3 API
  ↓
返回 base64 图片
  ↓
前端显示预览
  ↓
用户保存 → Canvas 生成高清版
  ↓
上传到 Supabase Storage
```

## 下一步计划

根据你的需求，下一步可以：

1. **整合到 PDF 导出**
   - 修改 PDF 生成逻辑，支持使用自定义封面
   - 在生成 PDF 时检查是否有保存的封面
   - 将封面作为 PDF 的第一页

2. **封面模板系统**
   - 提供多种预设模板
   - 支持模板参数调整（字体、颜色、布局）

3. **封面历史管理**
   - 保存多个版本的封面
   - 支持切换和删除

## 注意事项

1. **AI 生成限制**
   - Gemini API 有调用频率限制
   - 需要确保 API Key 有足够的配额
   - 生成时间可能需要几秒钟

2. **图片尺寸**
   - 上传的图片会自动缩放以适应封面
   - 建议上传至少 1200×1600 的图片以保证清晰度

3. **存储空间**
   - 每个封面约 500KB - 2MB
   - 定期清理未使用的封面可以节省空间

## 测试清单

- [ ] 点击"生成图书封面"按钮能打开弹窗
- [ ] 上传图片功能正常
- [ ] AI 生成功能正常（需要先配置 API Key）
- [ ] 封面预览显示正确
- [ ] 保存封面成功上传到 Supabase Storage
- [ ] 关闭弹窗不影响 export 页面其他功能
