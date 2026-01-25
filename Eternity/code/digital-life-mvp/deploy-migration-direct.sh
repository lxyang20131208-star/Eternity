#!/bin/bash

# Direct Migration Deployment using Supabase Management API
set -e

echo "🚀 Deploying Collaboration Feature via Supabase Management API"
echo ""

# Load credentials
source .env.local 2>/dev/null || true

PROJECT_REF="lpkvgggefyqcibodbowu"
SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
SERVICE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

if [ -z "$SERVICE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env.local"
    exit 1
fi

echo "📡 Project: $PROJECT_REF"
echo "🔑 Service Key: ${SERVICE_KEY:0:20}..."
echo ""

# Read migration file
MIGRATION_FILE="supabase/migrations/20260125_collab_feature.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📄 Reading migration: $MIGRATION_FILE"
SQL_CONTENT=$(cat "$MIGRATION_FILE")
echo "📊 Size: $(echo "$SQL_CONTENT" | wc -c | tr -d ' ') bytes"
echo ""

# Create storage bucket first
echo "🗄️  Step 1: Creating storage bucket 'collab-audio'..."

BUCKET_RESPONSE=$(curl -s -X POST \
  "${SUPABASE_URL}/storage/v1/bucket" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "collab-audio",
    "name": "collab-audio",
    "public": false,
    "file_size_limit": 52428800,
    "allowed_mime_types": ["audio/mp4", "audio/mpeg", "audio/webm", "audio/wav", "audio/m4a"]
  }')

if echo "$BUCKET_RESPONSE" | grep -q '"name"'; then
    echo "   ✅ Bucket created successfully"
elif echo "$BUCKET_RESPONSE" | grep -q "already exists"; then
    echo "   ✅ Bucket already exists (OK)"
else
    echo "   ⚠️  Response: $BUCKET_RESPONSE"
fi

echo ""
echo "📋 Step 2: Database Migration Required"
echo ""
echo "   Due to Supabase API limitations, DDL statements (CREATE TABLE, etc.)"
echo "   must be executed via the Supabase Dashboard SQL Editor."
echo ""
echo "   📝 Instructions:"
echo "   1. Open: https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
echo "   2. Click '+ New query'"
echo "   3. Copy ENTIRE contents of: ${MIGRATION_FILE}"
echo "   4. Paste into SQL Editor"
echo "   5. Click 'Run' button"
echo ""
echo "   ⏱️  Expected time: 2-3 minutes"
echo ""

read -p "Press ENTER after you've run the migration in Dashboard..."

echo ""
echo "🔍 Step 3: Verifying migration..."
echo ""

# Check if tables exist
echo "   Checking tables..."

for table in collab_invites collab_invite_questions collab_comments; do
    RESPONSE=$(curl -s -X GET \
      "${SUPABASE_URL}/rest/v1/${table}?select=count&limit=0" \
      -H "apikey: ${SERVICE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_KEY}" \
      -H "Prefer: count=exact")

    if echo "$RESPONSE" | grep -q "error"; then
        echo "   ❌ ${table}: NOT FOUND"
    else
        COUNT=$(echo "$RESPONSE" | grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")
        echo "   ✅ ${table}: EXISTS (${COUNT} rows)"
    fi
done

echo ""
echo "   Checking storage bucket..."

BUCKETS=$(curl -s -X GET \
  "${SUPABASE_URL}/storage/v1/bucket" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

if echo "$BUCKETS" | grep -q "collab-audio"; then
    echo "   ✅ collab-audio: EXISTS"
else
    echo "   ❌ collab-audio: NOT FOUND"
fi

echo ""
echo "🎉 Deployment verification complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Run: npm run dev"
echo "   2. Visit: http://localhost:3000/collab"
echo "   3. Create your first invite link!"
echo ""
