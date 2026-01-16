#!/usr/bin/env node

/**
 * 数据库迁移脚本
 * 使用 Supabase Management API 执行 SQL 迁移
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://lpkvgggefyqcibodbowu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwa3ZnZ2dlZnlxY2lib2Rib3d1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk2OTM1OSwiZXhwIjoyMDgxNTQ1MzU5fQ.rcC-K5QwcpwV38AYJ5yCvAA_2-BGowGyifWvnRcaKBo';

async function runMigration(sqlFile) {
  try {
    console.log(`\n执行迁移: ${sqlFile}`);
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      console.error(`❌ 失败: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text);
      return false;
    }

    console.log('✅ 成功');
    return true;
  } catch (error) {
    console.error(`❌ 错误: ${error.message}`);
    return false;
  }
}

async function main() {
  const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
  
  const migrations = [
    '20260115_photo_memories.sql',
    '20260115_photo_storage.sql'
  ];

  console.log('开始数据库迁移...\n');
  
  let successCount = 0;
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ 跳过: ${migration} (文件不存在)`);
      continue;
    }
    
    const success = await runMigration(filePath);
    if (success) successCount++;
  }

  console.log(`\n完成: ${successCount}/${migrations.length} 个迁移成功`);
}

main().catch(console.error);
