-- ====================================
-- Photos & Videos 系统 - 完整迁移脚本
-- 执行此文件以部署整个照片系统
-- ====================================

-- 注意：请在 Supabase SQL Editor 中执行此文件
-- 或者直接执行下面两个文件：
-- 1. 20260115_photos_system.sql
-- 2. 20260115_storage_photos.sql

-- ====================================
-- 检查依赖表是否存在
-- ====================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    RAISE EXCEPTION 'projects 表不存在，请先创建基础表';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'places') THEN
    RAISE NOTICE 'places 表不存在，将使用 NULL 外键';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'events') THEN
    RAISE NOTICE 'events 表不存在，将使用 NULL 外键';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'people') THEN
    RAISE NOTICE 'people 表不存在，将使用空数组';
  END IF;
END $$;

-- ====================================
-- 执行提示
-- ====================================
\echo '====================================='
\echo '照片系统迁移脚本'
\echo '====================================='
\echo '请按顺序执行以下步骤：'
\echo '1. 在 Supabase Dashboard 打开 SQL Editor'
\echo '2. 复制并执行 20260115_photos_system.sql'
\echo '3. 复制并执行 20260115_storage_photos.sql'
\echo '4. 在 Storage 中创建 "photos" bucket（设置为 public）'
\echo '====================================='
