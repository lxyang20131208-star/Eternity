import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create client with user's token for proper RLS
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { photos, roster } = await req.json()

    if (!Array.isArray(photos) || !Array.isArray(roster)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 })
    }

    // Upsert people roster (only if there are people to save)
    if (roster.length > 0) {
      const rosterInserts = roster.map(person => ({
        id: person.id,
        user_id: user.id,
        name: person.name,
        relation: person.relation || null,
        avatar_url: person.avatarUrl || null
      }))

      const { error: rosterError } = await supabase
        .from('people_roster')
        .upsert(rosterInserts, { onConflict: 'id' })

      if (rosterError) {
        console.error('Roster upsert error:', rosterError)
        // Return detailed error for debugging
        return NextResponse.json({
          error: 'Failed to save people roster',
          details: rosterError.message,
          code: rosterError.code,
          hint: rosterError.hint
        }, { status: 500 })
      }
    }

    // Process each photo
    const savedPhotos = []
    for (const photo of photos) {
      // Insert/update photo with 5-field annotation
      const photoData = {
        id: photo.id,
        user_id: user.id,
        file_name: photo.fileName,
        photo_url: photo.remoteUrl || photo.previewUrl,
        // 5-field annotation system
        linked_question_id: photo.linkedQuestionId || null,
        time_taken: photo.timeTaken ? new Date(photo.timeTaken).toISOString() : null,
        time_precision: photo.timePrecision || 'fuzzy',
        place_id: photo.placeId || null,
        caption: photo.caption || null,
        // Legacy scene fields
        location: photo.scene?.location || null,
        event_date: photo.scene?.date || null,
        event_name: photo.scene?.event || null,
        tags: photo.scene?.tags || [],
        notes: photo.scene?.notes || null,
        // Auto-calculate annotation status
        annotation_status: (
          photo.linkedQuestionId &&
          photo.people?.length > 0 &&
          photo.timeTaken &&
          photo.placeId &&
          photo.caption?.trim()
        ) ? 'complete' : 'incomplete'
      }

      const { data: savedPhoto, error: photoError } = await supabase
        .from('photo_memories')
        .upsert(photoData, { onConflict: 'id' })
        .select()
        .single()

      if (photoError) {
        console.error('Photo upsert error:', photoError)
        // Continue but log detailed error
        console.error('Photo details:', { photoData, error: photoError.message, code: photoError.code })
        continue
      }

      // Delete existing photo-people associations
      await supabase
        .from('photo_people')
        .delete()
        .eq('photo_id', photo.id)

      // Insert new photo-people associations
      if (photo.people && photo.people.length > 0) {
        const peopleInserts = photo.people.map((person: { id: string; isUnknown?: boolean }) => ({
          photo_id: photo.id,
          person_id: person.id,
          is_unknown: person.isUnknown || false
        }))

        await supabase
          .from('photo_people')
          .insert(peopleInserts)
      }

      savedPhotos.push(savedPhoto)
    }

    return NextResponse.json({
      success: true,
      savedCount: savedPhotos.length,
      totalCount: photos.length
    })

  } catch (error: any) {
    console.error('Save photos error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save photos' },
      { status: 500 }
    )
  }
}

// GET: Fetch user's photos with people
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Fetch photos
    const { data: photos, error: photosError } = await supabase
      .from('photo_memories')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (photosError) {
      return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
    }

    // Fetch people roster
    const { data: roster, error: rosterError } = await supabase
      .from('people_roster')
      .select('*')
      .eq('user_id', user.id)
      .order('name')

    if (rosterError) {
      return NextResponse.json({ error: 'Failed to fetch roster' }, { status: 500 })
    }

    // Fetch photo-people associations
    const photoIds = photos?.map(p => p.id) || []
    const { data: photoPeople, error: photoPeopleError } = await supabase
      .from('photo_people')
      .select('*')
      .in('photo_id', photoIds)

    if (photoPeopleError) {
      return NextResponse.json({ error: 'Failed to fetch associations' }, { status: 500 })
    }

    // Map people to photos
    const photosWithPeople = photos?.map(photo => {
      const peopleIds = photoPeople
        ?.filter(pp => pp.photo_id === photo.id)
        .map(pp => pp.person_id) || []
      
      const people = roster
        ?.filter(p => peopleIds.includes(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          relation: p.relation,
          avatarUrl: p.avatar_url
        })) || []

      return {
        id: photo.id,
        fileName: photo.file_name,
        previewUrl: photo.photo_url,
        remoteUrl: photo.photo_url,
        // 5-field annotation
        linkedQuestionId: photo.linked_question_id,
        timeTaken: photo.time_taken ? photo.time_taken.split('T')[0] : null,
        timePrecision: photo.time_precision || 'fuzzy',
        placeId: photo.place_id,
        caption: photo.caption,
        people,
        scene: {
          location: photo.location,
          date: photo.event_date,
          event: photo.event_name,
          tags: photo.tags || [],
          notes: photo.notes
        }
      }
    }) || []

    const formattedRoster = roster?.map(p => ({
      id: p.id,
      name: p.name,
      relation: p.relation,
      avatarUrl: p.avatar_url
    })) || []

    return NextResponse.json({
      photos: photosWithPeople,
      roster: formattedRoster
    })

  } catch (error: any) {
    console.error('Fetch photos error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch photos' },
      { status: 500 }
    )
  }
}
