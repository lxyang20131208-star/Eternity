'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

// Feature unlock thresholds
const UNLOCK_THRESHOLDS = {
  photos: 10,
  tree: 20,
  outline: 30,
  places: 40,
  timeline: 50,
  export: 60,
  secondRound: 70,
  collab: 0, // Temporarily set to 0 for testing (original: 80)
  editBio: 90,
  delivery: 100,
} as const;

// Helper to check if a feature is unlocked
const isFeatureUnlocked = (feature: keyof typeof UNLOCK_THRESHOLDS, count: number) => {
  return count >= UNLOCK_THRESHOLDS[feature];
};

type UnifiedNavProps = {
  onProClick?: () => void;
  onCollabClick?: () => void;
};

export default function UnifiedNav({ onProClick, onCollabClick }: UnifiedNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [membershipTier, setMembershipTier] = useState<'plus' | 'pro' | null>(null);
  const [showLockModal, setShowLockModal] = useState<{ feature: string; requiredCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Premium Modal State
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setIsLoggedIn(true);
          setUserId(user.id);
          setUserEmail(user.email ?? null);

          // Fetch project and answered count
          const { data: projects } = await supabase
            .from('projects')
            .select('id')
            .eq('owner_id', user.id)
            .limit(1);
          
          if (projects && projects.length > 0) {
            const projectId = projects[0].id;
            const { count } = await supabase
              .from('answer_sessions')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', projectId);
            setAnsweredCount(count || 0);
          }

          // Fetch membership
          try {
            const { data: tier } = await supabase.rpc('get_membership_tier', { p_user_id: user.id });
            setMembershipTier(tier as 'plus' | 'pro' | null);
          } catch (e) {
            console.error('Failed to get tier', e);
          }
        }
      } catch (error) {
        console.error('UnifiedNav init error:', error);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/signin');
  };

  const showLockedFeature = (feature: string, requiredCount: number) => {
    setShowLockModal({ feature, requiredCount });
  };

  const handlePurchase = async (plan: 'plus' | 'pro') => {
    if (!userId) {
      router.push('/signin?source=buy');
      return;
    }

    setIsProcessing(true);
    try {
      const resp = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error?.message || data?.error || '创建支付会话失败');
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('未能获取结账链接');
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      alert(err?.message || '支付失败');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div style={{
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: 'white',
        borderBottom: '1px solid #EEEAE4',
        boxShadow: 'none',
        borderRadius: 0,
        gap: 12,
        minHeight: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <img 
            src="/logo.png" 
            alt="EverArchive Logo" 
            style={{ 
              width: 42, 
              height: 42,
              objectFit: 'contain',
              background: 'transparent'
            }} 
          />
          <div className="logo-text-container" style={{ minWidth: 0, flexShrink: 0 }}>
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#222', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#222' }}>EverArchive</span>
            </h1>
            <p style={{ margin: '0px 0 0', fontSize: 8, color: '#5A4F43', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#5A4F43' }}>Where Memories Outlast Time</span>
            </p>
          </div>
        </div>
        {loading ? (
          // Skeleton Loader
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ width: 100, height: 28, background: 'rgba(184,155,114,0.1)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
             <div style={{ width: 600, height: 36, background: 'rgba(184,155,114,0.05)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
          </div>
        ) : isLoggedIn && (
          <div className="nav-scroll-container" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', minWidth: 0, overflowX: 'auto', paddingRight: 4 }}>
            <div className="user-email-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '8px 12px',
              height: 34,
              boxSizing: 'border-box',
              background: 'white',
              border: '1px solid #E3D6C6',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              color: '#8B7355',
              minWidth: 0,
            }}>
              <span className="status-dot active" style={{ width: 4, height: 4, background: '#4CAF50', borderRadius: '50%' }} />
              <span style={{ color: '#8B7355', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', fontSize: 11 }}>{userEmail}</span>
            </div>

            {/* Membership Tier Badge (show PRO/PLUS when available, otherwise show FREE for signed-in users) */}
            {isLoggedIn && (membershipTier ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '8px 12px',
                height: 34,
                boxSizing: 'border-box',
                background: membershipTier === 'pro'
                  ? 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)'
                  : 'linear-gradient(135deg, #8B7355 0%, #A89070 100%)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                color: membershipTier === 'pro' ? '#1a1a2e' : '#fff',
                letterSpacing: '0.5px',
                boxShadow: membershipTier === 'pro'
                  ? '0 2px 8px rgba(255, 215, 0, 0.3)'
                  : '0 2px 6px rgba(139, 115, 85, 0.2)',
                flexShrink: 0,
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, lineHeight: 1, transform: 'translateY(-2px)' }}>{membershipTier === 'pro' ? '★' : '◆'}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, height: '100%' , justifyContent: 'center' }}>{membershipTier === 'pro' ? 'PRO' : 'PLUS'}</span>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                height: 34,
                boxSizing: 'border-box',
                background: '#F4F1EE',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 700,
                color: '#8B7355',
                letterSpacing: '0.3px',
                border: '1px solid #E6E0D6',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11 }}>FREE</span>
              </div>
            ))}

            {/* Navigation Group */}
            <div style={{
              display: 'flex',
              gap: 4,
              padding: '4px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 3,
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}>
              {/* MAIN */}
              <Link
                href="/main"
                style={{
                  padding: '8px 12px',
                  height: 34,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  textDecoration: 'none',
                  border: pathname.includes('/main') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                  whiteSpace: 'nowrap',
                  background: pathname.includes('/main') ? '#FAF8F5' : 'white',
                  color: pathname.includes('/main') ? '#8B7355' : '#5A4F43',
                }}
              >
                ◇ MAIN
              </Link>

              {/* PHOTOS */}
              {isFeatureUnlocked('photos', answeredCount) ? (
                <Link
                  href="/photos"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/photos') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/photos') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/photos') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ PHOTOS
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Photos', UNLOCK_THRESHOLDS.photos)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ PHOTOS 🔒
                </button>
              )}

              {/* TREE */}
              {isFeatureUnlocked('tree', answeredCount) ? (
                <Link
                  href="/family"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/family') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/family') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/family') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ TREE
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Tree', UNLOCK_THRESHOLDS.tree)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ TREE 🔒
                </button>
              )}

              {/* OUTLINE */}
              {isFeatureUnlocked('outline', answeredCount) ? (
                <Link
                  href="/outline-annotate"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/outline') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/outline') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/outline') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ OUTLINE
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Outline', UNLOCK_THRESHOLDS.outline)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ OUTLINE 🔒
                </button>
              )}

              {/* PROGRESS */}
              <Link
                href="/progress"
                style={{
                  padding: '8px 12px',
                  height: 34,
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  textDecoration: 'none',
                  border: pathname.includes('/progress') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                  whiteSpace: 'nowrap',
                  background: pathname.includes('/progress') ? '#FAF8F5' : 'white',
                  color: pathname.includes('/progress') ? '#8B7355' : '#5A4F43',
                }}
              >
                ◇ PROGRESS
              </Link>

              {/* PLACES */}
              {isFeatureUnlocked('places', answeredCount) ? (
                <Link
                  href="/places"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/places') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/places') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/places') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ PLACES
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Places', UNLOCK_THRESHOLDS.places)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ PLACES 🔒
                </button>
              )}

              {/* TIMELINE */}
              {isFeatureUnlocked('timeline', answeredCount) ? (
                <Link
                  href="/timeline"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/timeline') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/timeline') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/timeline') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ TIMELINE
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Timeline', UNLOCK_THRESHOLDS.timeline)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ TIMELINE 🔒
                </button>
              )}

              {/* EXPORT */}
              {isFeatureUnlocked('export', answeredCount) ? (
                <Link
                  href="/export"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/export') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/export') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/export') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ EXPORT
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Export', UNLOCK_THRESHOLDS.export)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ EXPORT 🔒
                </button>
              )}

              {/* COLLAB */}
              {isFeatureUnlocked('collab', answeredCount) ? (
                <Link
                  href="/collab"
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    textDecoration: 'none',
                    border: pathname.includes('/collab') ? '1px solid #8B7355' : '1px solid #E3D6C6',
                    whiteSpace: 'nowrap',
                    background: pathname.includes('/collab') ? '#FAF8F5' : 'white',
                    color: pathname.includes('/collab') ? '#8B7355' : '#5A4F43',
                  }}
                >
                  ◇ COLLAB
                </Link>
              ) : (
                <button
                  onClick={() => showLockedFeature('Collaboration', UNLOCK_THRESHOLDS.collab)}
                  style={{
                    padding: '8px 12px',
                    height: 34,
                    boxSizing: 'border-box',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    background: 'white',
                    color: '#999',
                    border: '1px solid #E3D6C6',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: 0.6,
                  }}
                >
                  ◇ COLLAB 🔒
                </button>
              )}

              {/* PRO */}
              <button
                onClick={() => {
                  if (onProClick) {
                    onProClick();
                  } else {
                    setShowPremiumModal(true);
                  }
                }}
                style={{
                  padding: '8px 12px',
                  height: 34,
                  boxSizing: 'border-box',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  background: 'white',
                  color: '#5A4F43',
                  border: '1px solid #E3D6C6',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                <span>✨</span> PRO
              </button>
            </div>

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              style={{
                padding: '8px 12px',
                height: 34,
                boxSizing: 'border-box',
                background: 'white',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease'
              }}
            >
              SIGN OUT
            </button>
          </div>
        )}
      </div>

      {/* Premium Modal */}
      {showPremiumModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(247,245,242,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
        }} onClick={() => setShowPremiumModal(false)}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: 28,
            maxWidth: 520,
            width: '90%',
            boxShadow: 'var(--shadow)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Everarchive Pro
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginTop: 6 }}>
                Everarchive Pro 会员
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                解锁完整功能与高阶工具
              </div>
            </div>

            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              background: 'linear-gradient(180deg, #ffffff, #f6f2ec)',
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)' }}>{`$${99.9}`}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>每月</div>
                <button
                  onClick={() => handlePurchase('pro')}
                  disabled={isProcessing}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: 8,
                    cursor: isProcessing ? 'wait' : 'pointer',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                {isProcessing ? '处理中...' : (membershipTier === 'pro' ? '管理订阅' : '立即开通 Everarchive Pro')}
                </button>
            </div>

            <div style={{
              padding: 16,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--card)',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
                PRO 包含
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                <li>高级排版与导出（PDF/打印）</li>
                <li>无限照片与素材空间</li>
                <li>AI 补全与优先处理</li>
                <li>更多主题与排版模版</li>
              </ul>
            </div>

            <button
              onClick={() => setShowPremiumModal(false)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              继续使用免费版
            </button>
          </div>
        </div>
      )}

      {/* Locked Feature Modal */}
      {showLockModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(248,246,242,0.55)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setShowLockModal(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 24,
              minWidth: 320,
              maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#2C2C2C' }}>
              🔒 Feature Locked
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#5A4F43', lineHeight: 1.5 }}>
              The <strong>{showLockModal.feature}</strong> feature will unlock when you have answered <strong>{showLockModal.requiredCount}</strong> questions.
              <br /><br />
              Current progress: <strong>{answeredCount} / {showLockModal.requiredCount}</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowLockModal(null)}
                style={{
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 500,
                  background: '#B89B72',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                Keep Writing
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
        .nav-scroll-container {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
        .nav-scroll-container::-webkit-scrollbar {
          display: none;
        }
        @media (max-width: 768px) {
          .user-email-pill {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
