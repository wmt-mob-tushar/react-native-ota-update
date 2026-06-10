-- ============================================================
-- OTA Platform — Core Schema
-- Migration: 20260609000001_ota_core
-- Fully idempotent (CREATE … IF NOT EXISTS).
-- Safe against existing production data — adds new ota_* and
-- applications tables only; no DROP, ALTER, or TRUNCATE.
-- ============================================================

-- ── Prerequisites ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Updated-at trigger (reusable) ────────────────────────────
CREATE OR REPLACE FUNCTION public.ota_handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Convenience macro to attach the trigger to a table
CREATE OR REPLACE FUNCTION public.ota_attach_updated_at(tbl regclass)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_ota_updated_at ON %s;
     CREATE TRIGGER trg_ota_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION public.ota_handle_updated_at();',
    tbl, tbl
  );
END;
$$;

-- ================================================================
-- TABLE: applications
-- One row per mobile application registered on the platform.
-- api_key is used by devices to identify themselves to Edge Functions.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.applications (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  slug          TEXT        NOT NULL,          -- url-safe unique identifier
  description   TEXT,
  api_key       UUID        NOT NULL DEFAULT gen_random_uuid(),  -- device auth
  owner_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_applications_slug    UNIQUE (slug),
  CONSTRAINT uq_applications_api_key UNIQUE (api_key)
);
SELECT public.ota_attach_updated_at('public.applications');

CREATE INDEX IF NOT EXISTS idx_applications_owner    ON public.applications (owner_id);
CREATE INDEX IF NOT EXISTS idx_applications_slug     ON public.applications (slug);
CREATE INDEX IF NOT EXISTS idx_applications_api_key  ON public.applications (api_key);

-- ================================================================
-- TABLE: application_members
-- Multi-tenant membership. A user can belong to many apps.
-- Role hierarchy: owner > admin > developer > viewer
-- ================================================================
CREATE TABLE IF NOT EXISTS public.application_members (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id        UUID  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           TEXT  NOT NULL DEFAULT 'developer'
                       CHECK (role IN ('owner','admin','developer','viewer')),
  invited_by     UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_application_members UNIQUE (application_id, user_id)
);
SELECT public.ota_attach_updated_at('public.application_members');

CREATE INDEX IF NOT EXISTS idx_app_members_app  ON public.application_members (application_id);
CREATE INDEX IF NOT EXISTS idx_app_members_user ON public.application_members (user_id);

-- Auto-enroll the creator as owner
CREATE OR REPLACE FUNCTION public.ota_on_application_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.application_members (application_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (application_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_owner ON public.applications;
CREATE TRIGGER trg_application_owner
  AFTER INSERT ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.ota_on_application_created();

-- ================================================================
-- TABLE: ota_channels
-- Logical deployment lanes: production, beta, internal, development.
-- You can add custom channel names; the 4 standard ones are conventions.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_channels (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  name           TEXT  NOT NULL,   -- e.g. production | beta | internal | development
  is_default     BOOL  NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ota_channels UNIQUE (application_id, name)
);
SELECT public.ota_attach_updated_at('public.ota_channels');

CREATE INDEX IF NOT EXISTS idx_ota_channels_app ON public.ota_channels (application_id);

-- Only one default channel per application
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_channels_default_uniq
  ON public.ota_channels (application_id)
  WHERE is_default = TRUE;

-- ================================================================
-- TABLE: ota_runtimes
-- Maps a (platform, runtime_version) pair for an app.
-- runtime_version is the native binary version / ABI fingerprint.
-- A JS bundle is only served to devices whose runtime_version matches.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_runtimes (
  id              UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id  UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  platform        TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  runtime_version TEXT  NOT NULL,  -- e.g. "1.0.0" or a git sha/fingerprint
  label           TEXT,            -- optional human-readable label
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ota_runtimes UNIQUE (application_id, platform, runtime_version)
);
SELECT public.ota_attach_updated_at('public.ota_runtimes');

CREATE INDEX IF NOT EXISTS idx_ota_runtimes_app      ON public.ota_runtimes (application_id);
CREATE INDEX IF NOT EXISTS idx_ota_runtimes_platform ON public.ota_runtimes (application_id, platform);

-- ================================================================
-- TABLE: ota_bundles
-- A compiled JS bundle artefact. Immutable once created.
-- version is monotonically increasing per (app, channel, platform).
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_bundles (
  id                  UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id      UUID    NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  channel_id          UUID    NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  runtime_id          UUID    NOT NULL REFERENCES public.ota_runtimes(id) ON DELETE CASCADE,
  platform            TEXT    NOT NULL CHECK (platform IN ('ios','android')),
  version             INTEGER NOT NULL,     -- monotonically increasing sequence
  semver              TEXT,                 -- optional human version e.g. "1.2.3"
  storage_path        TEXT    NOT NULL,     -- path inside the ota storage bucket
  file_hash           TEXT    NOT NULL,     -- SHA-256 hex of bundle.zip
  file_size           BIGINT  NOT NULL,     -- bytes
  should_force_update BOOL    NOT NULL DEFAULT FALSE,
  message             TEXT,                 -- release notes
  status              TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','disabled','rolled_back')),
  enabled             BOOL    NOT NULL DEFAULT TRUE,
  created_by          UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT public.ota_attach_updated_at('public.ota_bundles');

-- Hot path for check-update: latest enabled bundle per (app, channel, platform, runtime)
CREATE INDEX IF NOT EXISTS idx_ota_bundles_lookup
  ON public.ota_bundles (application_id, channel_id, platform, runtime_id, enabled, version DESC);

CREATE INDEX IF NOT EXISTS idx_ota_bundles_channel ON public.ota_bundles (channel_id);
CREATE INDEX IF NOT EXISTS idx_ota_bundles_runtime ON public.ota_bundles (runtime_id);
CREATE INDEX IF NOT EXISTS idx_ota_bundles_status  ON public.ota_bundles (application_id, status);

-- Version sequence enforced per (app, channel, platform)
CREATE OR REPLACE FUNCTION public.ota_next_bundle_version(
  p_application_id UUID, p_channel_id UUID, p_platform TEXT
) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX(version), 0) + 1
  FROM public.ota_bundles
  WHERE application_id = p_application_id
    AND channel_id     = p_channel_id
    AND platform       = p_platform;
$$;

-- ================================================================
-- TABLE: ota_deployments
-- Active-release pointer. Exactly one active deployment per
-- (channel, platform, runtime) at any time (enforced by partial index).
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_deployments (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  channel_id     UUID  NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  runtime_id     UUID  NOT NULL REFERENCES public.ota_runtimes(id) ON DELETE CASCADE,
  platform       TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  bundle_id      UUID  NOT NULL REFERENCES public.ota_bundles(id) ON DELETE CASCADE,
  status         TEXT  NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','superseded')),
  created_by     UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT public.ota_attach_updated_at('public.ota_deployments');

-- Only ONE active deployment per (channel, platform, runtime):
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_deployments_active_uniq
  ON public.ota_deployments (channel_id, platform, runtime_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ota_deployments_app    ON public.ota_deployments (application_id);
CREATE INDEX IF NOT EXISTS idx_ota_deployments_bundle ON public.ota_deployments (bundle_id);
CREATE INDEX IF NOT EXISTS idx_ota_deployments_lookup
  ON public.ota_deployments (channel_id, platform, runtime_id, status);

-- ================================================================
-- TABLE: ota_rollouts
-- Staged-rollout config for a deployment.
-- Devices are bucketed 0-99 via hash(device_id) % 100.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_rollouts (
  id            UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id UUID    NOT NULL REFERENCES public.ota_deployments(id) ON DELETE CASCADE,
  bundle_id     UUID    NOT NULL REFERENCES public.ota_bundles(id) ON DELETE CASCADE,
  percentage    INTEGER NOT NULL DEFAULT 100 CHECK (percentage BETWEEN 0 AND 100),
  strategy      TEXT    NOT NULL DEFAULT 'percentage'
                        CHECK (strategy IN ('percentage','all')),
  status        TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','completed')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ota_rollouts_deployment UNIQUE (deployment_id)
);
SELECT public.ota_attach_updated_at('public.ota_rollouts');

CREATE INDEX IF NOT EXISTS idx_ota_rollouts_deployment ON public.ota_rollouts (deployment_id);
CREATE INDEX IF NOT EXISTS idx_ota_rollouts_bundle     ON public.ota_rollouts (bundle_id);

-- ================================================================
-- TABLE: ota_installations
-- Telemetry: per-device download/install events.
-- Written by Edge Function (service role) — no direct client writes.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_installations (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  bundle_id      UUID  NOT NULL REFERENCES public.ota_bundles(id) ON DELETE CASCADE,
  device_id      TEXT  NOT NULL,
  platform       TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  status         TEXT  NOT NULL CHECK (status IN ('downloaded','installed','failed')),
  app_version    TEXT,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- no updated_at: append-only telemetry
);

CREATE INDEX IF NOT EXISTS idx_ota_installations_app    ON public.ota_installations (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_installations_bundle ON public.ota_installations (bundle_id);
CREATE INDEX IF NOT EXISTS idx_ota_installations_device ON public.ota_installations (device_id, application_id);

-- ================================================================
-- TABLE: ota_crashes
-- Crash reports submitted by the RN SDK.
-- Written by Edge Function (service role).
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_crashes (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  bundle_id      UUID  REFERENCES public.ota_bundles(id) ON DELETE SET NULL,
  device_id      TEXT  NOT NULL,
  platform       TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  fatal          BOOL  NOT NULL DEFAULT FALSE,
  error_message  TEXT  NOT NULL,
  stack          TEXT,
  app_version    TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ota_crashes_app    ON public.ota_crashes (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_crashes_bundle ON public.ota_crashes (bundle_id);
CREATE INDEX IF NOT EXISTS idx_ota_crashes_device ON public.ota_crashes (device_id, application_id);

-- ================================================================
-- TABLE: ota_rollbacks
-- Audit log of every rollback operation.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_rollbacks (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  channel_id     UUID  NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  platform       TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  from_bundle_id UUID  REFERENCES public.ota_bundles(id) ON DELETE SET NULL,
  to_bundle_id   UUID  REFERENCES public.ota_bundles(id) ON DELETE SET NULL,
  reason         TEXT,
  created_by     UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ota_rollbacks_app     ON public.ota_rollbacks (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_rollbacks_channel ON public.ota_rollbacks (channel_id);

-- ================================================================
-- TABLE: ota_analytics
-- Append-only event stream. Aggregated in views/Phase 8.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_analytics (
  id             UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  channel_id     UUID  REFERENCES public.ota_channels(id) ON DELETE SET NULL,
  bundle_id      UUID  REFERENCES public.ota_bundles(id) ON DELETE SET NULL,
  device_id      TEXT  NOT NULL,
  platform       TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  event_type     TEXT  NOT NULL CHECK (event_type IN (
                   'download','install','active','crash',
                   'rollback','update_success','update_fail'
                 )),
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition-friendly compound index for time-series queries
CREATE INDEX IF NOT EXISTS idx_ota_analytics_time   ON public.ota_analytics (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ota_analytics_bundle ON public.ota_analytics (application_id, bundle_id, event_type);
CREATE INDEX IF NOT EXISTS idx_ota_analytics_device ON public.ota_analytics (device_id, application_id);

-- ================================================================
-- TABLE: ota_devices
-- Last-known state per (device_id, application_id). Upserted by
-- check-update and report-install Edge Functions.
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ota_devices (
  id                UUID  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id         TEXT  NOT NULL,
  application_id    UUID  NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  platform          TEXT  NOT NULL CHECK (platform IN ('ios','android')),
  os_version        TEXT,
  app_version       TEXT,
  current_bundle_id UUID  REFERENCES public.ota_bundles(id) ON DELETE SET NULL,
  channel           TEXT,
  runtime_version   TEXT,
  first_seen        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_ota_devices UNIQUE (device_id, application_id)
);
SELECT public.ota_attach_updated_at('public.ota_devices');

CREATE INDEX IF NOT EXISTS idx_ota_devices_app      ON public.ota_devices (application_id);
CREATE INDEX IF NOT EXISTS idx_ota_devices_bundle   ON public.ota_devices (current_bundle_id);
CREATE INDEX IF NOT EXISTS idx_ota_devices_platform ON public.ota_devices (application_id, platform);
CREATE INDEX IF NOT EXISTS idx_ota_devices_last_seen ON public.ota_devices (application_id, last_seen DESC);
