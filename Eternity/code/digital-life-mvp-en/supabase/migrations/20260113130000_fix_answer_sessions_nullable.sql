-- Allow question_id to be null for round 2 answers
ALTER TABLE public.answer_sessions ALTER COLUMN question_id DROP NOT NULL;
