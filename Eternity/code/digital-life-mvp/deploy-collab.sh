#!/bin/bash

# Collaboration Feature Deployment Script
# Executes migration using psql

set -e  # Exit on error

echo "🚀 Starting Collaboration Feature Deployment"
echo ""

# Load Supabase credentials from .env.local
if [ ! -f .env.local ]; then
    echo "❌ .env.local file not found"
    exit 1
fi

SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d '=' -f2)
SERVICE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env.local | cut -d '=' -f2)

# Extract project ref from URL (lpkvgggefyqcibodbowu)
PROJECT_REF=$(echo $SUPABASE_URL | sed 's/https:\/\///' | sed 's/\.supabase\.co//')

echo "📡 Supabase Project: $PROJECT_REF"
echo ""

# Construct database URL
# Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
# We'll use the REST API instead since we have the service key

MIGRATION_FILE="supabase/migrations/20260125_collab_feature.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "📄 Reading migration file..."
SQL_CONTENT=$(cat "$MIGRATION_FILE")

echo "📊 Migration size: $(echo "$SQL_CONTENT" | wc -c) bytes"
echo ""

# Try using Supabase SQL API
echo "🔧 Attempting to execute via Supabase REST API..."
echo ""

# Use curl to call Supabase REST API
# Note: This might not work for all SQL statements
# Alternative: Use psql with connection string

echo "⚠️  The JavaScript client cannot execute DDL statements."
echo "Please run the migration manually via Supabase Dashboard:"
echo ""
echo "1. Visit: https://supabase.com/dashboard/project/$PROJECT_REF/sql"
echo "2. Click 'New Query'"
echo "3. Copy and paste the contents of: $MIGRATION_FILE"
echo "4. Click 'Run'"
echo ""

# Verify if tables exist
echo "🔍 Checking if tables already exist..."
echo ""

# Create a simple test query
TEST_QUERY='{"query": "SELECT tablename FROM pg_tables WHERE schemaname = '\''public'\'' AND tablename LIKE '\''collab%'\'' ORDER BY tablename;"}'

RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/rest/v1/rpc/exec" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "$TEST_QUERY" 2>&1)

echo "API Response: $RESPONSE"
echo ""

# Alternative: Try using psql if available
if command -v psql &> /dev/null; then
    echo "✅ psql found. You can use psql to connect directly."
    echo ""
    echo "To deploy using psql, you'll need your database password."
    echo "Get it from: https://supabase.com/dashboard/project/$PROJECT_REF/settings/database"
    echo ""
    echo "Then run:"
    echo "psql 'postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres' -f $MIGRATION_FILE"
    echo ""
else
    echo "⚠️  psql not found. Using Supabase Dashboard is recommended."
    echo ""
fi

# Create storage bucket using Supabase Management API
echo "🗄️  Attempting to create storage bucket..."
echo ""

BUCKET_CREATE='{
  "id": "collab-audio",
  "name": "collab-audio",
  "public": false,
  "file_size_limit": 52428800,
  "allowed_mime_types": ["audio/mp4", "audio/mpeg", "audio/webm", "audio/wav", "audio/m4a"]
}'

BUCKET_RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/storage/v1/bucket" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "$BUCKET_CREATE")

if echo "$BUCKET_RESPONSE" | grep -q "name"; then
    echo "✅ Storage bucket created successfully!"
else
    echo "⚠️  Storage bucket creation response: $BUCKET_RESPONSE"
    echo "   (Bucket may already exist or need manual creation)"
fi

echo ""
echo "🎯 Next Steps:"
echo "1. Run the migration SQL in Supabase Dashboard (see instructions above)"
echo "2. Start dev server: npm run dev"
echo "3. Visit: http://localhost:3000/collab"
echo ""
echo "✅ Deployment script complete!"
