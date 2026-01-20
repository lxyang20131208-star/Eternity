import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')

    // Use anon key with user token for auth verification
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Use service role key for storage operations (admin access)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { filename, contentType } = await req.json()

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const ext = filename.split('.').pop()
    const uniqueFilename = `${user.id}/${timestamp}-${randomStr}.${ext}`

    // Generate presigned upload URL (expires in 5 minutes)
    const { data, error } = await supabase.storage
      .from('photo-memories')
      .createSignedUploadUrl(uniqueFilename, {
        upsert: false
      })

    if (error) {
      console.error('Presigned URL error:', error)
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
    }

    // Get public URL for the file
    const { data: publicUrlData } = supabase.storage
      .from('photo-memories')
      .getPublicUrl(uniqueFilename)

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      fileUrl: publicUrlData.publicUrl,
      path: uniqueFilename
    })

  } catch (error: any) {
    console.error('Upload URL error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
