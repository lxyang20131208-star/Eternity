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

console.log('🔍 Verifying Collaboration Feature Deployment\n')

const tables = ['collab_invites', 'collab_invite_questions', 'collab_comments']
let allTablesExist = true

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
      console.log(`✅ ${table}: EXISTS`)
    } else {
      console.log(`❌ ${table}: NOT FOUND`)
      allTablesExist = false
    }
  } catch (err) {
    console.log(`❌ ${table}: ERROR`)
    allTablesExist = false
  }
}

const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`
  }
})

const buckets = await response.json()
const collabBucket = buckets.find(b => b.id === 'collab-audio')

if (collabBucket) {
  console.log(`✅ collab-audio bucket: EXISTS`)
} else {
  console.log(`❌ collab-audio bucket: NOT FOUND`)
}

console.log()

if (allTablesExist && collabBucket) {
  console.log('🎉 DEPLOYMENT SUCCESSFUL!\n')
  console.log('Next steps:')
  console.log('  1. npm run dev')
  console.log('  2. Visit: http://localhost:3000/collab')
  console.log('  3. Create your first invite link!\n')
} else {
  console.log('⚠️  Some components are missing.')
  console.log('Please run the SQL migration in Supabase Dashboard.\n')
}
