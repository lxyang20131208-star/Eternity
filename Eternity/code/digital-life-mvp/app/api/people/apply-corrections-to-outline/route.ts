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

    // 2. 获取所有的传记大纲（不只是最新版本，而是所有已完成的版本）
    const { data: outlines, error: outlineError } = await supabaseAdmin
      .from('biography_outlines')
      .select('id, outline_json, version')
      .eq('project_id', projectId)
      .eq('status', 'done')
      .not('outline_json', 'is', null)
      .order('version', { ascending: false })

    if (outlineError) {
      console.error('[Apply Corrections] Error fetching outlines:', outlineError)
      return NextResponse.json({ error: outlineError.message }, { status: 500 })
    }

    if (!outlines || outlines.length === 0) {
      return NextResponse.json({
        success: true,
        message: '没有找到传记大纲',
        appliedCount: 0,
      })
    }

    console.log(`[Apply Corrections] Found ${outlines.length} outlines to process`)

    // 3. 应用所有修正到所有大纲内容
    let totalReplacements = 0
    let outlinesUpdated = 0
    const correctionCounts: Map<string, { oldName: string; newName: string; count: number }> = new Map()

    // 遍历所有大纲
    for (const outline of outlines) {
      let outlineString = JSON.stringify(outline.outline_json)
      let outlineReplacements = 0

      for (const correction of corrections) {
        const oldName = correction.old_name
        const newName = correction.new_name

        // 计算替换次数
        const regex = new RegExp(escapeRegExp(oldName), 'g')
        const matches = outlineString.match(regex)
        const count = matches ? matches.length : 0

        if (count > 0) {
          outlineString = outlineString.replace(regex, newName)
          outlineReplacements += count
          totalReplacements += count

          // 累加统计
          const key = `${oldName}→${newName}`
          if (correctionCounts.has(key)) {
            correctionCounts.get(key)!.count += count
          } else {
            correctionCounts.set(key, { oldName, newName, count })
          }
        }
      }

      // 如果这个大纲有替换，更新它
      if (outlineReplacements > 0) {
        const updatedOutlineJson = JSON.parse(outlineString)

        const { error: updateError } = await supabaseAdmin
          .from('biography_outlines')
          .update({
            outline_json: updatedOutlineJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', outline.id)

        if (updateError) {
          console.error(`[Apply Corrections] Error updating outline ${outline.id}:`, updateError)
          // 继续处理其他大纲，不中断
        } else {
          outlinesUpdated++
          console.log(`[Apply Corrections] Applied ${outlineReplacements} replacements to outline ${outline.id} (version ${outline.version})`)
        }
      }
    }

    // 转换统计结果为数组
    const finalCorrections = Array.from(correctionCounts.values())

    return NextResponse.json({
      success: true,
      appliedCount: totalReplacements,
      outlinesUpdated,
      totalOutlines: outlines.length,
      corrections: finalCorrections,
      message: totalReplacements > 0
        ? `已将 ${finalCorrections.length} 个名字修正应用到 ${outlinesUpdated} 个提纲版本，共替换 ${totalReplacements} 处`
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
