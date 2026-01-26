-- Elder Entry Feature Migration
-- Adds support for elderly scanning QR code to record answers

-- Add elder_entry_secret to auth.users metadata
-- Since we can't directly modify auth.users, we'll use a separate table

-- Create elder_entry_tokens table
CREATE TABLE IF NOT EXISTS elder_entry_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create index for fast lookup
CREATE INDEX idx_elder_entry_tokens_user_id ON elder_entry_tokens(user_id);
CREATE INDEX idx_elder_entry_tokens_secret ON elder_entry_tokens(secret_token);

-- RLS policies for elder_entry_tokens
ALTER TABLE elder_entry_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own token
CREATE POLICY "elder_entry_tokens_read_own" ON elder_entry_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can update their own token (for reset)
CREATE POLICY "elder_entry_tokens_update_own" ON elder_entry_tokens
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can insert their own token
CREATE POLICY "elder_entry_tokens_insert_own" ON elder_entry_tokens
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_elder_entry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER elder_entry_tokens_updated_at
  BEFORE UPDATE ON elder_entry_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_elder_entry_updated_at();

-- Note: We'll reuse the existing answer_sessions table for storing recordings
-- No need to create a new voice_answers table
-- answer_sessions already has:
-- - user_id / project_id / question_id
-- - audio_file_path
-- - transcript_text
-- - duration_seconds
-- - status
