#!/usr/bin/env node

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const envContent = readFileSync(join(__dirname, '.env.local'), 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').trim()
  }
})

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

console.log('🗄️  Checking/Creating audio_files bucket...\n')

// Check if bucket exists
try {
  const checkResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    }
  })

  const buckets = await checkResponse.json()
  const audioFilesExists = buckets.find(b => b.id === 'audio_files')

  if (audioFilesExists) {
    console.log('✅ audio_files bucket already exists')
  } else {
    console.log('⚠️  audio_files bucket not found, creating...')

    // Create bucket
    const createResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: 'audio_files',
        name: 'audio_files',
        public: false,
        file_size_limit: 52428800, // 50MB
        allowed_mime_types: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/m4a']
      })
    })

    const result = await createResponse.json()

    if (createResponse.ok) {
      console.log('✅ audio_files bucket created successfully')
    } else if (result.message?.includes('already exists')) {
      console.log('✅ audio_files bucket already exists (OK)')
    } else {
      console.log('❌ Failed to create bucket:', result.message)
    }
  }
} catch (err) {
  console.error('❌ Error:', err.message)
}

console.log('\n✅ Setup complete!')
