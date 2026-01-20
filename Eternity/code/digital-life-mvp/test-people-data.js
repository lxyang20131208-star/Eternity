// 测试脚本：检查people表中的数据
// 运行: node test-people-data.js

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 缺少环境变量')
  console.error('需要: NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function checkPeopleData() {
  console.log('🔍 检查people表中的数据...\n')

  // 1. 查询所有people记录（绕过RLS）
  const { data: allPeople, error: allError } = await supabase
    .from('people')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (allError) {
    console.error('❌ 查询失败:', allError.message)
    return
  }

  console.log(`✅ 找到 ${allPeople.length} 条人物记录:\n`)

  allPeople.forEach((person, idx) => {
    console.log(`${idx + 1}. ${person.name}`)
    console.log(`   ID: ${person.id}`)
    console.log(`   Project ID: ${person.project_id}`)
    console.log(`   关系: ${person.relationship_to_user || '未设置'}`)
    console.log(`   重要性: ${person.importance_score || 0}`)
    console.log(`   置信度: ${person.confidence_score || 0}`)
    console.log(`   状态: ${person.extraction_status || '未设置'}`)
    console.log(`   创建时间: ${person.created_at}`)
    console.log()
  })

  // 2. 检查projects表
  console.log('🔍 检查projects表...\n')

  const { data: projects, error: projectError } = await supabase
    .from('projects')
    .select('id, name, owner_id')
    .limit(5)

  if (projectError) {
    console.error('❌ 查询projects失败:', projectError.message)
    return
  }

  console.log(`✅ 找到 ${projects.length} 个项目:\n`)

  projects.forEach((proj, idx) => {
    console.log(`${idx + 1}. ${proj.name}`)
    console.log(`   ID: ${proj.id}`)
    console.log(`   Owner ID: ${proj.owner_id}`)
    console.log()
  })

  // 3. 验证people的project_id是否存在于projects表中
  if (allPeople.length > 0 && projects.length > 0) {
    console.log('🔍 验证数据关联...\n')

    const projectIds = new Set(projects.map(p => p.id))
    const orphanedPeople = allPeople.filter(person => !projectIds.has(person.project_id))

    if (orphanedPeople.length > 0) {
      console.warn(`⚠️  发现 ${orphanedPeople.length} 个孤立的people记录（project_id不存在）:`)
      orphanedPeople.forEach(p => {
        console.log(`   - ${p.name} (project_id: ${p.project_id})`)
      })
      console.log()
    } else {
      console.log('✅ 所有people记录的project_id都有效\n')
    }
  }

  // 4. 测试RLS：使用anon key查询（模拟前端）
  console.log('🔍 测试RLS（使用anon key）...\n')

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonClient = createClient(supabaseUrl, anonKey)

  const { data: anonPeople, error: anonError } = await anonClient
    .from('people')
    .select('*')
    .limit(10)

  if (anonError) {
    console.log(`❌ Anon查询失败（预期行为，需要authentication）: ${anonError.message}\n`)
  } else {
    console.log(`✅ Anon查询成功，返回 ${anonPeople.length} 条记录\n`)
    if (anonPeople.length === 0) {
      console.log('⚠️  这说明RLS正常工作，但前端也查询不到数据\n')
    }
  }
}

checkPeopleData().catch(console.error)
