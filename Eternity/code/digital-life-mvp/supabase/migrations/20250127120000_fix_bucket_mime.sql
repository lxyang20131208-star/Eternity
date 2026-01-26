update storage.buckets
set allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
where id = 'biography-exports';
