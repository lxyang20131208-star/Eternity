import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/people/undo-merge
 * 撤销人物合并操作
 *
 * 流程：
 * 1. 获取合并日志
 * 2. 恢复secondary person的数据
 * 3. 恢复照片关联
 * 4. 恢复关系
 * 5. 更新primary person（减少importance_score等）
 * 6. 标记merge_log为'undone'
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, mergeLogId } = await request.json();

    // 1. 参数验证
    if (!projectId || !mergeLogId) {
      return NextResponse.json(
        { error: 'projectId and mergeLogId are required' },
        { status: 400 }
      );
    }

    console.log(
      `[Undo Merge] Starting undo for merge log ${mergeLogId}`
    );

    // 2. 获取合并日志
    const { data: mergeLog, error: logError } = await supabaseAdmin
      .from('people_merge_logs')
      .select('*')
      .eq('id', mergeLogId)
      .single();

    if (logError || !mergeLog) {
      console.error('[Undo Merge] Merge log not found:', logError);
      return NextResponse.json(
        { error: 'Merge log not found' },
        { status: 404 }
      );
    }

    if (mergeLog.status === 'undone') {
      return NextResponse.json(
        { error: 'This merge has already been undone' },
        { status: 400 }
      );
    }

    const { primary_person_id: primaryPersonId, secondary_person_id: secondaryPersonId } = mergeLog;
    const rollbackData = mergeLog.rollback_data;

    if (!rollbackData || !rollbackData.person) {
      console.error('[Undo Merge] No rollback data available');
      return NextResponse.json(
        { error: 'No rollback data available for this merge' },
        { status: 400 }
      );
    }

    // 3. 恢复secondary person
    const restoredPerson = rollbackData.person;
    const { error: restorePersonError } = await supabaseAdmin
      .from('people')
      .update({
        name: restoredPerson.name,
        aliases: restoredPerson.aliases,
        bio_snippet: restoredPerson.bio_snippet,
        relationship_to_user: restoredPerson.relationship_to_user,
        importance_score: restoredPerson.importance_score,
        extraction_status: 'confirmed',
        merged_from_id: null // 清除合并标记
      })
      .eq('id', secondaryPersonId);

    if (restorePersonError) {
      console.error('[Undo Merge] Error restoring secondary person:', restorePersonError);
      return NextResponse.json(
        { error: 'Failed to restore secondary person' },
        { status: 500 }
      );
    }

    // 4. 恢复照片关联
    const photos = rollbackData.photos || [];
    for (const photo of photos) {
      const { error: photoError } = await supabaseAdmin
        .from('people_photos')
        .update({ person_id: secondaryPersonId })
        .eq('id', photo.id);

      if (photoError) {
        console.warn('[Undo Merge] Warning restoring photo:', photoError);
      }
    }

    // 5. 恢复关系
    const relationships = rollbackData.relationships || [];
    for (const rel of relationships) {
      // 还原原始的person_a_id或person_b_id
      const updateObj: any = {
        merged_at: null,
        merge_log_id: null
      };

      if (rel.person_a_id === primaryPersonId && rel.original_person_a_id === secondaryPersonId) {
        updateObj.person_a_id = secondaryPersonId;
      }
      if (rel.person_b_id === primaryPersonId && rel.original_person_b_id === secondaryPersonId) {
        updateObj.person_b_id = secondaryPersonId;
      }

      // 检查更新是否必要
      if (Object.keys(updateObj).length > 2) {
        const { error: relError } = await supabaseAdmin
          .from('people_relationships')
          .update(updateObj)
          .eq('id', rel.id);

        if (relError) {
          console.warn('[Undo Merge] Warning restoring relationship:', relError);
        }
      }
    }

    // 6. 更新primary person（减少importance_score）
    const { data: primaryPerson, error: getPrimaryError } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('id', primaryPersonId)
      .single();

    if (!getPrimaryError && primaryPerson) {
      const updatedPrimaryData: any = {};

      // 减少importance_score
      updatedPrimaryData.importance_score = Math.max(
        0,
        (primaryPerson.importance_score || 0) - (restoredPerson.importance_score || 0)
      );

      // 移除merged_from_ids中的secondary ID
      const mergedFromIds = (primaryPerson.merged_from_ids || []).filter(
        (id: string) => id !== secondaryPersonId
      );
      updatedPrimaryData.merged_from_ids = mergedFromIds;

      // 如果没有其他合并来源，清除merged_from_id
      if (mergedFromIds.length === 0) {
        updatedPrimaryData.merged_from_id = null;
      }

      // 从别名中移除secondary的别名（仅当primary是通过keep_primary策略保留时）
      if (mergeLog.merge_strategy === 'keep_primary') {
        const secondaryAliases = new Set(restoredPerson.aliases || []);
        updatedPrimaryData.aliases = (primaryPerson.aliases || []).filter(
          (alias: string) => !secondaryAliases.has(alias)
        );
      }

      const { error: updatePrimaryError } = await supabaseAdmin
        .from('people')
        .update(updatedPrimaryData)
        .eq('id', primaryPersonId);

      if (updatePrimaryError) {
        console.warn('[Undo Merge] Warning updating primary person:', updatePrimaryError);
      }
    }

    // 7. 标记merge_log为'undone'
    const { error: updateLogError } = await supabaseAdmin
      .from('people_merge_logs')
      .update({ status: 'undone' })
      .eq('id', mergeLogId);

    if (updateLogError) {
      console.error('[Undo Merge] Error updating merge log:', updateLogError);
    }

    console.log('[Undo Merge] Undo completed successfully');

    return NextResponse.json({
      success: true,
      restoredSecondaryPerson: restoredPerson,
      message: `Successfully restored ${restoredPerson.name}`
    });

  } catch (error: any) {
    console.error('[Undo Merge] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
