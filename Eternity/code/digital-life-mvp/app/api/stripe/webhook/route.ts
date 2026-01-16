import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const plan = session.metadata?.plan as 'monthly' | 'yearly'

        if (!userId) {
          console.error('No userId in session metadata')
          break
        }

        // Calculate expiry date
        const now = new Date()
        const expiresAt = new Date(now)
        if (plan === 'monthly') {
          expiresAt.setMonth(expiresAt.getMonth() + 1)
        } else if (plan === 'yearly') {
          expiresAt.setFullYear(expiresAt.getFullYear() + 1)
        }

        // Upsert subscription record
        const { error } = await supabase
          .from('premium_subscriptions')
          .upsert({
            user_id: userId,
            plan,
            status: 'active',
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
          }, {
            onConflict: 'user_id',
          })

        if (error) {
          console.error('Failed to update subscription:', error)
        } else {
          console.log(`Premium activated for user ${userId}, plan: ${plan}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID and update status
        const { data: existingSub } = await supabase
          .from('premium_subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (existingSub) {
          await supabase
            .from('premium_subscriptions')
            .update({
              status: subscription.status === 'active' ? 'active' : 'cancelled',
              expires_at: new Date((subscription as any).current_period_end * 1000).toISOString(),
            })
            .eq('user_id', existingSub.user_id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Mark subscription as cancelled
        await supabase
          .from('premium_subscriptions')
          .update({ status: 'cancelled' })
          .eq('stripe_customer_id', customerId)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}
