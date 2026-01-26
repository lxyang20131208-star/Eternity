#!/bin/bash

# Elder Entry Migration Deployment Script

set -e

echo "🚀 Deploying Elder Entry Feature"
echo ""

# Load credentials
source .env.local 2>/dev/null || true

PROJECT_REF="lpkvgggefyqcibodbowu"
MIGRATION_FILE="supabase/migrations/20260125_elder_entry.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📋 Migration Deployment Required"
echo ""
echo "   Due to Supabase API limitations, DDL statements must be executed"
echo "   via the Supabase Dashboard SQL Editor."
echo ""
echo "   📝 Instructions:"
echo "   1. Open: https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
echo "   2. Click '+ New query'"
echo "   3. Copy ENTIRE contents of: ${MIGRATION_FILE}"
echo "   4. Paste into SQL Editor"
echo "   5. Click 'Run' button"
echo ""
echo "   This will create:"
echo "   - elder_entry_tokens table"
echo "   - RLS policies"
echo "   - Triggers for auto-update"
echo ""

read -p "Press ENTER after you've run the migration in Dashboard..."

echo ""
echo "🔍 Verifying migration..."
echo ""

# Run verification script
node verify-elder-deployment.mjs

echo ""
echo "✅ Deployment verification complete!"
echo ""
