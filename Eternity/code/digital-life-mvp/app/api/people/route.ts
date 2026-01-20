import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/people?projectId=xxx
 * 获取项目中的所有人物
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // 查询人物（使用admin client绕过RLS）
    const { data: people, error } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('project_id', projectId)
      .order('importance_score', { ascending: false })

    if (error) {
      console.error('[API Get People] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[API Get People] Found ${people?.length || 0} people for project ${projectId}`)

    return NextResponse.json({ people: people || [] })
  } catch (error: any) {
    console.error('[API Get People] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/people
 * 更新人物信息（纠错、补充）
 */
export async function PATCH(request: NextRequest) {
  try {
    const { personId, updates, applyGlobalNameCorrection } = await request.json()

    if (!personId || !updates) {
      return NextResponse.json({ error: 'personId and updates are required' }, { status: 400 })
    }


    // 如果修改了姓名且需要全局替换
    if (applyGlobalNameCorrection && updates.name) {
      // 获取原始人物信息
      const { data: person, error: personError } = await supabaseAdmin
        .from('people')
        .select('name, project_id')
        .eq('id', personId)
        .single()

      if (personError || !person) {
        return NextResponse.json({ error: 'Person not found' }, { status: 404 })
      }

      const oldName = person.name
      const newName = updates.name

      // 记录人名修正历史
      await supabaseAdmin.from('people_name_corrections').insert({
        person_id: personId,
        project_id: person.project_id,
        old_name: oldName,
        new_name: newName,
        correction_scope: 'global_transcripts',
        affected_records: [],
      })

      // 保存 original_name（如果是第一次修改）
      if (!updates.original_name) {
        updates.original_name = oldName
      }

      // 标记为已确认
      updates.extraction_status = 'confirmed'
    }

    // 更新人物信息
    const { data: updatedPerson, error: updateError } = await supabaseAdmin
      .from('people')
      .update(updates)
      .eq('id', personId)
      .select()
      .single()

    if (updateError) {
      console.error('[API Update Person] Error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ person: updatedPerson })
  } catch (error: any) {
    console.error('[API Update Person] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/people?personId=xxx
 * 删除人物
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const personId = searchParams.get('personId')

    if (!personId) {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 })
    }


    const { error } = await supabaseAdmin.from('people').delete().eq('id', personId)

    if (error) {
      console.error('[API Delete Person] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API Delete Person] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
