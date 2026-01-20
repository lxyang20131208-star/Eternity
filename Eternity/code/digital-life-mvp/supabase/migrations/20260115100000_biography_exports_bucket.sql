-- Create biography-exports storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biography-exports',
  'biography-exports',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Note: RLS on storage.objects is already enabled by Supabase by default

-- Policy: Allow authenticated users to upload PDFs to their own project folders
CREATE POLICY "Users can upload PDFs to their project folders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'biography-exports' 
  AND (storage.foldername(name))[1] = 'pdfs'
);

-- Policy: Allow public read access to all PDFs
CREATE POLICY "Public read access to all PDFs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'biography-exports');

-- Policy: Allow users to delete their own PDFs
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'biography-exports');
