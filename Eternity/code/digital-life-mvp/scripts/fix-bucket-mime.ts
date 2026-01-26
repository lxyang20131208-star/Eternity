
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.local');
  console.log('Please make sure you have the service role key (not anon key) for admin operations.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixBucket() {
  console.log('Attempting to update bucket configuration...');
  
  const bucketName = 'biography-exports';

  // Update bucket to allow image/png and pdf
  const { data, error } = await supabase.storage.updateBucket(bucketName, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'],
    fileSizeLimit: 52428800 // 50MB
  });

  if (error) {
    console.error('Failed to update bucket:', error);
  } else {
    console.log('✅ Bucket updated successfully!');
    console.log('Update result:', data);
  }
}

fixBucket();
