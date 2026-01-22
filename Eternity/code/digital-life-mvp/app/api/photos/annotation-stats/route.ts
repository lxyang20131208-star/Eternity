import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { data: stats, error } = await supabaseAdmin
      .from('photo_annotation_stats')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (error) throw error

    return NextResponse.json({ stats: stats || {
      total_photos: 0,
      with_question: 0,
      with_people: 0,
      with_time: 0,
      with_place: 0,
      with_caption: 0,
      complete_photos: 0,
      incomplete_photos: 0,
      completion_rate: 0
    }})
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
