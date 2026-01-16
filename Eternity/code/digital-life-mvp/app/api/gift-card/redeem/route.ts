import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { code, userId } = await req.json()

    if (!code || !userId) {
      return NextResponse.json({ error: 'Missing code or user ID' }, { status: 400 })
    }

    // Call the redeem function
    const { data, error } = await supabase
      .rpc('redeem_gift_card', {
        p_code: code.toUpperCase().trim(),
        p_user_id: userId,
      })

    if (error) throw error

    if (!data.success) {
      return NextResponse.json({ error: data.error }, { status: 400 })
    }

    // Apply the subscription to the user's project
    // Get user's project
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)

    if (projects && projects.length > 0) {
      // Calculate subscription end date
      const endDate = new Date()
      if (data.plan === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1)
      } else {
        endDate.setMonth(endDate.getMonth() + 1)
      }

      // Update project with premium status
      await supabase
        .from('projects')
        .update({
          is_premium: true,
          subscription_plan: data.plan,
          subscription_end: endDate.toISOString(),
        })
        .eq('id', projects[0].id)
    }

    return NextResponse.json({
      success: true,
      plan: data.plan,
      message: 'Gift card redeemed! Your Premium subscription is now active.',
    })
  } catch (error: any) {
    console.error('Gift card redeem error:', error)
    return NextResponse.json({ error: error.message || 'Failed to redeem gift card' }, { status: 500 })
  }
}
