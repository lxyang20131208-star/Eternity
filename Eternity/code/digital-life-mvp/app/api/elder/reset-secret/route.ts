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

    // Generate new token using crypto
    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const newToken = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    console.log('[API reset-secret] Generated new token for user:', userId)

    // Update existing token or insert new one
    const { error: upsertError } = await supabase
      .from('elder_entry_tokens')
      .upsert({
        user_id: userId,
        secret_token: newToken,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      })

    if (upsertError) {
      console.error('[API reset-secret] Upsert error:', upsertError)
      throw upsertError
    }

    console.log('[API reset-secret] Secret reset successfully for user:', userId)

    return NextResponse.json({ token: newToken })
  } catch (error: any) {
    console.error('[API reset-secret] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
