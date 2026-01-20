import { NextResponse } from 'next/server'

type Body = {
  plan?: 'plus' | 'pro'
  quantity?: number
  successUrl?: string
  cancelUrl?: string
}

export async function POST(req: Request) {
  try {
    const body: Body = await req.json().catch(() => ({} as Body))

    const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY
    if (!STRIPE_SECRET) {
      return NextResponse.json({ error: 'Missing STRIPE_SECRET_KEY in environment' }, { status: 500 })
    }

    // 支持通过环境变量配置不同 plan 对应的 price id
    const priceForPlan: Record<string, string | undefined> = {
      plus: process.env.STRIPE_PRICE_PLUS_ID,
      pro: process.env.STRIPE_PRICE_PRO_ID,
    }

    const plan = body.plan || 'pro'
    const priceId = priceForPlan[plan] || process.env.STRIPE_PRICE_PRO_ID
    if (!priceId) {
      return NextResponse.json({ error: 'Missing price id for selected plan' }, { status: 500 })
    }

    const origin = process.env.NEXT_PUBLIC_BASE_URL || `http://localhost:3000`
    const successUrl = body.successUrl || `${origin}/buy/success`
    const cancelUrl = body.cancelUrl || `${origin}/buy?canceled=true`

    const params = new URLSearchParams()
    params.append('mode', 'payment')
    params.append('success_url', successUrl)
    params.append('cancel_url', cancelUrl)
    params.append('line_items[0][price]', priceId)
    params.append('line_items[0][quantity]', String(body.quantity || 1))

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data }, { status: res.status })
    }

    return NextResponse.json({ url: data.url, session: data })
  } catch (err) {
    console.error('Stripe session error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
