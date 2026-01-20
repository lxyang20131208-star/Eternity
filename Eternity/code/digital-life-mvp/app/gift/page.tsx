"use client"

import React, { useState } from 'react'
import Link from 'next/link'

export default function GiftPage() {
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [method, setMethod] = useState<'email' | 'pdf' | 'print'>('email')
  const [wrap, setWrap] = useState(false)
  const [coupon, setCoupon] = useState('')

  const basePrice = 198
  const wrapPrice = wrap ? 10 : 0
  const total = basePrice + wrapPrice

  return (
    <main style={{ minHeight: '100vh', padding: 28, background: '#F8F6F2', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
      <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>

        {/* Left column: form and steps */}
        <section style={{ background: '#fff', border: '1px solid #ECE6DB', borderRadius: 12, padding: 22 }}>
          <nav style={{ marginBottom: 12, color: '#8C8377' }}>
            <Link href="/">首页</Link> / <Link href="/buy">购买</Link> / 送给家人
          </nav>

          <header style={{ marginBottom: 14 }}>
            <h1 style={{ margin: 0, fontSize: 22, color: '#2C2C2C' }}>把这份传记送给家人</h1>
            <p style={{ marginTop: 8, color: '#6B6B6B' }}>填写收件信息、选择交付方式并完成支付。</p>
          </header>

          {/* Step indicator (visual) */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <div style={{ flex: 1, padding: 10, borderRadius: 8, background: '#F4EFE8', textAlign: 'center' }}>1. 收件信息</div>
            <div style={{ flex: 1, padding: 10, borderRadius: 8, background: '#FFF', textAlign: 'center', border: '1px solid #E6E6E6' }}>2. 确认 & 支付</div>
            <div style={{ flex: 1, padding: 10, borderRadius: 8, background: '#FFF', textAlign: 'center', border: '1px solid #E6E6E6' }}>3. 完成</div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ display: 'block', color: '#444', marginBottom: 6 }}>收件人姓名</label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="例如：王小明" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E6E6E6' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: '#444', marginBottom: 6 }}>收件人邮箱（用于发送电子版）</label>
              <input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="example@domain.com" style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E6E6E6' }} />
            </div>

            <div>
              <label style={{ display: 'block', color: '#444', marginBottom: 6 }}>给家人的话（可选）</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E6E6E6' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label style={{ color: '#444' }}>交付方式：</label>
              <select value={method} onChange={(e) => setMethod(e.target.value as any)} style={{ padding: 8, borderRadius: 8, border: '1px solid #E6E6E6' }}>
                <option value="email">电子邮件（PDF）</option>
                <option value="pdf">一次性下载</option>
                <option value="print">纸质邮寄（另计运费）</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input id="wrap" type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />
              <label htmlFor="wrap" style={{ color: '#444' }}>礼物包装 +¥10</label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="优惠码（若有）" style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #E6E6E6' }} />
              <button style={{ padding: '10px 14px', borderRadius: 8, background: '#F1E9DE', border: '1px solid #E3D6C6' }}>应用</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <Link href="/buy" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '10px 16px', borderRadius: 8, background: '#fff', border: '1px solid #E6E6E6' }}>返回</button>
              </Link>
              <Link href="/buy/confirm" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '10px 16px', borderRadius: 8, background: '#2F2F2F', color: '#fff', border: 'none' }}>下一步：确认 & 支付</button>
              </Link>
            </div>
          </div>
        </section>

        {/* Right column: summary */}
        <aside style={{ background: '#fff', border: '1px solid #ECE6DB', borderRadius: 12, padding: 18, height: 'fit-content' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#2C2C2C' }}>订单概要</h3>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: '#6B6B6B' }}>
            <div>数字遗书（完整版）</div>
            <div>¥{basePrice}</div>
          </div>

          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', color: '#6B6B6B' }}>
            <div>礼物包装</div>
            <div>{wrap ? `¥${wrapPrice}` : '—'}</div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px dashed #ECE6DB', margin: '14px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
            <div>合计</div>
            <div>¥{total}</div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#8C8377' }}>付款后我们会按你的选择将传记发送给收件人。</div>

          <div style={{ marginTop: 16 }}>
            <button style={{ width: '100%', padding: '12px 16px', borderRadius: 8, background: '#B89B72', color: '#fff', border: 'none' }}>立即支付</button>
          </div>
        </aside>
      </div>
    </main>
  )
}
