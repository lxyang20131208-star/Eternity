-- Add draft demo question for /draft page trial experience
-- This question is used to capture user trial answers before they sign up

INSERT INTO public.questions (
  id,
  text,
  text_en,
  chapter,
  created_by
) VALUES (
  'draft_demo',
  '写下一件关于家人的事，你不希望它被忘记。',
  'Write something about your family that you don''t want to be forgotten.',
  '试写',
  NULL  -- NULL created_by means it's a default question visible to everyone
)
ON CONFLICT (id) DO UPDATE SET
  text = EXCLUDED.text,
  text_en = EXCLUDED.text_en,
  chapter = EXCLUDED.chapter;
