import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/people/relationships?projectId=xxx
 * 获取人物关系
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }


    const { data: relationships, error } = await supabaseAdmin
      .from('people_relationships')
      .select(`
        *,
        person_a:people!people_relationships_person_a_id_fkey(id, name, avatar_url),
        person_b:people!people_relationships_person_b_id_fkey(id, name, avatar_url)
      `)
      .eq('project_id', projectId)

    if (error) {
      console.error('[API Get Relationships] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ relationships })
  } catch (error: any) {
    console.error('[API Get Relationships] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/people/relationships
 * 创建人物关系
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId, personAId, personBId, relationshipType, customLabel, bidirectional } =
      await request.json()

    if (!projectId || !personAId || !personBId || !relationshipType) {
      return NextResponse.json(
        { error: 'projectId, personAId, personBId, and relationshipType are required' },
        { status: 400 }
      )
    }


    const { data: relationship, error } = await supabaseAdmin
      .from('people_relationships')
      .insert({
        project_id: projectId,
        person_a_id: personAId,
        person_b_id: personBId,
        relationship_type: relationshipType,
        custom_label: customLabel,
        bidirectional: bidirectional !== undefined ? bidirectional : true,
      })
      .select()
      .single()

    if (error) {
      console.error('[API Create Relationship] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ relationship })
  } catch (error: any) {
    console.error('[API Create Relationship] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/people/relationships?relationshipId=xxx
 * 删除人物关系
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const relationshipId = searchParams.get('relationshipId')

    if (!relationshipId) {
      return NextResponse.json({ error: 'relationshipId is required' }, { status: 400 })
    }


    const { error } = await supabaseAdmin.from('people_relationships').delete().eq('id', relationshipId)

    if (error) {
      console.error('[API Delete Relationship] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API Delete Relationship] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
