# Photos & Videos 模块部署指南

## 功能概述

完整的照片上传、组织和管理系统，包括：

### MVP 功能 ✅
1. **照片上传** - 支持拖拽、多选、自动压缩和缩略图生成
2. **照片库** - 网格视图、全部/待整理切换、搜索过滤
3. **照片详情** - 大图展示、编辑标题描述、EXIF信息、删除
4. **提醒系统** - 欢迎提醒、不活跃提醒、上下文提醒
5. **移动端拍摄** - 相机捕获，专门用于扫描纸质老照片
6. **未整理队列** - 批量标记人物地点、批量标记已整理
7. **共享组件** - PhotoCard、UploadProgress、ReminderCard

## 文件结构

```
/supabase/migrations/
  20260115_photos_system.sql      # 数据库表结构和RLS策略
  20260115_storage_photos.sql     # Storage bucket配置

/lib/
  photoUpload.ts                  # 上传工具函数（压缩、EXIF、缩略图）
  photosApi.ts                    # 完整的CRUD API
  types/photos.ts                 # TypeScript类型定义

/app/photos/
  page.tsx                        # 照片库主页（网格视图）
  upload/page.tsx                 # 上传页面
  [id]/page.tsx                   # 照片详情页
  reminders/page.tsx              # 提醒管理页
  camera/page.tsx                 # 移动端相机拍摄
  unsorted/page.tsx               # 未整理队列

/app/components/
  PhotoCard.tsx                   # 照片卡片组件
  UploadProgress.tsx              # 上传进度组件
  ReminderCard.tsx                # 提醒卡片组件
```

## 部署步骤

### 1. 数据库迁移

```bash
# 进入项目目录
cd /Users/liuxuyang/Desktop/Eternity/code/digital-life-mvp

# 应用数据库迁移
supabase db push

# 或者手动执行SQL文件
psql -h your-db-host -U postgres -d your-db-name -f supabase/migrations/20260115_photos_system.sql
psql -h your-db-host -U postgres -d your-db-name -f supabase/migrations/20260115_storage_photos.sql
```

### 2. 创建Storage Bucket

在Supabase Dashboard中：
1. 进入 Storage
2. 创建新的bucket：`photos`
3. 设置为 Public bucket
4. 配置RLS策略（已在SQL中定义）

### 3. 环境变量配置

确保 `.env.local` 包含：

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 4. 安装依赖并运行

```bash
# 安装依赖（如果需要）
npm install

# 开发环境运行
npm run dev

# 生产环境构建
npm run build
npm start
```

## 核心功能说明

### 1. 照片上传流程

1. 用户选择文件或拖拽上传
2. 前端验证文件类型和大小（最大10MB）
3. 自动压缩原图（大于2MB）
4. 生成缩略图（400px宽）
5. 提取EXIF数据（拍摄时间、相机信息、GPS等）
6. 上传到Supabase Storage
7. 创建数据库记录

### 2. 提醒系统逻辑

**欢迎提醒（Welcome）**
- 新用户注册后自动创建
- 引导用户上传第一批照片

**不活跃提醒（Inactive）**
- 检测用户X天未上传照片
- 可配置检测间隔（默认14天）

**上下文提醒（Contextual）**
- 用户提到某人物/事件时触发
- 智能推荐上传相关照片

**提醒操作**
- 立即上传：跳转到上传页面并标记完成
- 稍后提醒：Snooze 3天/1周
- 忽略：永久关闭该提醒

### 3. 移动端拍摄体验

- 自动请求相机权限
- 默认使用后置摄像头（environment）
- 支持切换前后摄像头
- 拍摄提示：保持平整、光线充足
- 自动标记source='scan'
- 直接上传或重拍

### 4. 批量整理功能

- 多选照片（checkbox）
- 全选/取消全选
- 批量标记为已整理
- 显示缺失信息标签（缺少人物/地点）

## API 使用示例

```typescript
// 上传照片
const result = await uploadPhoto(file, projectId, {
  generateThumbnail: true,
  extractExif: true,
  maxWidth: 1920,
  quality: 0.85,
});

// 创建数据库记录
const photo = await createPhoto(result.photo);

// 查询照片（带过滤）
const photos = await getPhotos(projectId, {
  person_ids: ['person-uuid'],
  tags: ['family', 'vacation'],
  date_from: '2023-01-01',
  date_to: '2023-12-31',
  search: 'beach',
  is_sorted: false,
  sort_by: 'taken_at',
  sort_order: 'desc',
});

// 批量更新
await batchUpdatePhotos(['photo-id-1', 'photo-id-2'], {
  is_sorted: true,
  tags: ['vacation'],
});

// 获取未整理统计
const stats = await getUnsortedStats(projectId);
console.log(stats.total_count); // 100
console.log(stats.without_person); // 30
console.log(stats.without_place); // 45
```

## 待优化功能（V2）

以下功能在MVP中未实现，可作为下一阶段开发：

1. **人脸识别** - 使用`photo_faces`表存储人脸边界框和识别结果
2. **智能相册** - 基于smart_rules自动生成相册
3. **地图视图** - 基于GPS数据在地图上展示照片
4. **时间轴视图** - 按时间线组织照片
5. **导出功能** - 导出选定照片为ZIP
6. **协作功能** - 邀请家人共同整理照片
7. **AI描述生成** - 自动生成照片描述和标签
8. **重复照片检测** - 检测并合并重复照片

## 常见问题

### Q: 如何获取projectId？
A: 从用户session或Supabase Auth中获取当前用户的项目ID。需要在代码中替换`'YOUR_PROJECT_ID'`占位符。

### Q: EXIF提取不完整？
A: 简化版实现只提取基本信息。完整EXIF需要集成`exif-js`或`piexifjs`库。

### Q: 上传大文件卡顿？
A: 已实现自动压缩（>2MB）。可调整`maxWidth`和`quality`参数进一步优化。

### Q: Storage权限错误？
A: 确保RLS策略正确配置，检查用户是否已认证。

### Q: 移动端相机无法访问？
A: 需要HTTPS或localhost环境。检查浏览器相机权限设置。

## 支持与反馈

如有问题或建议，请通过以下方式联系：
- GitHub Issues
- 项目文档
- 技术支持团队

---

**部署完成后记得测试所有核心功能！**
