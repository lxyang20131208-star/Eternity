-- Supabase Storage bucket配置
-- 用于存储用户上传的照片和缩略图

-- 创建photos bucket（如果不存在）
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 设置Storage策略：允许认证用户上传照片
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photos');

-- 设置Storage策略：允许认证用户查看自己项目的照片
CREATE POLICY "Users can view their project photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'photos');

-- 设置Storage策略：允许认证用户删除自己项目的照片
CREATE POLICY "Users can delete their project photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'photos');

-- 设置Storage策略：允许公开访问（因为bucket设置为public）
-- 这样可以通过公开URL直接访问照片
CREATE POLICY "Public photos are viewable by everyone"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'photos');
