'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listProjectOutlines, type BiographyOutline } from '../../lib/biographyOutlineApi'
import { supabase } from '../../lib/supabaseClient'

const LOCAL_PHOTOS_KEY = 'photoFlow.photos'
const LOCAL_OUTLINE_ATTACHMENTS_KEY = 'outlineAttachments'

type PhotoItem = {
  id: string
  fileName: string
  previewUrl: string
  remoteUrl?: string
  people: Array<{ id: string; name: string; relation?: string }>
  scene: {
    location?: string
    date?: string
    event?: string
    tags: string[]
    notes?: string
  }
}

type AttachmentNote = {
  outlineVersion: number
  sectionIndex: number
  photoId: string
  note: string
  addedAt: string
}

type StoryBlock = {
  id: string
  label: string
  title: string
  body: string
  detail: string
  image: string
  quote: string
  tag: string
}

type Story = {
  title: string
  tagline: string
  era: string
  location: string
  heroImage: string
  coverImage: string
  themes: string[]
  stats: {
    people: number
    scenes: number
    photos: number
  }
  blocks: StoryBlock[]
}

const fallbackImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80'

function nodeOffset(index: number, total: number) {
  if (total <= 1) return '5%'
  const step = 90 / (total - 1)
  return `${5 + step * index}%`
}

export default function StoriesPage() {
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [attachments, setAttachments] = useState<AttachmentNote[]>([])
  const [outlines, setOutlines] = useState<BiographyOutline[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState<Record<string, boolean>>({})
  const panelRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const photosRaw = window.localStorage.getItem(LOCAL_PHOTOS_KEY)
      if (photosRaw) {
        const parsed = JSON.parse(photosRaw) as PhotoItem[]
        if (Array.isArray(parsed)) {
          setPhotos(parsed.filter((p) => {
            const preview = p.previewUrl || p.remoteUrl
            return preview && !preview.startsWith('blob:')
          }))
        }
      }

      const attachRaw = window.localStorage.getItem(LOCAL_OUTLINE_ATTACHMENTS_KEY)
      if (attachRaw) {
        const parsed = JSON.parse(attachRaw) as AttachmentNote[]
        if (Array.isArray(parsed)) {
          setAttachments(parsed)
        }
      }
    } catch (e) {
      console.warn('Story data restore failed', e)
    }
  }, [])

  useEffect(() => {
    let canceled = false
    async function loadOutlines() {
      setLoading(true)
      setError(null)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || canceled) return

        const { data: list, error: selErr } = await supabase
          .from('projects')
          .select('id')
          .eq('owner_id', user.id)
          .eq('name', 'My Vault')
          .limit(1)

        if (selErr) throw selErr
        let projectId = list?.[0]?.id as string | undefined

        if (!projectId) {
          const { data: created, error: insErr } = await supabase
            .from('projects')
            .insert({ owner_id: user.id, name: 'My Vault' })
            .select('id')
            .maybeSingle()
          if (insErr) throw insErr
          projectId = created?.id
        }

        if (!projectId || canceled) return
        const data = await listProjectOutlines(projectId)
        if (!canceled) {
          setOutlines(data.filter((o) => o.status === 'done' && o.outline_json))
        }
      } catch (err: any) {
        if (!canceled) setError(err?.message || 'Failed to load outline')
      } finally {
        if (!canceled) setLoading(false)
      }
    }

    loadOutlines()
    return () => {
      canceled = true
    }
  }, [])

  const latestOutline = useMemo(
    () => outlines.find((o) => o.status === 'done' && o.outline_json) || null,
    [outlines]
  )

  const story = useMemo<Story>(() => {
    if (!latestOutline || !latestOutline.outline_json) {
      return {
        title: 'No stories generated yet',
        tagline: 'Go to outline annotation to attach photos and notes to chapters, stories will be auto-generated',
        era: 'Time TBD',
        location: 'Location TBD',
        heroImage: fallbackImage,
        coverImage: fallbackImage,
        themes: photos.flatMap((p) => p.scene.tags).slice(0, 4),
        stats: { people: new Set(photos.flatMap((p) => p.people.map((v) => v.name))).size, scenes: new Set(photos.map((p) => p.scene.location || p.scene.event)).size || 0, photos: photos.length },
        blocks: [],
      }
    }

    const outline = latestOutline.outline_json
    const photoById = (id?: string) => photos.find((p) => p.id === id)
    const sectionBlocks: StoryBlock[] = outline.sections.map((section, idx) => {
      const atts = attachments.filter((a) => a.outlineVersion === latestOutline.version && a.sectionIndex === idx)
      const primaryAtt = atts[0]
      const photo = primaryAtt ? photoById(primaryAtt.photoId) : photos[idx]
      const image = photo?.previewUrl || photo?.remoteUrl || fallbackImage
      const body = section.bullets[0] || 'This section awaits your input.'
      const detail = primaryAtt?.note || section.bullets[1] || 'Add notes to make the story more specific.'
      const quote = primaryAtt?.note ? `“${primaryAtt.note}”` : ''
      const tagParts = [photo?.scene.location, photo?.scene.event, (photo?.scene.tags || [])[0]].filter(Boolean)
      return {
        id: `section-${idx}`,
        label: `Chapter ${idx + 1}`,
        title: section.title,
        body,
        detail,
        image,
        quote,
        tag: tagParts.join(' · ') || 'Not annotated',
      }
    })

    const allDates = photos.map((p) => p.scene.date).filter(Boolean)
    const era = allDates.length > 0 ? `${allDates[0]} - ${allDates[allDates.length - 1]}` : 'Time TBD'
    const topLocation = photos
      .map((p) => p.scene.location)
      .filter(Boolean)
      .reduce((acc: Record<string, number>, loc) => {
        if (!loc) return acc
        acc[loc] = (acc[loc] || 0) + 1
        return acc
      }, {})
    const location = Object.entries(topLocation).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Location TBD'
    const themes = Array.from(new Set(photos.flatMap((p) => p.scene.tags))).slice(0, 6)
    const peopleCount = new Set(photos.flatMap((p) => p.people.map((v) => v.name))).size
    const sceneCount = new Set(photos.map((p) => p.scene.location || p.scene.event)).size || 0

    return {
      title: outline.title,
      tagline: 'Auto-generated based on your photos and chapter annotations',
      era,
      location,
      heroImage: sectionBlocks[0]?.image || fallbackImage,
      coverImage: sectionBlocks[1]?.image || sectionBlocks[0]?.image || fallbackImage,
      themes: themes.length > 0 ? themes : ['Add tags on photos page'],
      stats: {
        people: peopleCount,
        scenes: sceneCount,
        photos: photos.length,
      },
      blocks: sectionBlocks,
    }
  }, [attachments, latestOutline, photos])

  const blocksWithPosition = useMemo(() => {
    const total = story.blocks.length || 1
    return story.blocks.map((b, i) => ({ ...b, nodeTop: nodeOffset(i, total) }))
  }, [story.blocks])

  async function handleShare() {
    try {
      const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/stories` : '/stories'
      if (navigator.share) {
        await navigator.share({ title: story.title, text: story.tagline, url: shareUrl })
        setShareState('shared')
        setTimeout(() => setShareState('idle'), 1800)
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 1800)
    } catch (e) {
      setShareState('idle')
    }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.getAttribute('data-id')
          if (entry.isIntersecting && id) {
            setVisible((prev) => (prev[id] ? prev : { ...prev, [id]: true }))
          }
        })
      },
      {
        threshold: 0.35,
        rootMargin: '0px 0px -10% 0px',
      },
    )

    panelRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [blocksWithPosition])

  return (
    <div className="detroit-bg" style={{ minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }} className="story-shell">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="story-pill" style={{ marginBottom: 8 }}>VIRAL STORYTELLING</div>
            <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '1px' }}>{story.title}</h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>{story.tagline}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/"
                className="cyber-btn"
                style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}
              >
                Back to Home
              </Link>
            <button
              className="cyber-btn cyber-btn-primary"
              style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13 }}
              onClick={handleShare}
            >
              {shareState === 'copied' ? 'Link copied' : shareState === 'shared' ? 'Shared' : 'Share/Copy'}
            </button>
            <a
              className="cyber-btn"
              style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }}
              href="#create"
            >
              + Create New Story
            </a>
          </div>
        </div>

        <div className="story-hero" style={{ padding: 24, display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', zIndex: 1 }}>
            <div className="story-pill" style={{ width: 'fit-content' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-success)', boxShadow: '0 0 10px var(--accent-success)' }} />
              Live Story Mode
            </div>
            <h2 style={{ margin: 0, fontSize: 28 }}>{story.title}</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{story.tagline}</p>
            <div className="story-meta-grid">
              <div className="glass-card" style={{ padding: 14 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Time</div>
                <div style={{ fontWeight: 600 }}>{story.era}</div>
              </div>
              <div className="glass-card" style={{ padding: 14 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Location</div>
                <div style={{ fontWeight: 600 }}>{story.location}</div>
              </div>
              <div className="glass-card" style={{ padding: 14 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>People / Scenes / Photos</div>
                <div style={{ fontWeight: 600 }}>{story.stats.people} people / {story.stats.scenes} scenes / {story.stats.photos} photos</div>
              </div>
              <div className="glass-card" style={{ padding: 14 }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Themes</div>
                <div style={{ fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {story.themes.map((t) => (
                    <span key={t} className="story-pill" style={{ padding: '4px 10px', fontSize: 11 }}>{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="story-scroll-indicator" style={{ marginTop: 10 }}>Scroll down to browse</div>
          </div>
          <div className="story-hero-media" style={{ minHeight: 320 }}>
            <img src={story.heroImage} alt={story.title} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 20, marginTop: 18 }}>
          <div className="story-track">
            <div className="story-timeline" aria-hidden />
            {loading && (
              <div className="glass-card" style={{ padding: 14, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                Loading your outline and attachments...
              </div>
            )}
            {error && (
              <div className="glass-card" style={{ padding: 14, marginBottom: 12, fontSize: 12, color: '#ff9aa2' }}>
                {error}
              </div>
            )}
            {!loading && !error && story.blocks.length === 0 && (
              <div className="glass-card" style={{ padding: 16, marginBottom: 12, borderColor: 'var(--accent-cyan)' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>No story chapters yet</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Go to Photo Annotation and Outline Annotation to attach photos to chapters, then you can generate story scrolls here.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <a className="cyber-btn" style={{ borderRadius: 6, padding: '8px 12px', fontSize: 12, textDecoration: 'none' }} href="/photos/new">Annotate Photos</a>
                  <a className="cyber-btn" style={{ borderRadius: 6, padding: '8px 12px', fontSize: 12, textDecoration: 'none' }} href="/outline-annotate">Outline Annotation</a>
                </div>
              </div>
            )}
            {blocksWithPosition.map((block) => (
              <section
                key={block.id}
                ref={(el) => {
                  if (!el) return
                  panelRefs.current.set(block.id, el)
                }}
                data-id={block.id}
                className={`story-panel ${visible[block.id] ? 'is-visible' : 'is-hidden'}`}
                style={{ paddingLeft: 40 }}
              >
                <div className="story-node" style={{ top: block.nodeTop }} aria-hidden />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div className="story-pill">{block.label}</div>
                  <div className="story-pill" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#c084fc' }}>{block.tag}</div>
                </div>
                <div className="story-panel-grid">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 22 }}>{block.title}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{block.body}</p>
                    <div className="story-quote">{block.quote}</div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>{block.detail}</p>
                  </div>
                  <div>
                    <img src={block.image} alt={block.title} />
                  </div>
                </div>
              </section>
            ))}
          </div>

          <aside className="story-floating-actions">
            <div className="story-floating-card">
              <strong>Quick Share</strong>
              <small>Copy link or use system share</small>
              <button
                className="cyber-btn cyber-btn-primary"
                style={{ width: '100%', borderRadius: 6, padding: '10px 12px', fontSize: 13, marginTop: 10 }}
                onClick={handleShare}
              >
                {shareState === 'copied' ? 'Link copied' : shareState === 'shared' ? 'Shared' : 'Share / Copy'}
              </button>
            </div>

            <div className="story-floating-card">
              <strong>Material Binding</strong>
              <small>Will link with people/scene tags, click nodes to access photo albums.</small>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {story.themes.map((t) => (
                  <span key={t} className="story-pill" style={{ padding: '4px 10px', fontSize: 11 }}>{t}</span>
                ))}
              </div>
            </div>

            <div className="story-floating-card">
              <strong>Export Plans</strong>
              <small>Coming soon: poster cards, EPUB/PDF pre-layout.</small>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                <button className="cyber-btn" style={{ borderRadius: 6, padding: '9px 10px', fontSize: 12 }}>Share Card (Coming)</button>
                <button className="cyber-btn" style={{ borderRadius: 6, padding: '9px 10px', fontSize: 12 }}>EPUB / PDF (Coming)</button>
              </div>
            </div>
          </aside>
        </div>

        <div id="create" className="glass-card" style={{ marginTop: 32, padding: 20, borderRadius: 10, borderColor: 'var(--accent-cyan)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div className="story-pill" style={{ marginBottom: 6 }}>Next Steps</div>
              <h3 style={{ margin: 0 }}>Create Your Family Story</h3>
              <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>Upload photos, select people/scene tags, generate shareable story scrolls.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }} href="/photos/new">
                Tag Photos
              </a>
              <a className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }} href="/family">
                Manage Family Network
              </a>
              <a className="cyber-btn" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }} href="/outline-annotate">
                Outline Annotation
              </a>
              <a className="cyber-btn cyber-btn-primary" style={{ borderRadius: 6, padding: '10px 16px', fontSize: 13, textDecoration: 'none' }} href="/export">
                E-book Export
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}













