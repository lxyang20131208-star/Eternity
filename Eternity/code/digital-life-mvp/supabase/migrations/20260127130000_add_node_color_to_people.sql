-- Add node_color column to people table
ALTER TABLE "public"."people" 
ADD COLUMN IF NOT EXISTS "node_color" text DEFAULT '#6366f1';

-- Comment on column
COMMENT ON COLUMN "public"."people"."node_color" IS 'Color of the person node in the graph';
