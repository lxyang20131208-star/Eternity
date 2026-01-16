#!/usr/bin/env node

/**
 * Setup Supabase Storage Buckets
 * This script creates the required storage buckets for the application
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local file manually
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim()
        .replace(/^["']|["']$/g, '') // Remove quotes
        .replace(/\\n/g, '\n'); // Handle escaped newlines
      process.env[key] = value;
    }
  });
  console.log('✅ 已加载 .env.local 文件\n');
} else {
  console.error('❌ 找不到 .env.local 文件');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 错误: 缺少环境变量');
  console.error('请确保 .env.local 文件中包含:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.log('\n当前环境变量:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
  console.log('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '已设置' : '未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setupStorageBuckets() {
  console.log('🚀 开始设置 Supabase Storage Buckets...\n');

  try {
    // 1. Create biography-exports bucket
    console.log('📦 创建 biography-exports 存储桶...');
    const { data: bucket1, error: error1 } = await supabase.storage.createBucket('biography-exports', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['application/pdf']
    });

    if (error1) {
      if (error1.message.includes('already exists')) {
        console.log('✅ biography-exports 存储桶已存在');
      } else {
        console.error('❌ 创建失败:', error1.message);
      }
    } else {
      console.log('✅ biography-exports 创建成功');
    }

    // 2. Create photo-memories bucket
    console.log('📦 创建 photo-memories 存储桶...');
    const { data: bucket2, error: error2 } = await supabase.storage.createBucket('photo-memories', {
      public: true,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
    });

    if (error2) {
      if (error2.message.includes('already exists')) {
        console.log('✅ photo-memories 存储桶已存在');
      } else {
        console.error('❌ 创建失败:', error2.message);
      }
    } else {
      console.log('✅ photo-memories 创建成功');
    }

    // 3. Verify buckets
    console.log('\n📋 验证存储桶...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ 无法列出存储桶:', listError.message);
    } else {
      const targetBuckets = buckets.filter(b => 
        b.id === 'biography-exports' || b.id === 'photo-memories'
      );
      
      console.log('\n✅ 存储桶设置完成！');
      console.log('\n当前存储桶:');
      targetBuckets.forEach(bucket => {
        console.log(`  - ${bucket.id}`);
        console.log(`    公开访问: ${bucket.public ? '是' : '否'}`);
        console.log(`    文件大小限制: ${(bucket.file_size_limit / 1048576).toFixed(0)}MB`);
      });
    }

    console.log('\n🎉 设置完成！现在可以导出PDF了。');
    
  } catch (error) {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  }
}

setupStorageBuckets();
