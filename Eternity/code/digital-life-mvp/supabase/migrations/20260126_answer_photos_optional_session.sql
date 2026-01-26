-- Make answer_session_id optional in answer_photos to allow saving photos before session creation
-- This enables users to upload photos without immediately submitting an answer

ALTER TABLE public.answer_photos
  ALTER COLUMN answer_session_id DROP NOT NULL;

-- Add a storage_path column to track uploaded files
ALTER TABLE public.answer_photos
  ADD COLUMN IF NOT EXISTS storage_path text;

-- Update the constraint to allow null answer_session_id
ALTER TABLE public.answer_photos
  DROP CONSTRAINT IF EXISTS answer_photos_answer_session_id_fkey;

ALTER TABLE public.answer_photos
  ADD CONSTRAINT answer_photos_answer_session_id_fkey 
  FOREIGN KEY (answer_session_id) 
  REFERENCES public.answer_sessions(id) 
  ON DELETE CASCADE;
