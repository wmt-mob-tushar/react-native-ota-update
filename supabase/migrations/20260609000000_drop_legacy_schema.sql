-- ============================================================
-- OTA Platform — Drop legacy schema
-- Migration: 20260609000000_drop_legacy_schema
--
-- The project briefly ran an earlier OTA schema (2026-06-08 migrations,
-- e.g. ota_apps, ota_channels without application_id). Those tables are
-- empty and incompatible with the current schema created by
-- 20260609000001_ota_core.sql, so drop them before recreating.
-- All drops are IF EXISTS — a fresh database is unaffected.
-- ============================================================

DROP TABLE IF EXISTS public.ota_installations CASCADE;
DROP TABLE IF EXISTS public.ota_analytics     CASCADE;  -- partitioned (ota_analytics_default)
DROP TABLE IF EXISTS public.ota_crashes       CASCADE;
DROP TABLE IF EXISTS public.ota_rollouts      CASCADE;
DROP TABLE IF EXISTS public.ota_bundles       CASCADE;
DROP TABLE IF EXISTS public.ota_runtimes      CASCADE;
DROP TABLE IF EXISTS public.ota_channels      CASCADE;
DROP TABLE IF EXISTS public.ota_apps          CASCADE;
