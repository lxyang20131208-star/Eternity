-- Premium subscription system
-- Tracks paid membership with status + expiry

create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('trial','monthly','yearly','lifetime','manual')),
  status text not null check (status in ('active','expired','cancelled')),
  started_at timestamptz default now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  provider text default 'manual',
  provider_ref text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_premium_subscriptions_user on public.premium_subscriptions(user_id);
create unique index if not exists uq_premium_active_user on public.premium_subscriptions(user_id) where status = 'active';

alter table public.premium_subscriptions enable row level security;

-- Service role full access
DO $$
BEGIN
  CREATE POLICY "service role access premium" ON public.premium_subscriptions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- End users may read their own subscription status (no write)
DO $$
BEGIN
  CREATE POLICY "user read own premium" ON public.premium_subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Helper function to check premium status (bypasses RLS via security definer)
create or replace function public.is_premium(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.premium_subscriptions ps
    where ps.user_id = p_user_id
      and ps.status = 'active'
      and (ps.expires_at is null or ps.expires_at > now())
    limit 1
  );
$$;

grant execute on function public.is_premium(uuid) to authenticated;
