
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testCoverGeneration() {
  console.log('🧪 Starting AI Cover Generation Test...');
  console.log('Target Function: generate-cover-image');

  const testPayload = {
    prompt: "A futuristic city in the clouds, golden hour, cinematic lighting",
    bookTitle: "Test Book Title",
    authorName: "Test Author"
  };

  const startTime = Date.now();

  try {
    const { data, error } = await supabase.functions.invoke('generate-cover-image', {
      body: testPayload,
    });

    const duration = Date.now() - startTime;

    if (error) {
      console.error('❌ Edge Function Error:', error);
      // Try to parse if it's a JSON error body
      try {
        const errBody = JSON.parse(error.message);
        console.error('Error Details:', errBody);
      } catch (e) {
        // ignore
      }
      return;
    }

    if (!data) {
      console.error('❌ No data returned');
      return;
    }

    if (data.imageUrl) {
      console.log('✅ Success!');
      console.log(`⏱️ Duration: ${duration}ms`);
      console.log(`📦 Image URL Length: ${data.imageUrl.length} chars`);
      console.log(`🎨 Format: ${data.imageUrl.substring(0, 30)}...`);
      
      if (data.imageUrl.startsWith('data:image/svg+xml')) {
        console.log('ℹ️  Result Type: SVG (Vector)');
      } else if (data.imageUrl.startsWith('data:image/png')) {
        console.log('ℹ️  Result Type: PNG (Bitmap)');
      } else {
        console.log('⚠️  Unknown Image Type');
      }
    } else {
      console.error('❌ Response missing imageUrl:', data);
    }

  } catch (err) {
    console.error('❌ Unexpected Error:', err);
  }
}

testCoverGeneration();
