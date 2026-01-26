import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export async function POST(req: NextRequest) {
  try {
    const { userId, token } = await req.json()

    if (!userId || !token) {
      return NextResponse.json({ error: 'Missing userId or token' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify token
    const { data: tokenData, error } = await supabase
      .from('elder_entry_tokens')
      .select('secret_token')
      .eq('user_id', userId)
      .eq('secret_token', token)
      .single()

    if (error || !tokenData) {
      console.error('[API verify-token] Invalid token for user:', userId)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Generate JWT session token
    const secret = new TextEncoder().encode(JWT_SECRET)
    const sessionToken = await new SignJWT({ userId, type: 'elder' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d') // 30 days
      .setIssuedAt()
      .sign(secret)

    console.log('[API verify-token] Token verified successfully for user:', userId)

    // Set httpOnly cookie
    const response = NextResponse.json({ success: true })
    response.cookies.set('elder_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[API verify-token] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
