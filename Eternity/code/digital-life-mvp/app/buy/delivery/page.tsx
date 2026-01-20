"use client"

import React, { useState } from 'react'
import Link from 'next/link'

export default function DeliveryPage() {
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState('')
  const [deliveryType, setDeliveryType] = useState<'email'|'physical'>('email')
  const [giftWrap, setGiftWrap] = useState(false)

  return (
    <main style={{ minHeight: '100vh', padding: 24, background: '#F8F6F2', fontFamily: '"Source Han Serif SC", "Songti SC", "SimSun", serif' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>

        {/* Left: Delivery form */}
        <section style={{ background: '#fff', border: '1px solid #ECE6DB', borderRadius: 12, padding: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: '#2C2C2C' }}>送给家人</h1>
          <p style={{ marginTop: 8, marginBottom: 18, color: '#6B6B6B' }}>填写接收信息与留言，完成送礼流程。</p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <button
              onClick={() => setDeliveryType('email')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: deliveryType === 'email' ? '1px solid #B89B72' : '1px solid #E6E6E6',
                background: deliveryType === 'email' ? '#F8F2EA' : '#FFFFFF',
              }}
            >电子邮件</button>
            <button
              onClick={() => setDeliveryType('physical')}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: deliveryType === 'physical' ? '1px solid #B89B72' : '1px solid #E6E6E6',
                background: deliveryType === 'physical' ? '#F8F2EA' : '#FFFFFF',
              }}
            >纸质礼物</button>
          </div>

          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 6 }}>收件人姓名</label>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="例如：李华" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E6E6E6', marginBottom: 12 }} />

          <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 6 }}>给家人的留言（可选）</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder="写下一句鼓励或怀念的话" style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #E6E6E6', marginBottom: 12 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <input id="giftWrap" type="checkbox" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} />
            <label htmlFor="giftWrap" style={{ fontSize: 13, color: '#444' }}>礼物包装 +¥10</label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
            <Link href="/buy" style={{ textDecoration: 'none' }}>
              <button style={{ padding: '10px 16px', borderRadius: 8, background: '#fff', border: '1px solid #E6E6E6' }}>返回</button>
            </Link>
            <Link href="/buy/confirm" style={{ textDecoration: 'none' }}>
              <button style={{ padding: '10px 16px', borderRadius: 8, background: '#2F2F2F', color: '#fff', border: 'none' }}>下一步：确认 & 支付</button>
            </Link>
          </div>
        </section>

        {/* Right: Order summary */}
        <aside style={{ background: '#fff', border: '1px solid #ECE6DB', borderRadius: 12, padding: 18, height: 'fit-content' }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#2C2C2C' }}>订单概要</h3>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', color: '#6B6B6B' }}>
            <div>数字遗书（完整版）</div>
            <div>¥198</div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', color: '#6B6B6B' }}>
            <div>礼物包装</div>
            <div>{giftWrap ? '¥10' : '—'}</div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px dashed #ECE6DB', margin: '14px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16 }}>
            <div>合计</div>
            <div>¥{198 + (giftWrap ? 10 : 0)}</div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#8C8377' }}>购买后可选择生成并赠送传记 PDF。</div>
        </aside>

      </div>
    </main>
  )
}
