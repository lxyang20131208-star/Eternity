#!/bin/bash

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📸 照片系统数据库迁移"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "请输入 Supabase 数据库密码: "
read -s DB_PASS
echo ""

if [ -z "$DB_PASS" ]; then
    echo "❌ 密码不能为空"
    exit 1
fi

export PGPASSWORD="$DB_PASS"

DB_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT="6543"
DB_NAME="postgres"
DB_USER="postgres.lpkvgggefyqcibodbowu"

echo "正在连接数据库..."
echo ""

echo "执行第一个迁移: 20260115_photos_system.sql"
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -f "supabase/migrations/20260115_photos_system.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ photos_system.sql 执行成功"
    echo ""
else
    echo ""
    echo "❌ photos_system.sql 执行失败"
    exit 1
fi

echo "执行第二个迁移: 20260115_storage_photos.sql"
psql -h "$DB_HOST" -p "$DB_PORT" -d "$DB_NAME" -U "$DB_USER" -f "supabase/migrations/20260115_storage_photos.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ storage_photos.sql 执行成功"
    echo ""
else
    echo ""
    echo "❌ storage_photos.sql 执行失败"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 所有迁移执行完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "下一步:"
echo "1. 创建 Storage Bucket (photos)"
echo "   访问: https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/storage/buckets"
echo ""
echo "2. 测试照片功能"
echo "   访问: http://localhost:3000/photos"
echo ""
