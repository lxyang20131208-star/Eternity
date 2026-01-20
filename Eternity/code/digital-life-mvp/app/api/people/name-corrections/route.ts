import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

/**
 * GET /api/people/name-corrections?projectId=xxx
 * 获取所有人名修正记录（用于Export页面的全局替换）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }


    const { data: corrections, error } = await supabase
      .from('people_name_corrections')
      .select('*')
      .eq('project_id', projectId)
      .order('applied_at', { ascending: false })

    if (error) {
      console.error('[API Get Name Corrections] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ corrections })
  } catch (error: any) {
    console.error('[API Get Name Corrections] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/people/name-corrections
 * 应用全局人名替换
 */
export async function POST(request: NextRequest) {
  try {
    const { personId, projectId, oldName, newName, targetContent } = await request.json()

    if (!personId || !projectId || !oldName || !newName || !targetContent) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // 执行全局替换
    const replacedContent = targetContent.replace(
      new RegExp(escapeRegExp(oldName), 'g'),
      newName
    )

    const replacementCount = (targetContent.match(new RegExp(escapeRegExp(oldName), 'g')) || []).length


    // 记录修正历史
    const { data: correction, error } = await supabase
      .from('people_name_corrections')
      .insert({
        person_id: personId,
        project_id: projectId,
        old_name: oldName,
        new_name: newName,
        correction_scope: 'global_transcripts',
        affected_records: [{ type: 'manual_content', replacement_count: replacementCount }],
      })
      .select()
      .single()

    if (error) {
      console.error('[API Apply Name Correction] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      replacedContent,
      replacementCount,
      correction,
    })
  } catch (error: any) {
    console.error('[API Apply Name Correction] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper function to escape special regex characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
