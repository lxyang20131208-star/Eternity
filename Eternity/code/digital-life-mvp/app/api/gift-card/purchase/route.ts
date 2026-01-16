import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Price IDs for gift cards (same as regular subscriptions)
const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly',
  yearly: process.env.STRIPE_PRICE_YEARLY || 'price_yearly',
}

export async function POST(req: NextRequest) {
  try {
    const { plan, purchaserId, purchaserEmail, recipientEmail, recipientName, personalMessage } = await req.json()

    if (!plan || !purchaserId || !purchaserEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (plan !== 'monthly' && plan !== 'yearly') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Generate a unique gift code
    const { data: codeData, error: codeError } = await supabase
      .rpc('generate_gift_code')

    if (codeError) throw codeError

    const giftCode = codeData

    // Create Stripe checkout session for the gift card
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // One-time payment for gift card
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Digital Life Gift Card - ${plan === 'yearly' ? 'Annual' : 'Monthly'} Plan`,
              description: recipientName
                ? `Gift for ${recipientName}`
                : 'Digital Life Premium Subscription Gift Card',
            },
            unit_amount: plan === 'yearly' ? 9900 : 999, // $99/year or $9.99/month
          },
          quantity: 1,
        },
      ],
      customer_email: purchaserEmail,
      metadata: {
        type: 'gift_card',
        plan,
        purchaserId,
        giftCode,
        recipientEmail: recipientEmail || '',
        recipientName: recipientName || '',
        personalMessage: personalMessage || '',
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/gift-success?code=${giftCode}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/?gift=cancelled`,
    })

    return NextResponse.json({ url: session.url, giftCode })
  } catch (error: any) {
    console.error('Gift card purchase error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create gift card' }, { status: 500 })
  }
}
