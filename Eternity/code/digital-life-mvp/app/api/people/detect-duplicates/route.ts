import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Person, DuplicateGroup } from '@/lib/types/knowledge-graph';
import { detectSimilarPairs, groupSimilarPeople } from '@/lib/utils/similarity';

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/people/detect-duplicates
 * 检测项目中的相似/重复人物
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    console.log(`[Detect Duplicates] Starting detection for project ${projectId}`);

    // 1. 获取项目中所有人物（排除已合并的）
    const { data: people, error: fetchError } = await supabaseAdmin
      .from('people')
      .select('*')
      .eq('project_id', projectId)
      .neq('extraction_status', 'merged')
      .order('importance_score', { ascending: false });

    if (fetchError) {
      console.error('[Detect Duplicates] Fetch error:', fetchError);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!people || people.length === 0) {
      console.log('[Detect Duplicates] No people found');
      return NextResponse.json({
        success: true,
        duplicateGroups: [],
        totalDuplicates: 0,
        processingTime: Date.now() - startTime
      });
    }

    console.log(`[Detect Duplicates] Found ${people.length} people`);

    // 打印所有人物的名字和别名，便于调试
    console.log('[Detect Duplicates] All people names:', people.map(p => ({
      id: p.id,
      name: p.name,
      aliases: p.aliases || [],
      extraction_status: p.extraction_status
    })));

    // 特别检查是否有名为"刘雪丽"的人物
    const liuXueliPeople = people.filter(p => p.name.includes('刘雪丽') || p.name.includes('刘雪') || p.name.includes('雪丽'));
    if (liuXueliPeople.length > 0) {
      console.log(`[Detect Duplicates] Found ${liuXueliPeople.length} people with name containing "刘雪丽/刘雪/雪丽":`, liuXueliPeople.map(p => ({
        id: p.id,
        name: p.name,
        nameBytes: [...p.name].map(c => c.charCodeAt(0)),
        aliases: p.aliases,
        extraction_status: p.extraction_status
      })));
    }

    // 2. 检测相似人物对（阈值0.7）
    const similarPairs = detectSimilarPairs(people as Person[], 0.7);

    console.log(`[Detect Duplicates] Found ${similarPairs.length} similar pairs`);

    if (similarPairs.length === 0) {
      return NextResponse.json({
        success: true,
        duplicateGroups: [],
        totalDuplicates: 0,
        processingTime: Date.now() - startTime
      });
    }

    // 3. 使用并查集合并具有传递关系的人物
    const personGroups = groupSimilarPeople(similarPairs);

    console.log(`[Detect Duplicates] Grouped into ${personGroups.length} groups`);

    // 4. 构建返回数据
    const duplicateGroups: DuplicateGroup[] = personGroups.map((group, index) => {
      // 获取该组内的所有相似对
      const groupPairs = similarPairs
        .filter(pair => group.includes(pair.personAId) && group.includes(pair.personBId))
        .map(pair => ({
          ...pair,
          reason: pair.reason as 'exact_alias' | 'alias_match' | 'name_similar' | 'alias_intersection'
        }));

      // 获取该组内所有人物的详细信息
      const groupPeople = people.filter(p => group.includes(p.id));

      return {
        groupId: `group-${index + 1}`,
        personIds: group,
        pairs: groupPairs,
        details: groupPeople.map(p => ({
          id: p.id,
          name: p.name,
          aliases: p.aliases || [],
          importance_score: p.importance_score || 0
        }))
      };
    });

    const processingTime = Date.now() - startTime;

    console.log(`[Detect Duplicates] Completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      duplicateGroups,
      totalDuplicates: duplicateGroups.length,
      processingTime
    });

  } catch (error: any) {
    console.error('[Detect Duplicates] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
