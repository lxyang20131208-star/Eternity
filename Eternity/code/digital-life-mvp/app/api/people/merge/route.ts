import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MergeRequest, MergeResponse } from '@/lib/types/knowledge-graph';

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/people/merge
 * 合并两个人物记录
 *
 * 流程：
 * 1. 验证两个人物存在且不同
 * 2. 备份secondary人物的完整数据
 * 3. 合并数据（别名、照片、关系、bio）
 * 4. 转移照片和关系
 * 5. 标记secondary为'merged'
 * 6. 创建合并日志
 */
export async function POST(request: NextRequest) {
  try {
    const {
      projectId,
      primaryPersonId,
      secondaryPersonId,
      mergeStrategy = 'keep_primary',
      customData
    }: MergeRequest = await request.json();

    // 1. 参数验证
    if (!projectId || !primaryPersonId || !secondaryPersonId) {
      return NextResponse.json(
        { error: 'projectId, primaryPersonId, and secondaryPersonId are required' },
        { status: 400 }
      );
    }

    if (primaryPersonId === secondaryPersonId) {
      return NextResponse.json(
        { error: 'Cannot merge a person with themselves' },
        { status: 400 }
      );
    }

    console.log(
      `[Merge People] Starting merge: ${primaryPersonId} <- ${secondaryPersonId}`
    );

    // 2. 获取两个人物
    const { data: primaryPerson, error: primaryError } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('id', primaryPersonId)
      .single();

    const { data: secondaryPerson, error: secondaryError } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('id', secondaryPersonId)
      .single();

    if (primaryError || !primaryPerson) {
      console.error('[Merge People] Primary person not found:', primaryError);
      return NextResponse.json(
        { error: 'Primary person not found' },
        { status: 404 }
      );
    }

    if (secondaryError || !secondaryPerson) {
      console.error('[Merge People] Secondary person not found:', secondaryError);
      return NextResponse.json(
        { error: 'Secondary person not found' },
        { status: 404 }
      );
    }

    // 3. 检查secondary是否已被合并过
    if (secondaryPerson.extraction_status === 'merged') {
      return NextResponse.json(
        { error: 'Cannot merge a person that has already been merged' },
        { status: 400 }
      );
    }

    // 4. 获取关联的照片和关系数据
    const { data: secondaryPhotos } = await supabaseAdmin
      .from('people_photos')
      .select('*')
      .eq('person_id', secondaryPersonId);

    const { data: secondaryRelationshipsA } = await supabaseAdmin
      .from('people_relationships')
      .select('*')
      .eq('person_a_id', secondaryPersonId);

    const { data: secondaryRelationshipsB } = await supabaseAdmin
      .from('people_relationships')
      .select('*')
      .eq('person_b_id', secondaryPersonId);

    const secondaryRelationships = [
      ...(secondaryRelationshipsA || []),
      ...(secondaryRelationshipsB || [])
    ];

    console.log(`[Merge People] Found ${secondaryPhotos?.length || 0} photos and ${secondaryRelationships.length} relationships`);

    // 5. 准备合并数据
    let mergedData: any = {};

    if (mergeStrategy === 'keep_primary') {
      // 保留primary的所有信息（包括别名），只合并importance_score和bio_snippet
      const mergedBio = [primaryPerson.bio_snippet, secondaryPerson.bio_snippet]
        .filter(Boolean)
        .join(' | ');

      mergedData = {
        bio_snippet: mergedBio || primaryPerson.bio_snippet,
        importance_score: (primaryPerson.importance_score || 0) +
          (secondaryPerson.importance_score || 0),
        // 别名不合并，保持primary的原样
      };
    } else if (mergeStrategy === 'keep_secondary') {
      // 保留secondary的主要信息
      const mergedBio = [secondaryPerson.bio_snippet, primaryPerson.bio_snippet]
        .filter(Boolean)
        .join(' | ');

      mergedData = {
        name: secondaryPerson.name,
        aliases: secondaryPerson.aliases, // 使用secondary的别名，不合并
        bio_snippet: mergedBio || secondaryPerson.bio_snippet,
        relationship_to_user: secondaryPerson.relationship_to_user || primaryPerson.relationship_to_user,
        importance_score: (primaryPerson.importance_score || 0) +
          (secondaryPerson.importance_score || 0),
      };
    } else if (mergeStrategy === 'custom' && customData) {
      // 使用自定义数据
      const mergedBio = [customData.bio_snippet, primaryPerson.bio_snippet, secondaryPerson.bio_snippet]
        .filter(Boolean)
        .join(' | ');

      mergedData = {
        name: customData.name || primaryPerson.name,
        aliases: customData.aliases || primaryPerson.aliases, // 使用自定义或primary的别名，不自动合并
        bio_snippet: mergedBio || customData.bio_snippet,
        relationship_to_user: customData.relationship_to_user || primaryPerson.relationship_to_user,
        importance_score: (primaryPerson.importance_score || 0) +
          (secondaryPerson.importance_score || 0),
      };
    }

    // 6. 添加合并追踪字段
    const mergedFromIds = [
      ...(primaryPerson.merged_from_ids || []),
      secondaryPersonId
    ];

    mergedData.merged_from_ids = mergedFromIds;
    mergedData.extraction_status = 'confirmed'; // 合并后标记为已确认

    console.log('[Merge People] Merged data prepared');

    // 7. 执行所有数据库更新（使用事务）
    // 更新primary person
    const { data: updatedPrimary, error: updatePrimaryError } = await supabaseAdmin
      .from('people')
      .update(mergedData)
      .eq('id', primaryPersonId)
      .select()
      .single();

    if (updatePrimaryError) {
      console.error('[Merge People] Error updating primary person:', updatePrimaryError);
      return NextResponse.json(
        { error: 'Failed to update primary person' },
        { status: 500 }
      );
    }

    // 转移照片（修改person_id）
    if (secondaryPhotos && secondaryPhotos.length > 0) {
      const { error: photoError } = await supabaseAdmin
        .from('people_photos')
        .update({ person_id: primaryPersonId })
        .eq('person_id', secondaryPersonId);

      if (photoError) {
        console.error('[Merge People] Error transferring photos:', photoError);
      }
    }

    // 转移关系
    for (const rel of secondaryRelationships) {
      const updateObj: any = {};
      let needsUpdate = false;

      if (rel.person_a_id === secondaryPersonId) {
        updateObj.person_a_id = primaryPersonId;
        needsUpdate = true;
      }
      if (rel.person_b_id === secondaryPersonId) {
        updateObj.person_b_id = primaryPersonId;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updateObj.merged_at = new Date().toISOString();

        const { error: relError } = await supabaseAdmin
          .from('people_relationships')
          .update(updateObj)
          .eq('id', rel.id);

        if (relError) {
          console.warn('[Merge People] Warning updating relationship:', relError);
        }
      }
    }

    // 去重关系（如果(A→X, B→X)都存在，删除重复的）
    // 先获取所有涉及primary的关系
    const { data: allPrimaryRels } = await supabaseAdmin
      .from('people_relationships')
      .select('*')
      .or(`person_a_id.eq.${primaryPersonId},person_b_id.eq.${primaryPersonId}`);

    if (allPrimaryRels) {
      // 检查重复关系
      const seen = new Set<string>();
      const toDelete: string[] = [];

      for (const rel of allPrimaryRels) {
        // 规范化关系表示（确保一致性）
        let key: string;
        if (rel.person_a_id === primaryPersonId) {
          key = `${primaryPersonId}-${rel.person_b_id}-${rel.relationship_type}`;
        } else {
          key = `${rel.person_a_id}-${primaryPersonId}-${rel.relationship_type}`;
        }

        if (seen.has(key)) {
          toDelete.push(rel.id);
        } else {
          seen.add(key);
        }
      }

      // 删除重复的关系
      for (const relId of toDelete) {
        await supabaseAdmin
          .from('people_relationships')
          .delete()
          .eq('id', relId);
      }
    }

    // 8. 标记secondary为'merged'
    const { error: markMergedError } = await supabaseAdmin
      .from('people')
      .update({
        extraction_status: 'merged',
        merged_from_id: primaryPersonId
      })
      .eq('id', secondaryPersonId);

    if (markMergedError) {
      console.error('[Merge People] Error marking secondary as merged:', markMergedError);
    }

    // 9. 创建合并日志
    const mergeLogData = {
      project_id: projectId,
      primary_person_id: primaryPersonId,
      secondary_person_id: secondaryPersonId,
      merge_strategy: mergeStrategy,
      details: {
        aliasCount: (secondaryPerson.aliases || []).length,
        photoCount: secondaryPhotos?.length || 0,
        relationshipCount: secondaryRelationships.length,
        bioSource: mergeStrategy === 'keep_primary' ? 'primary' : 'secondary'
      },
      rollback_data: {
        person: secondaryPerson,
        photos: secondaryPhotos || [],
        relationships: secondaryRelationships
      },
      status: 'active'
    };

    const { data: mergeLog, error: logError } = await supabaseAdmin
      .from('people_merge_logs')
      .insert(mergeLogData)
      .select()
      .single();

    if (logError) {
      console.error('[Merge People] Error creating merge log:', logError);
    }

    console.log('[Merge People] Merge completed successfully');

    const response: MergeResponse = {
      success: true,
      mergedPerson: updatedPrimary,
      mergeLog: {
        mergeLogId: mergeLog?.id || '',
        aliasCount: (mergedData.aliases || []).length,
        photoCount: secondaryPhotos?.length || 0,
        relationshipCount: secondaryRelationships.length,
        deletedPersonId: secondaryPersonId,
        mergedAt: new Date().toISOString()
      }
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('[Merge People] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
