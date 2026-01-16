'use client'

import Link from 'next/link'
import { useState } from 'react'

const features = [
  {
    icon: '🎙️',
    title: 'Voice Recording',
    description: 'Answer thoughtful questions about your life using voice recordings. Our AI transcribes and organizes your stories automatically.',
  },
  {
    icon: '📸',
    title: 'Photo Integration',
    description: 'Upload photos that bring your stories to life. Tag family members and add context to create a rich visual narrative.',
  },
  {
    icon: '🌳',
    title: 'Family Tree',
    description: 'Build your family network and connect generations. Your stories gain context when readers understand relationships.',
  },
  {
    icon: '✨',
    title: 'AI-Powered Writing',
    description: 'Our AI transforms your recordings into beautifully written biography chapters while preserving your authentic voice.',
  },
  {
    icon: '📖',
    title: 'Professional Export',
    description: 'Export your complete biography as a stunning PDF or eBook. Perfect for printing or sharing digitally.',
  },
  {
    icon: '👨‍👩‍👧‍👦',
    title: 'Family Collaboration',
    description: 'Invite family members to contribute their own memories and perspectives to create a complete family history.',
  },
]

const testimonials = [
  {
    quote: "I finally captured my grandmother's stories before it was too late. This will be treasured by our family forever.",
    author: "Sarah M.",
    role: "Granddaughter",
  },
  {
    quote: "The AI writing is incredible - it took my rambling stories and turned them into beautiful prose while keeping my voice.",
    author: "Robert J.",
    role: "Retired Teacher",
  },
  {
    quote: "We gave mom's biography as a gift for her 80th birthday. There wasn't a dry eye in the room.",
    author: "Michael K.",
    role: "Son",
  },
]

const faqs = [
  {
    q: "How long does it take to create a biography?",
    a: "Most users record 2-3 stories per week and complete their biography in 2-3 months. You can go at your own pace.",
  },
  {
    q: "Do I need to be tech-savvy?",
    a: "Not at all! Our interface is designed to be simple. If you can use a smartphone, you can create your biography.",
  },
  {
    q: "Can family members contribute?",
    a: "Yes! With our collaboration feature, family members can add their own stories and perspectives.",
  },
  {
    q: "What happens to my recordings?",
    a: "Your data is encrypted and securely stored. You maintain full ownership and can export or delete at any time.",
  },
]

export default function LandingPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <div style={{ background: '#051019', minHeight: '100vh', color: '#ffffff' }}>
      {/* Navigation */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: '16px 24px',
        background: 'rgba(5, 16, 25, 0.9)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#00d4ff' }}>
            Digital Life
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <a href="#features" style={{ color: '#c8d4e0', textDecoration: 'none', fontSize: 14 }}>Features</a>
            <a href="#pricing" style={{ color: '#c8d4e0', textDecoration: 'none', fontSize: 14 }}>Pricing</a>
            <a href="#faq" style={{ color: '#c8d4e0', textDecoration: 'none', fontSize: 14 }}>FAQ</a>
            <Link
              href="/"
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
                color: '#051019',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 24px 80px',
        background: 'radial-gradient(ellipse at center top, rgba(0, 212, 255, 0.15) 0%, transparent 50%)',
      }}>
        <div style={{ maxWidth: 800, textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            padding: '6px 16px',
            background: 'rgba(0, 212, 255, 0.1)',
            border: '1px solid rgba(0, 212, 255, 0.3)',
            borderRadius: 20,
            fontSize: 13,
            color: '#00d4ff',
            marginBottom: 24,
          }}>
            Preserve Your Legacy
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 700,
            lineHeight: 1.1,
            marginBottom: 24,
            background: 'linear-gradient(135deg, #ffffff 0%, #c8d4e0 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Turn Your Life Stories Into a Beautiful Biography
          </h1>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)',
            color: '#8899aa',
            lineHeight: 1.7,
            marginBottom: 40,
            maxWidth: 600,
            margin: '0 auto 40px',
          }}>
            Record your memories through guided questions, add photos, and let AI transform your stories into a professionally written biography for future generations.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/"
              style={{
                padding: '16px 32px',
                background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
                color: '#051019',
                borderRadius: 12,
                textDecoration: 'none',
                fontSize: 16,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Start Free Trial
            </Link>
            <a
              href="#features"
              style={{
                padding: '16px 32px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                borderRadius: 12,
                textDecoration: 'none',
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              Learn More
            </a>
          </div>

          {/* Social Proof */}
          <div style={{ marginTop: 60, display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#00d4ff' }}>10,000+</div>
              <div style={{ fontSize: 13, color: '#667788' }}>Stories Captured</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#00d4ff' }}>500+</div>
              <div style={{ fontSize: 13, color: '#667788' }}>Biographies Created</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#00d4ff' }}>4.9</div>
              <div style={{ fontSize: 13, color: '#667788' }}>User Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{ padding: '100px 24px', background: 'rgba(0, 0, 0, 0.3)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
              Everything You Need to Preserve Your Story
            </h2>
            <p style={{ fontSize: 18, color: '#8899aa', maxWidth: 600, margin: '0 auto' }}>
              From recording to publishing, we provide all the tools to create a meaningful biography.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}>
            {features.map((feature, idx) => (
              <div
                key={idx}
                style={{
                  padding: 28,
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05), rgba(124, 58, 237, 0.05))',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                  transition: 'all 0.3s ease',
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>{feature.icon}</div>
                <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>{feature.title}</h3>
                <p style={{ fontSize: 15, color: '#8899aa', lineHeight: 1.6 }}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
              Loved by Families Everywhere
            </h2>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 24,
          }}>
            {testimonials.map((t, idx) => (
              <div
                key={idx}
                style={{
                  padding: 28,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 16,
                }}
              >
                <p style={{ fontSize: 16, color: '#c8d4e0', lineHeight: 1.7, marginBottom: 20, fontStyle: 'italic' }}>
                  "{t.quote}"
                </p>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.author}</div>
                  <div style={{ fontSize: 13, color: '#667788' }}>{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" style={{ padding: '100px 24px', background: 'rgba(0, 0, 0, 0.3)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
              Simple, Transparent Pricing
            </h2>
            <p style={{ fontSize: 18, color: '#8899aa' }}>
              Start free, upgrade when you're ready to export.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {/* Free Tier */}
            <div style={{
              padding: 32,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 16,
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Free</h3>
              <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 20 }}>$0</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', lineHeight: 2 }}>
                <li style={{ color: '#8899aa' }}>Unlimited recordings</li>
                <li style={{ color: '#8899aa' }}>AI transcription</li>
                <li style={{ color: '#8899aa' }}>3 photo uploads</li>
                <li style={{ color: '#8899aa' }}>Basic outline generation</li>
              </ul>
              <Link
                href="/"
                style={{
                  display: 'block',
                  padding: '14px 24px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  borderRadius: 10,
                  textDecoration: 'none',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                Get Started
              </Link>
            </div>

            {/* Premium Tier */}
            <div style={{
              padding: 32,
              background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 165, 0, 0.08))',
              border: '2px solid rgba(255, 215, 0, 0.3)',
              borderRadius: 16,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                color: '#0b1220',
                padding: '4px 16px',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700,
              }}>
                MOST POPULAR
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#ffd700' }}>Premium</h3>
              <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 4, color: '#ffd700' }}>$79.99</div>
              <div style={{ fontSize: 14, color: '#8899aa', marginBottom: 20 }}>per year (~$6.67/mo)</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', lineHeight: 2 }}>
                <li style={{ color: '#c8d4e0' }}>Everything in Free, plus:</li>
                <li style={{ color: '#c8d4e0' }}>Unlimited photos</li>
                <li style={{ color: '#c8d4e0' }}>Advanced AI writing</li>
                <li style={{ color: '#c8d4e0' }}>PDF & eBook export</li>
                <li style={{ color: '#c8d4e0' }}>Family collaboration</li>
                <li style={{ color: '#c8d4e0' }}>Priority support</li>
              </ul>
              <Link
                href="/"
                style={{
                  display: 'block',
                  padding: '14px 24px',
                  background: 'linear-gradient(135deg, #ffd700, #ffed4e)',
                  color: '#0b1220',
                  borderRadius: 10,
                  textDecoration: 'none',
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
              Frequently Asked Questions
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 16,
                    fontWeight: 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {faq.q}
                  <span style={{ fontSize: 20, color: '#667788' }}>
                    {expandedFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {expandedFaq === idx && (
                  <div style={{ padding: '0 24px 20px', color: '#8899aa', lineHeight: 1.7 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: '100px 24px',
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1))',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
            Start Preserving Your Story Today
          </h2>
          <p style={{ fontSize: 18, color: '#8899aa', marginBottom: 32 }}>
            Every day that passes is a memory that could be lost. Begin your biography journey now.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '18px 40px',
              background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
              color: '#051019',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            Create Your Biography Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        textAlign: 'center',
      }}>
        <div style={{ color: '#667788', fontSize: 14 }}>
          2024 Digital Life. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
