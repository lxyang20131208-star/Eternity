import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if token already exists
    const { data: existing } = await supabase
      .from('elder_entry_tokens')
      .select('secret_token')
      .eq('user_id', userId)
      .single()

    if (existing) {
      return NextResponse.json({ token: existing.secret_token })
    }

    // Generate new token using crypto
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const newToken = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    console.log('[API generate-token] Generated new token for user:', userId)

    // Insert new token
    const { error: insertError } = await supabase
      .from('elder_entry_tokens')
      .insert({
        user_id: userId,
        secret_token: newToken,
      })

    if (insertError) {
      console.error('[API generate-token] Insert error:', insertError)
      throw insertError
    }

    return NextResponse.json({ token: newToken })
  } catch (error: any) {
    console.error('[API generate-token] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
