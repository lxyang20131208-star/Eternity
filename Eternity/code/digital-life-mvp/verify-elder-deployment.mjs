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

console.log('🔍 Verifying Elder Entry Feature Deployment\n')

// Check if elder_entry_tokens table exists
try {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/elder_entry_tokens?select=count&limit=0`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'count=exact'
      }
    }
  )

  if (response.ok) {
    console.log(`✅ elder_entry_tokens table: EXISTS`)
  } else {
    console.log(`❌ elder_entry_tokens table: NOT FOUND`)
  }
} catch (err) {
  console.log(`❌ elder_entry_tokens table: ERROR`)
}

console.log('\n📝 Next steps:')
console.log('  1. npm run dev')
console.log('  2. Visit: http://localhost:3000/elderly')
console.log('  3. 或者点击导航栏的 "👴 老人录音" 按钮')
console.log('  4. Generate QR code and test with mobile device!\n')
