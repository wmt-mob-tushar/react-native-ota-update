-- ============================================================
-- OTA Platform — Rate Limit Store
-- Migration: 20260609000005_ota_rate_limits
-- Simple window-based rate-limit counter table.
-- Old rows are pruned by a Postgres cron job or by the
-- Edge Function (it only counts rows within the window).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ota_rate_limits (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key        TEXT        NOT NULL,   -- e.g. "check-update:{app_key}:{device_id}"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ota_rate_limits_key_time
  ON public.ota_rate_limits (key, created_at DESC);

-- Auto-prune rows older than 1 hour to keep the table small.
-- This function is called manually or via pg_cron if available.
CREATE OR REPLACE FUNCTION public.ota_prune_rate_limits()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM public.ota_rate_limits
  WHERE created_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

-- RLS: Edge Functions use service role (bypasses RLS).
-- Dashboard users have no access to this table.
ALTER TABLE public.ota_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — only accessible via service role.
