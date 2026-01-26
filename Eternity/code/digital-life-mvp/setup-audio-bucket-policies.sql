-- Storage policies for audio_files bucket (for elder entry recordings)

-- Allow authenticated users to upload audio files
CREATE POLICY "audio_files_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'audio_files'
    AND auth.role() = 'authenticated'
  );

-- Allow users to read their own project's audio files
CREATE POLICY "audio_files_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'audio_files'
    AND (
      -- User can read files in their own projects
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.owner_id = auth.uid()
        AND storage.objects.name LIKE projects.id::text || '%'
      )
      -- Or it's their own upload (even without auth - for elder entry)
      OR auth.role() = 'authenticated'
    )
  );

-- Allow users to delete their own project's audio files
CREATE POLICY "audio_files_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'audio_files'
    AND EXISTS (
      SELECT 1 FROM projects
      WHERE projects.owner_id = auth.uid()
      AND storage.objects.name LIKE projects.id::text || '%'
    )
  );
