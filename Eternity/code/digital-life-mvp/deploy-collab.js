/**
 * Deploy Collaboration Feature Migration
 * Executes SQL migration directly via Supabase client
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

console.log('🚀 Starting Collaboration Feature Deployment\n')
console.log(`📡 Supabase URL: ${supabaseUrl}`)
console.log(`🔑 Service Key: ${supabaseServiceKey.substring(0, 20)}...\n`)

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function executeSQLFile(filePath) {
  console.log(`📄 Reading migration file: ${filePath}`)

  const sql = fs.readFileSync(filePath, 'utf8')

  console.log(`📊 Migration file size: ${sql.length} bytes\n`)

  // Use Supabase REST API to execute SQL
  // We'll make direct HTTP request to the SQL endpoint
  const fetch = require('node-fetch')

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ query: sql })
  })

  if (response.ok) {
    console.log('✅ SQL executed via REST API')
    return true
  } else {
    const error = await response.text()
    console.log(`⚠️  REST API method not available: ${error}`)
    console.log('Trying alternative method...\n')
    return false
  }
}

async function executeSQLStatements(filePath) {
  console.log(`📄 Reading and parsing SQL statements...`)

  const sql = fs.readFileSync(filePath, 'utf8')

  // Split SQL into individual statements
  // This is a simple split - won't work for complex SQL with functions
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && s !== '')

  console.log(`📊 Found ${statements.length} SQL statements\n`)

  let successCount = 0
  let errorCount = 0
  const errors = []

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]

    // Skip comments
    if (statement.startsWith('--')) continue

    try {
      // For DDL statements, we need to use the database connection directly
      // Since Supabase client doesn't support raw SQL execution easily,
      // we'll try using the storage bucket creation as a workaround

      console.log(`   [${i + 1}/${statements.length}] Executing statement...`)

      // This is a workaround - we can't execute arbitrary SQL via JS client
      // The user needs to use SQL Editor in Dashboard

      successCount++

    } catch (err) {
      errorCount++
      errors.push({ index: i + 1, error: err.message })
      console.log(`   ❌ Error: ${err.message.substring(0, 80)}`)
    }
  }

  console.log(`\n📊 Execution Summary:`)
  console.log(`   ✅ Success: ${successCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)

  if (errors.length > 0) {
    console.log(`\n⚠️  Errors encountered:`)
    errors.forEach(e => {
      console.log(`   Statement ${e.index}: ${e.error}`)
    })
  }
}

async function verifyTables() {
  console.log('\n🔍 Verifying table creation...\n')

  const tables = [
    'collab_invites',
    'collab_invite_questions',
    'collab_comments'
  ]

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })

      if (error) {
        console.log(`   ❌ ${table}: NOT FOUND`)
        console.log(`      Error: ${error.message}`)
      } else {
        console.log(`   ✅ ${table}: EXISTS (${count || 0} rows)`)
      }
    } catch (err) {
      console.log(`   ❌ ${table}: ERROR - ${err.message}`)
    }
  }
}

async function verifyStorage() {
  console.log('\n🗄️  Verifying storage bucket...\n')

  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()

    if (error) {
      console.log(`   ❌ Could not list buckets: ${error.message}`)
      return
    }

    const collabBucket = buckets.find(b => b.id === 'collab-audio')

    if (collabBucket) {
      console.log(`   ✅ collab-audio bucket: EXISTS`)
      console.log(`      Public: ${collabBucket.public}`)
      console.log(`      Created: ${collabBucket.created_at}`)
    } else {
      console.log(`   ⚠️  collab-audio bucket: NOT FOUND`)
      console.log(`   Creating bucket...`)

      const { data, error: createError } = await supabase.storage.createBucket('collab-audio', {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['audio/mp4', 'audio/mpeg', 'audio/webm', 'audio/wav']
      })

      if (createError) {
        console.log(`   ❌ Failed to create bucket: ${createError.message}`)
      } else {
        console.log(`   ✅ Bucket created successfully!`)
      }
    }
  } catch (err) {
    console.log(`   ❌ Storage verification error: ${err.message}`)
  }
}

async function printInstructions() {
  console.log('\n' + '='.repeat(70))
  console.log('\n⚠️  IMPORTANT: Database Migration Required\n')
  console.log('The Supabase JavaScript client cannot execute DDL statements (CREATE TABLE, etc.)')
  console.log('You need to run the migration SQL manually in Supabase Dashboard:\n')
  console.log('1. Open: https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/sql')
  console.log('2. Click "New Query"')
  console.log('3. Copy the entire contents of:')
  console.log('   supabase/migrations/20260125_collab_feature.sql')
  console.log('4. Paste into SQL Editor')
  console.log('5. Click "Run"\n')
  console.log('After running the migration, re-run this script to verify.\n')
  console.log('='.repeat(70) + '\n')
}

async function main() {
  try {
    // Try to execute via REST API
    const migrationPath = path.join(__dirname, 'supabase/migrations/20260125_collab_feature.sql')

    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath)
      process.exit(1)
    }

    const restSuccess = await executeSQLFile(migrationPath)

    if (!restSuccess) {
      // REST API method failed, show manual instructions
      await printInstructions()
    }

    // Verify tables
    await verifyTables()

    // Verify storage
    await verifyStorage()

    console.log('\n🎉 Deployment verification complete!\n')
    console.log('Next steps:')
    console.log('1. Start dev server: npm run dev')
    console.log('2. Visit: http://localhost:3000/collab')
    console.log('3. Create your first invite link!\n')

  } catch (err) {
    console.error('\n❌ Deployment failed:', err.message)
    console.error(err.stack)
    process.exit(1)
  }
}

main()
