-- ============================================================
-- OTA Platform — RLS + rate-limit fixes
-- Migration: 20260609000006_ota_rls_fixes
--   1. rollouts UPDATE policy was missing WITH CHECK, allowing a
--      developer to re-point a rollout at a deployment of an app
--      they are not a developer of.
--   2. Atomic rate-limit check: the Edge Function previously did
--      count-then-insert (racy under concurrency) and never
--      deleted expired rows.
-- ============================================================

-- ── 1. rollouts UPDATE policy: add WITH CHECK mirroring USING ──
DROP POLICY IF EXISTS "rollouts: developers can update" ON public.ota_rollouts;
CREATE POLICY "rollouts: developers can update"
  ON public.ota_rollouts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ota_deployments d
      WHERE d.id = deployment_id
        AND public.ota_is_app_member(d.application_id, 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ota_deployments d
      WHERE d.id = deployment_id
        AND public.ota_is_app_member(d.application_id, 'developer')
    )
  );

-- ── 2. Atomic rate-limit check ──
-- Serializes per key with an advisory lock, records the request,
-- counts the window, and prunes expired rows for the key in one call.
-- Rejected requests also count toward the window (prevents retry storms).
CREATE OR REPLACE FUNCTION public.ota_check_rate_limit(
  p_key       TEXT,
  p_limit     INTEGER,
  p_window_ms BIGINT
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start  TIMESTAMPTZ := NOW() - make_interval(secs => p_window_ms / 1000.0);
  current_count INTEGER;
BEGIN
  -- Serialize concurrent checks for the same key
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  -- Opportunistic cleanup of expired rows for this key
  DELETE FROM public.ota_rate_limits
   WHERE key = p_key AND created_at < window_start;

  INSERT INTO public.ota_rate_limits (key) VALUES (p_key);

  SELECT COUNT(*) INTO current_count
    FROM public.ota_rate_limits
   WHERE key = p_key AND created_at >= window_start;

  RETURN QUERY SELECT
    current_count <= p_limit,
    GREATEST(0, p_limit - current_count);
END;
$$;

-- Only service role (Edge Functions) may call this.
REVOKE ALL ON FUNCTION public.ota_check_rate_limit(TEXT, INTEGER, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ota_check_rate_limit(TEXT, INTEGER, BIGINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ota_check_rate_limit(TEXT, INTEGER, BIGINT) TO service_role;
