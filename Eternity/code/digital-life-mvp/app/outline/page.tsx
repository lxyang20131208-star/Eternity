'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'
import {
  listProjectOutlines,
  outlineToMarkdown,
  type BiographyOutline,
} from '../../lib/biographyOutlineApi'

export default function OutlinePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [outlines, setOutlines] = useState<BiographyOutline[]>([])
  const [selected, setSelected] = useState<BiographyOutline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  async function initAuthAndProject() {
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUserId(null)
        setUserEmail(null)
        setProjectId(null)
        return
      }
      setUserId(user.id)
      setUserEmail(user.email ?? null)

      const { data: list, error: selErr } = await supabase
        .from('projects')
        .select('id')
        .eq('owner_id', user.id)
        .eq('name', 'My Vault')
        .limit(1)

      if (selErr) throw selErr
      const existingId = list?.[0]?.id
      if (existingId) {
        setProjectId(existingId)
        return
      }

      const { data: created, error: insErr } = await supabase
        .from('projects')
        .insert({ owner_id: user.id, name: 'My Vault' })
        .select('id')
        .maybeSingle()
      if (insErr) throw insErr
      setProjectId(created?.id || null)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }

  async function loadOutlines(pid: string) {
    setLoading(true)
    try {
      const data = await listProjectOutlines(pid)
      setOutlines(data)
      if (data.length > 0) setSelected(data[0])
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    initAuthAndProject()
  }, [])

  useEffect(() => {
    if (projectId) {
      loadOutlines(projectId)
    }
  }, [projectId])

  async function copySelectedMarkdown() {
    if (!selected?.outline_json) return
    const md = outlineToMarkdown(selected.outline_json)
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      setCopied(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%)',
      padding: '24px 16px',
      fontFamily: '"Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>📖 Biography Outlines</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
              {userEmail || 'Not signed in'}
            </p>
          </div>
          <Link href="/" style={{
            padding: '8px 12px',
            fontSize: 12,
            fontWeight: 600,
            background: 'white',
            color: '#667eea',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}>← Back</Link>
        </div>

        {!userId ? (
          <div style={{ padding: 24, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            Sign in to view outlines.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Versions</div>
              {loading ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>Loading...</div>
              ) : outlines.length === 0 ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>No outlines yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {outlines.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setSelected(o)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        background: selected?.id === o.id ? '#eef2ff' : 'white',
                        color: '#1e293b',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Version {o.version}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(o.created_at).toLocaleString()}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4,
                        color: o.status === 'done' ? '#166534' : o.status === 'failed' ? '#991b1b' : '#1e40af' }}>
                        {o.status.toUpperCase()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              {!selected ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>Select a version to view.</div>
              ) : selected.status !== 'done' || !selected.outline_json ? (
                <div style={{ fontSize: 12, color: '#64748b' }}>Outline not ready.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                      {selected.outline_json.title}
                    </h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href="/outline-edit" style={{
                        padding: '8px 12px', fontSize: 12, fontWeight: 600,
                        background: '#667eea', color: 'white', border: '1px solid #667eea', borderRadius: 8,
                        textDecoration: 'none',
                      }}>
                        ✏️ 编辑
                      </Link>
                      <button onClick={copySelectedMarkdown} style={{
                        padding: '8px 12px', fontSize: 12, fontWeight: 600,
                        background: '#f1f5f9', color: '#667eea', border: '1px solid #e2e8f0', borderRadius: 8,
                      }}>
                        {copied ? '✅ Copied' : '📋 Copy Markdown'}
                      </button>
                    </div>
                  </div>

                  <div style={{
                    padding: 12,
                    background: '#f8fafc',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#64748b',
                  }}>
                    <div>Generated: {new Date(selected.outline_json.generatedAt).toLocaleString()}</div>
                    <div>Total Sessions: {selected.outline_json.totalSessions}</div>
                    <div>Version: {selected.version}</div>
                  </div>

                  {selected.outline_json.sections.map((section, idx) => (
                    <div key={idx} style={{
                      padding: 16,
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                    }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
                        {section.title}
                      </h4>
                      <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                        {section.bullets.map((bullet, bidx) => (
                          <li key={bidx} style={{ marginBottom: 6 }}>{bullet}</li>
                        ))}
                      </ul>
                      {section.quotes && section.quotes.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
                            Notable Quotes
                          </div>
                          {section.quotes.map((quote, qidx) => (
                            <div key={qidx} style={{
                              padding: 10,
                              background: '#f8fafc',
                              borderLeft: '3px solid #667eea',
                              borderRadius: 4,
                              fontSize: 12,
                              fontStyle: 'italic',
                              color: '#475569',
                              marginBottom: 8,
                            }}>
                              "{quote.text}"
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24,
            padding: '12px 20px', background: '#fee2e2', color: '#991b1b',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: 14,
          }}>
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
