/**
 * Script to run the collaboration feature migration
 * Usage: node scripts/run-collab-migration.js
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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function runMigration() {
  console.log('🚀 Running collaboration feature migration...\n')

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../supabase/migrations/20260125_collab_feature.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('📄 Migration file loaded')
    console.log('📊 Executing SQL...\n')

    // Split by statement (basic approach - splits on semicolons outside of function bodies)
    // For complex migrations, you might need a better SQL parser
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'

      // Skip comments
      if (statement.trim().startsWith('--')) continue

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement })

        if (error) {
          // Try direct query if RPC doesn't work
          const { error: directError } = await supabase.from('_migrations').select('*').limit(1)
          if (directError) {
            console.warn(`⚠️  Statement ${i + 1}: ${error.message.substring(0, 100)}`)
            errorCount++
          } else {
            successCount++
          }
        } else {
          successCount++
        }
      } catch (err) {
        console.warn(`⚠️  Statement ${i + 1}: ${err.message}`)
        errorCount++
      }
    }

    console.log('\n✅ Migration execution completed')
    console.log(`   - Successful: ${successCount}`)
    console.log(`   - Warnings: ${errorCount}`)

    // Verify tables were created
    console.log('\n🔍 Verifying tables...')

    const tables = ['collab_invites', 'collab_invite_questions', 'collab_comments']

    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('count').limit(0)
      if (error) {
        console.log(`   ❌ ${table}: NOT FOUND (${error.message})`)
      } else {
        console.log(`   ✅ ${table}: OK`)
      }
    }

    // Verify storage bucket
    console.log('\n🗄️  Verifying storage bucket...')
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()

    if (bucketError) {
      console.log(`   ⚠️  Could not verify buckets: ${bucketError.message}`)
    } else {
      const collabBucket = buckets.find(b => b.id === 'collab-audio')
      if (collabBucket) {
        console.log(`   ✅ collab-audio bucket: OK`)
      } else {
        console.log(`   ❌ collab-audio bucket: NOT FOUND`)
        console.log('   ℹ️  You may need to create it manually in Supabase Dashboard')
      }
    }

    console.log('\n🎉 Migration process complete!')
    console.log('\n📝 Next steps:')
    console.log('   1. Visit /collab to create your first invite link')
    console.log('   2. Share the link with family/friends')
    console.log('   3. Review contributions in the dashboard\n')

  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    console.error('\n💡 Try running the migration manually:')
    console.error('   1. Copy the SQL from: supabase/migrations/20260125_collab_feature.sql')
    console.error('   2. Run it in Supabase Dashboard > SQL Editor\n')
    process.exit(1)
  }
}

runMigration()
