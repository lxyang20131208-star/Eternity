#!/usr/bin/env node

/**
 * Direct SQL Migration Runner
 * Executes the collaboration feature migration using Supabase REST API
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

console.log('🚀 Collaboration Feature Migration Deployment\n')
console.log(`📡 Supabase URL: ${SUPABASE_URL}`)
console.log(`🔑 Service Key: ${SERVICE_KEY.substring(0, 20)}...\n`)

// Read migration file
const migrationPath = join(__dirname, 'supabase/migrations/20260125_collab_feature.sql')
const sql = readFileSync(migrationPath, 'utf8')

console.log(`📄 Migration file: ${migrationPath}`)
console.log(`📊 Size: ${sql.length} bytes\n`)

// Create storage bucket first
async function createStorageBucket() {
  console.log('🗄️  Creating storage bucket...')

  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: 'collab-audio',
      name: 'collab-audio',
      public: false,
      file_size_limit: 52428800,
      allowed_mime_types: ['audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/wav', 'audio/m4a']
    })
  })

  const result = await response.json()

  if (response.ok) {
    console.log('   ✅ Storage bucket created successfully\n')
  } else if (result.message?.includes('already exists')) {
    console.log('   ✅ Storage bucket already exists (OK)\n')
  } else {
    console.log(`   ⚠️  ${result.message || 'Unknown error'}\n`)
  }
}

// Execute SQL migration
async function runMigration() {
  console.log('📋 Executing SQL migration...\n')

  // Split SQL into statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`   Found ${statements.length} SQL statements\n`)

  // Unfortunately, Supabase REST API doesn't support arbitrary SQL execution
  // We need to use the Dashboard SQL Editor

  console.log('⚠️  IMPORTANT: SQL Migration Required\n')
  console.log('The Supabase REST API does not support DDL statement execution.')
  console.log('You must run the migration via Supabase Dashboard:\n')
  console.log('1. Visit: https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/sql')
  console.log('2. Click "+ New query"')
  console.log('3. Copy and paste the ENTIRE contents of:')
  console.log(`   ${migrationPath}`)
  console.log('4. Click "Run" button\n')
  console.log('This will create:')
  console.log('   - collab_invites table')
  console.log('   - collab_invite_questions table')
  console.log('   - collab_comments table')
  console.log('   - RLS policies for all tables')
  console.log('   - Storage policies\n')
}

// Verify tables
async function verifyTables() {
  console.log('🔍 Verifying table creation...\n')

  const tables = ['collab_invites', 'collab_invite_questions', 'collab_comments']

  for (const table of tables) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?select=count&limit=0`,
        {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Prefer': 'count=exact'
          }
        }
      )

      if (response.ok) {
        const countHeader = response.headers.get('content-range')
        const count = countHeader ? countHeader.split('/')[1] : '0'
        console.log(`   ✅ ${table}: EXISTS (${count} rows)`)
      } else {
        const error = await response.json()
        console.log(`   ❌ ${table}: NOT FOUND`)
        if (error.message) {
          console.log(`      ${error.message}`)
        }
      }
    } catch (err) {
      console.log(`   ❌ ${table}: ERROR - ${err.message}`)
    }
  }

  console.log()
}

// Verify storage
async function verifyStorage() {
  console.log('🗄️  Verifying storage bucket...\n')

  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    })

    const buckets = await response.json()

    const collabBucket = buckets.find(b => b.id === 'collab-audio')

    if (collabBucket) {
      console.log(`   ✅ collab-audio: EXISTS`)
      console.log(`      Public: ${collabBucket.public}`)
    } else {
      console.log(`   ❌ collab-audio: NOT FOUND`)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  console.log()
}

// Main execution
async function main() {
  try {
    await createStorageBucket()
    await runMigration()
    await verifyTables()
    await verifyStorage()

    console.log('✅ Deployment script complete!\n')
    console.log('📝 Next steps:')
    console.log('   1. Run the SQL migration in Supabase Dashboard (see instructions above)')
    console.log('   2. Start dev server: npm run dev')
    console.log('   3. Visit: http://localhost:3000/collab\n')

  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
