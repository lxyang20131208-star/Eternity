-- ====================================
-- Supabase Storage Buckets Setup
-- ====================================
-- This file sets up storage buckets for:
-- 1. biography-exports (PDF files)
-- 2. photo-memories (photo uploads)
--
-- Execute this in Supabase Dashboard > SQL Editor
-- ====================================

-- 1. Create biography-exports bucket for PDF exports
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biography-exports',
  'biography-exports',
  true,
  52428800, -- 50MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Create photo-memories bucket for photo uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-memories',
  'photo-memories',
  true,
  10485760, -- 10MB limit per photo
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ====================================
-- Policies for biography-exports bucket
-- ====================================

-- Policy: Allow authenticated users to upload PDFs to their own project folders
DROP POLICY IF EXISTS "Users can upload PDFs to their project folders" ON storage.objects;
CREATE POLICY "Users can upload PDFs to their project folders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'biography-exports' 
  AND (storage.foldername(name))[1] = 'pdfs'
);

-- Policy: Allow public read access to all PDFs
DROP POLICY IF EXISTS "Public read access to all PDFs" ON storage.objects;
CREATE POLICY "Public read access to all PDFs"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'biography-exports');

-- Policy: Allow users to delete their own PDFs
DROP POLICY IF EXISTS "Users can delete their own PDFs" ON storage.objects;
CREATE POLICY "Users can delete their own PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'biography-exports');

-- ====================================
-- Policies for photo-memories bucket
-- ====================================

-- Policy: Allow authenticated users to upload photos to their own folders
DROP POLICY IF EXISTS "Users can upload photos to own folder" ON storage.objects;
CREATE POLICY "Users can upload photos to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photo-memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to read their own photos
DROP POLICY IF EXISTS "Users can view own photos" ON storage.objects;
CREATE POLICY "Users can view own photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'photo-memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Allow users to delete their own photos
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
CREATE POLICY "Users can delete own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photo-memories'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ====================================
-- Verification Query
-- ====================================
-- Run this to verify buckets were created:
-- SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;
