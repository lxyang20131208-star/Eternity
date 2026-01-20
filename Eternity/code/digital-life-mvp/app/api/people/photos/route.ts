import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 使用service role key绕过RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * GET /api/people/photos?personId=xxx&projectId=xxx
 * 获取某人物的所有关联照片（自动归集）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const personId = searchParams.get('personId')
    const projectId = searchParams.get('projectId')

    if (!personId || !projectId) {
      return NextResponse.json({ error: 'personId and projectId are required' }, { status: 400 })
    }


    // 1. 获取该人物信息
    const { data: person, error: personError } = await supabaseAdmin
      .from('people')
      .select('name, aliases')
      .eq('id', personId)
      .single()

    if (personError || !person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    // 2. 获取直接关联的照片（people_photos 表）
    const { data: directPhotos, error: directError } = await supabaseAdmin
      .from('people_photos')
      .select('*')
      .eq('person_id', personId)

    if (directError) {
      console.error('[API Get Person Photos] Direct photos error:', directError)
    }

    // 3. 从 photo_memories 表中查找提到该人物的照片（通过 caption/tags）
    // 注意：这里需要模糊匹配人物名字或别名
    const searchNames = [person.name, ...(person.aliases || [])]
    const { data: autoPhotos, error: autoError } = await supabaseAdmin
      .from('photo_memories')
      .select('*')
      .eq('project_id', projectId)

    if (autoError) {
      console.error('[API Get Person Photos] Auto photos error:', autoError)
    }

    // 客户端过滤：检查 caption、tags、people 字段是否包含人名
    const filteredAutoPhotos = (autoPhotos || []).filter((photo) => {
      const caption = photo.caption?.toLowerCase() || ''
      const tags = (photo.tags || []).map((t: string) => t.toLowerCase())
      const people = (photo.people || []).map((p: any) => p.name?.toLowerCase() || '')

      return searchNames.some((name) => {
        const lowerName = name.toLowerCase()
        return caption.includes(lowerName) || tags.includes(lowerName) || people.includes(lowerName)
      })
    })

    // 4. 合并去重
    const directPhotoUrls = new Set((directPhotos || []).map((p) => p.photo_url))
    const allPhotos = [
      ...(directPhotos || []).map((p) => ({
        url: p.photo_url,
        caption: p.photo_caption,
        source: p.photo_source,
        isPrimary: p.is_primary,
        createdAt: p.created_at,
      })),
      ...filteredAutoPhotos
        .filter((p) => !directPhotoUrls.has(p.url))
        .map((p) => ({
          url: p.url,
          caption: p.caption,
          source: 'auto_detected',
          isPrimary: false,
          createdAt: p.created_at,
        })),
    ]

    return NextResponse.json({ photos: allPhotos, person })
  } catch (error: any) {
    console.error('[API Get Person Photos] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/people/photos
 * 为人物添加照片（手动上传或关联）
 */
export async function POST(request: NextRequest) {
  try {
    const { personId, photoUrl, photoCaption, photoSource, isPrimary } = await request.json()

    if (!personId || !photoUrl) {
      return NextResponse.json({ error: 'personId and photoUrl are required' }, { status: 400 })
    }


    // 如果设为主照片，先将该人物的其他照片取消主照片状态
    if (isPrimary) {
      await supabaseAdmin
        .from('people_photos')
        .update({ is_primary: false })
        .eq('person_id', personId)
    }

    const { data: photo, error } = await supabaseAdmin
      .from('people_photos')
      .insert({
        person_id: personId,
        photo_url: photoUrl,
        photo_caption: photoCaption,
        photo_source: photoSource || 'manual_attach',
        is_primary: isPrimary || false,
      })
      .select()
      .single()

    if (error) {
      console.error('[API Add Person Photo] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 如果是主照片，同时更新 people 表的 avatar_url
    if (isPrimary) {
      await supabaseAdmin.from('people').update({ avatar_url: photoUrl }).eq('id', personId)
    }

    return NextResponse.json({ photo })
  } catch (error: any) {
    console.error('[API Add Person Photo] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/people/photos?photoId=xxx
 * 删除人物照片关联
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')

    if (!photoId) {
      return NextResponse.json({ error: 'photoId is required' }, { status: 400 })
    }


    const { error } = await supabaseAdmin.from('people_photos').delete().eq('id', photoId)

    if (error) {
      console.error('[API Delete Person Photo] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API Delete Person Photo] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
