-- =============================================
-- Fix Photo Storage and RLS Policies
-- =============================================

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vault',
  'vault',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'audio/webm', 'audio/mp4', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-memories',
  'photo-memories',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Create people_roster table
CREATE TABLE IF NOT EXISTS public.people_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relation TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_people_roster_user ON public.people_roster(user_id);

-- 3. Create photo_memories table
CREATE TABLE IF NOT EXISTS public.photo_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  location TEXT,
  event_date DATE,
  event_name TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photo_memories_user ON public.photo_memories(user_id);

-- 4. Create photo_people table
CREATE TABLE IF NOT EXISTS public.photo_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES public.photo_memories(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people_roster(id) ON DELETE CASCADE,
  is_unknown BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_people_photo ON public.photo_people(photo_id);

-- 5. Enable RLS
ALTER TABLE public.people_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_people ENABLE ROW LEVEL SECURITY;

-- 6. Storage policies for vault bucket
DROP POLICY IF EXISTS "vault_insert" ON storage.objects;
DROP POLICY IF EXISTS "vault_select" ON storage.objects;
DROP POLICY IF EXISTS "vault_delete" ON storage.objects;
DROP POLICY IF EXISTS "vault_select_public" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to vault" ON storage.objects;
DROP POLICY IF EXISTS "Users can view vault files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete vault files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view vault files" ON storage.objects;

CREATE POLICY "vault_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vault');

CREATE POLICY "vault_select" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'vault');

CREATE POLICY "vault_select_public" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'vault');

CREATE POLICY "vault_delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'vault');

-- 7. Storage policies for photo-memories bucket
DROP POLICY IF EXISTS "photomem_insert" ON storage.objects;
DROP POLICY IF EXISTS "photomem_select" ON storage.objects;
DROP POLICY IF EXISTS "photomem_delete" ON storage.objects;
DROP POLICY IF EXISTS "photomem_select_public" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload photos to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view photo-memories" ON storage.objects;

CREATE POLICY "photomem_insert" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'photo-memories');

CREATE POLICY "photomem_select" ON storage.objects
FOR SELECT TO authenticated USING (bucket_id = 'photo-memories');

CREATE POLICY "photomem_select_public" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'photo-memories');

CREATE POLICY "photomem_delete" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'photo-memories');

-- 8. RLS policies for people_roster
DROP POLICY IF EXISTS "people_roster_select" ON public.people_roster;
DROP POLICY IF EXISTS "people_roster_insert" ON public.people_roster;
DROP POLICY IF EXISTS "people_roster_update" ON public.people_roster;
DROP POLICY IF EXISTS "people_roster_delete" ON public.people_roster;
DROP POLICY IF EXISTS "Users can view their own people" ON public.people_roster;
DROP POLICY IF EXISTS "Users can insert their own people" ON public.people_roster;
DROP POLICY IF EXISTS "Users can update their own people" ON public.people_roster;
DROP POLICY IF EXISTS "Users can delete their own people" ON public.people_roster;

CREATE POLICY "people_roster_select" ON public.people_roster
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "people_roster_insert" ON public.people_roster
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "people_roster_update" ON public.people_roster
FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "people_roster_delete" ON public.people_roster
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 9. RLS policies for photo_memories
DROP POLICY IF EXISTS "photo_memories_select" ON public.photo_memories;
DROP POLICY IF EXISTS "photo_memories_insert" ON public.photo_memories;
DROP POLICY IF EXISTS "photo_memories_update" ON public.photo_memories;
DROP POLICY IF EXISTS "photo_memories_delete" ON public.photo_memories;
DROP POLICY IF EXISTS "Users can view their own photos" ON public.photo_memories;
DROP POLICY IF EXISTS "Users can insert their own photos" ON public.photo_memories;
DROP POLICY IF EXISTS "Users can update their own photos" ON public.photo_memories;
DROP POLICY IF EXISTS "Users can delete their own photos" ON public.photo_memories;

CREATE POLICY "photo_memories_select" ON public.photo_memories
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "photo_memories_insert" ON public.photo_memories
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "photo_memories_update" ON public.photo_memories
FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "photo_memories_delete" ON public.photo_memories
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 10. RLS policies for photo_people
DROP POLICY IF EXISTS "photo_people_select" ON public.photo_people;
DROP POLICY IF EXISTS "photo_people_insert" ON public.photo_people;
DROP POLICY IF EXISTS "photo_people_delete" ON public.photo_people;
DROP POLICY IF EXISTS "Users can view photo-people associations for their photos" ON public.photo_people;
DROP POLICY IF EXISTS "Users can insert photo-people associations for their photos" ON public.photo_people;
DROP POLICY IF EXISTS "Users can delete photo-people associations for their photos" ON public.photo_people;

CREATE POLICY "photo_people_select" ON public.photo_people
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.photo_memories pm WHERE pm.id = photo_people.photo_id AND pm.user_id = auth.uid()));

CREATE POLICY "photo_people_insert" ON public.photo_people
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.photo_memories pm WHERE pm.id = photo_people.photo_id AND pm.user_id = auth.uid()));

CREATE POLICY "photo_people_delete" ON public.photo_people
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.photo_memories pm WHERE pm.id = photo_people.photo_id AND pm.user_id = auth.uid()));

-- 11. Add answer_photos policies if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'answer_photos') THEN
    ALTER TABLE public.answer_photos ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "answer_photos_select" ON public.answer_photos;
    DROP POLICY IF EXISTS "answer_photos_insert" ON public.answer_photos;
    DROP POLICY IF EXISTS "answer_photos_delete" ON public.answer_photos;

    CREATE POLICY "answer_photos_select" ON public.answer_photos
    FOR SELECT TO authenticated
    USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

    CREATE POLICY "answer_photos_insert" ON public.answer_photos
    FOR INSERT TO authenticated
    WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

    CREATE POLICY "answer_photos_delete" ON public.answer_photos
    FOR DELETE TO authenticated
    USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));
  END IF;
END $$;
