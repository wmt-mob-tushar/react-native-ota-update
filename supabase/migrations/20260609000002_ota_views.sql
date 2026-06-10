-- ============================================================
-- OTA Platform — Analytics Views
-- Migration: 20260609000002_ota_views
-- All views are CREATE OR REPLACE — idempotent.
-- ============================================================

-- ── Bundle adoption ──────────────────────────────────────────
-- % of devices on each bundle vs. all active devices for that app.
CREATE OR REPLACE VIEW public.ota_bundle_adoption AS
SELECT
  b.application_id,
  b.id                               AS bundle_id,
  b.version,
  b.semver,
  b.platform,
  ch.name                            AS channel,
  COUNT(d.id)                        AS device_count,
  total.total_devices,
  ROUND(
    COUNT(d.id)::numeric /
    NULLIF(total.total_devices, 0) * 100, 2
  )                                  AS adoption_pct
FROM public.ota_bundles b
JOIN public.ota_channels ch ON ch.id = b.channel_id
LEFT JOIN public.ota_devices d
  ON  d.current_bundle_id = b.id
  AND d.application_id    = b.application_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_devices
  FROM public.ota_devices
  WHERE application_id = b.application_id
    AND platform       = b.platform
    AND last_seen > NOW() - INTERVAL '30 days'
) total ON TRUE
GROUP BY
  b.application_id, b.id, b.version, b.semver, b.platform,
  ch.name, total.total_devices;

-- ── Update success rate ───────────────────────────────────────
-- Per bundle: installs attempted vs. successful.
CREATE OR REPLACE VIEW public.ota_update_success_stats AS
SELECT
  application_id,
  bundle_id,
  platform,
  COUNT(*) FILTER (WHERE status = 'downloaded')  AS downloads,
  COUNT(*) FILTER (WHERE status = 'installed')   AS installs,
  COUNT(*) FILTER (WHERE status = 'failed')      AS failures,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'installed')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status IN ('installed','failed')), 0) * 100, 2
  )                                               AS success_rate_pct
FROM public.ota_installations
GROUP BY application_id, bundle_id, platform;

-- ── Crash rate ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.ota_crash_stats AS
SELECT
  c.application_id,
  c.bundle_id,
  c.platform,
  COUNT(*)                                  AS total_crashes,
  COUNT(*) FILTER (WHERE c.fatal = TRUE)    AS fatal_crashes,
  COUNT(DISTINCT c.device_id)               AS affected_devices,
  -- crashes per 1000 installs
  ROUND(
    COUNT(*)::numeric /
    NULLIF(inst.install_count, 0) * 1000, 2
  )                                         AS crash_rate_per_1k
FROM public.ota_crashes c
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS install_count
  FROM   public.ota_installations i
  WHERE  i.bundle_id = c.bundle_id
    AND  i.status    = 'installed'
) inst ON TRUE
GROUP BY c.application_id, c.bundle_id, c.platform, inst.install_count;

-- ── Rollback count ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.ota_rollback_stats AS
SELECT
  application_id,
  channel_id,
  platform,
  COUNT(*)                        AS total_rollbacks,
  MAX(created_at)                 AS last_rollback_at,
  MODE() WITHIN GROUP (ORDER BY from_bundle_id) AS most_rolled_back_bundle_id
FROM public.ota_rollbacks
GROUP BY application_id, channel_id, platform;

-- ── Active device counts ──────────────────────────────────────
-- "Active" = last seen within the past 30 days.
CREATE OR REPLACE VIEW public.ota_active_devices AS
SELECT
  application_id,
  platform,
  COUNT(*)             AS active_devices_30d,
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '7 days')  AS active_devices_7d,
  COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '1 day')   AS active_devices_1d
FROM public.ota_devices
WHERE last_seen > NOW() - INTERVAL '30 days'
GROUP BY application_id, platform;

-- ── Daily event counts (for charts) ──────────────────────────
CREATE OR REPLACE VIEW public.ota_daily_events AS
SELECT
  application_id,
  bundle_id,
  platform,
  event_type,
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*)                       AS event_count
FROM public.ota_analytics
GROUP BY application_id, bundle_id, platform, event_type, DATE_TRUNC('day', created_at);

-- ── App-level summary (dashboard home card) ───────────────────
CREATE OR REPLACE VIEW public.ota_app_summary AS
SELECT
  a.id                AS application_id,
  a.name,
  a.slug,
  -- active devices 30d
  COALESCE(dev.active_devices_30d, 0) AS active_devices,
  -- total bundles
  COUNT(DISTINCT b.id)                AS total_bundles,
  -- total crashes 30d
  COALESCE(cr.crashes_30d, 0)         AS crashes_30d,
  -- last release
  MAX(b.created_at)                   AS last_release_at
FROM public.applications a
LEFT JOIN public.ota_bundles b ON b.application_id = a.id
LEFT JOIN LATERAL (
  SELECT SUM(active_devices_30d) AS active_devices_30d
  FROM   public.ota_active_devices
  WHERE  application_id = a.id
) dev ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS crashes_30d
  FROM   public.ota_crashes
  WHERE  application_id = a.id
    AND  created_at > NOW() - INTERVAL '30 days'
) cr ON TRUE
GROUP BY a.id, a.name, a.slug, dev.active_devices_30d, cr.crashes_30d;
