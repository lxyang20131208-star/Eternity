import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

/**
 * POST /api/people/extract
 * 触发人物抽取（同步执行，直接返回结果）
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json()

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    console.log('[API Extract People] Calling Edge Function for project:', projectId)

    // 调用 Edge Function（同步执行）
    const { data, error } = await supabase.functions.invoke('extract_people', {
      body: { projectId },
    })

    if (error) {
      console.error('[API Extract People] Edge function error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[API Extract People] Success:', data)
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[API Extract People] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
