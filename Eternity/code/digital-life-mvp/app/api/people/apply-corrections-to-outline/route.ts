import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用 service role key 绕过 RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * POST /api/people/apply-corrections-to-outline
 * 将所有人名修正应用到传记大纲中
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // 1. 获取所有未应用到提纲的名字修正
    const { data: corrections, error: correctionsError } = await supabaseAdmin
      .from('people_name_corrections')
      .select('*')
      .eq('project_id', projectId)
      .order('applied_at', { ascending: true })

    if (correctionsError) {
      console.error('[Apply Corrections] Error fetching corrections:', correctionsError)
      return NextResponse.json({ error: correctionsError.message }, { status: 500 })
    }

    if (!corrections || corrections.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有待应用的名字修正',
        appliedCount: 0,
      })
    }

    // 2. 获取最新的传记大纲
    const { data: outlines, error: outlineError } = await supabaseAdmin
      .from('biography_outlines')
      .select('id, outline_json, version')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .not('outline_json', 'is', null)
      .order('version', { ascending: false })
      .limit(1)

    if (outlineError) {
      console.error('[Apply Corrections] Error fetching outline:', outlineError)
      return NextResponse.json({ error: outlineError.message }, { status: 500 })
    }

    if (!outlines || outlines.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到传记大纲',
        appliedCount: 0,
      })
    }

    const outline = outlines[0]
    const outlineJson = outline.outline_json

    // 3. 应用所有修正到大纲内容
    let totalReplacements = 0
    const appliedCorrections: Array<{ oldName: string; newName: string; count: number }> = []

    // 将大纲 JSON 转为字符串以便做全局替换
    let outlineString = JSON.stringify(outlineJson)

    for (const correction of corrections) {
      const oldName = correction.old_name
      const newName = correction.new_name

      // 计算替换次数
      const regex = new RegExp(escapeRegExp(oldName), 'g')
      const matches = outlineString.match(regex)
      const count = matches ? matches.length : 0

      if (count > 0) {
        outlineString = outlineString.replace(regex, newName)
        totalReplacements += count
        appliedCorrections.push({ oldName, newName, count })
      }
    }

    // 4. 如果有替换，更新大纲
    if (totalReplacements > 0) {
      const updatedOutlineJson = JSON.parse(outlineString)

      const { error: updateError } = await supabaseAdmin
        .from('biography_outlines')
        .update({
          outline_json: updatedOutlineJson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', outline.id)

      if (updateError) {
        console.error('[Apply Corrections] Error updating outline:', updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      console.log(`[Apply Corrections] Applied ${totalReplacements} replacements to outline ${outline.id}`)
    }

    return NextResponse.json({
      success: true,
      appliedCount: totalReplacements,
      corrections: appliedCorrections,
      message: totalReplacements > 0
        ? `已将 ${appliedCorrections.length} 个名字修正应用到提纲，共替换 ${totalReplacements} 处`
        : '提纲中没有需要替换的内容',
    })
  } catch (error: any) {
    console.error('[Apply Corrections] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper function to escape special regex characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
