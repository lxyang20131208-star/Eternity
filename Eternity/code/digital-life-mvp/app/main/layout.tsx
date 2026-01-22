'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/signin');
          return;
        }

        const { data: tier, error } = await supabase.rpc('get_membership_tier', { p_user_id: user.id });
        if (error || !tier) {
          router.replace('/buy');
          return;
        }
      } finally {
        if (isMounted) setChecking(false);
      }
    }

    checkAccess();
    return () => {
      isMounted = false;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--muted)] text-sm">
        正在检查会员状态...
      </div>
    );
  }

  return <>{children}</>;
}
