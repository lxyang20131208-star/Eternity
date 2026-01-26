-- Migration: Add audio_file_path and recording_method to answer_sessions
-- Created: 2026-01-25
-- Description: Support for elder entry recordings with file path storage

-- Add audio_file_path column to store file path in storage bucket
ALTER TABLE public.answer_sessions
ADD COLUMN IF NOT EXISTS audio_file_path TEXT;

-- Add recording_method column to distinguish elder entry recordings
ALTER TABLE public.answer_sessions
ADD COLUMN IF NOT EXISTS recording_method TEXT DEFAULT 'normal' CHECK (recording_method IN ('normal', 'elder_entry', 'collaboration'));

-- Add duration_seconds column to store audio duration
ALTER TABLE public.answer_sessions
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Create index for faster filtering by recording method
CREATE INDEX IF NOT EXISTS idx_answer_sessions_recording_method ON public.answer_sessions(recording_method);

-- Add comments
COMMENT ON COLUMN public.answer_sessions.audio_file_path IS 'Path to audio file in Supabase storage (audio_files bucket)';
COMMENT ON COLUMN public.answer_sessions.recording_method IS 'Method used to record: normal (default), elder_entry (QR code), collaboration (shared project)';
COMMENT ON COLUMN public.answer_sessions.duration_seconds IS 'Duration of audio recording in seconds';
