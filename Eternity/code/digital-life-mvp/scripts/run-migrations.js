#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 错误: 缺少环境变量');
  console.error('需要: SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSql(sqlContent, fileName) {
  console.log(`\n执行 ${fileName}...`);
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sqlContent
    });
    
    if (error) {
      // 如果没有 exec_sql 函数，尝试直接执行
      console.log('尝试直接执行 SQL...');
      
      // 分割成多个语句
      const statements = sqlContent
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement) {
          const { error: execError } = await supabase.from('_exec').select('*').limit(0);
          // 这个方法不会真正工作，需要使用 psql 或 Dashboard
        }
      }
      
      throw new Error('无法通过 API 执行 SQL，请使用 Supabase Dashboard 的 SQL Editor');
    }
    
    console.log(`✅ ${fileName} 执行成功`);
    return true;
  } catch (err) {
    console.error(`❌ ${fileName} 执行失败:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📸 照片系统数据库迁移');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('\n⚠️  注意: Supabase JS SDK 不支持直接执行 DDL 语句');
  console.log('请使用以下方法之一：\n');
  
  console.log('方法 1: 使用 Supabase Dashboard (推荐)');
  console.log('  1. 访问: https://supabase.com/dashboard/project/lpkvgggefyqcibodbowu/editor');
  console.log('  2. 点击 "SQL Editor" → "+ New Query"');
  console.log('  3. 复制粘贴迁移文件内容并执行\n');
  
  console.log('方法 2: 使用 psql 命令行');
  console.log('  运行: npm run migrate:psql\n');
  
  console.log('方法 3: 手动执行');
  console.log('  迁移文件位置:');
  console.log('    - supabase/migrations/20260115_photos_system.sql');
  console.log('    - supabase/migrations/20260115_storage_photos.sql');
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
