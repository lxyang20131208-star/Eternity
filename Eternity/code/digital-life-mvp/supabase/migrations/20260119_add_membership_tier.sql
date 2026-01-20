-- Add membership tier (Plus/Pro) to premium_subscriptions
-- Plus = basic premium, Pro = advanced premium

-- Add tier column with default 'plus'
ALTER TABLE public.premium_subscriptions
ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'plus'
CHECK (tier IN ('plus', 'pro'));

-- Create helper function to get membership tier
-- Returns 'plus', 'pro', or null if no active subscription
CREATE OR REPLACE FUNCTION public.get_membership_tier(p_user_id uuid)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.tier
  FROM public.premium_subscriptions ps
  WHERE ps.user_id = p_user_id
    AND ps.status = 'active'
    AND (ps.expires_at IS NULL OR ps.expires_at > now())
  ORDER BY
    CASE ps.tier WHEN 'pro' THEN 1 WHEN 'plus' THEN 2 END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_membership_tier(uuid) TO authenticated;

-- Update existing is_premium to also expose tier info (optional enhancement)
COMMENT ON FUNCTION public.get_membership_tier(uuid) IS 'Returns the membership tier (plus/pro) for a user, or null if not premium';
