-- Add expanded_json column to biography_outlines table
-- This stores the fully expanded chapter content with literary style

ALTER TABLE biography_outlines
ADD COLUMN IF NOT EXISTS expanded_json JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN biography_outlines.expanded_json IS 'Stores expanded chapter content with full prose text, generated using author style';
