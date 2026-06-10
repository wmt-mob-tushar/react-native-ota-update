-- ============================================================
-- OTA Platform — Row-Level Security
-- Migration: 20260609000003_ota_rls
-- Two trust zones:
--   Operators  → JWT-authenticated Supabase users
--   Devices    → no direct DB access (Edge Functions, service role)
-- ============================================================

-- ── Helper: role hierarchy ────────────────────────────────────
-- Returns TRUE when the current user is a member of the given
-- application with at least the requested role.
CREATE OR REPLACE FUNCTION public.ota_is_app_member(
  p_application_id UUID,
  p_min_role       TEXT DEFAULT 'viewer'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_role_order      INT;
  v_user_role       TEXT;
  v_user_role_order INT;
BEGIN
  CASE p_min_role
    WHEN 'owner'     THEN v_role_order := 4;
    WHEN 'admin'     THEN v_role_order := 3;
    WHEN 'developer' THEN v_role_order := 2;
    ELSE                  v_role_order := 1;   -- viewer
  END CASE;

  SELECT role INTO v_user_role
  FROM   public.application_members
  WHERE  application_id = p_application_id
    AND  user_id        = auth.uid();

  IF v_user_role IS NULL THEN RETURN FALSE; END IF;

  CASE v_user_role
    WHEN 'owner'     THEN v_user_role_order := 4;
    WHEN 'admin'     THEN v_user_role_order := 3;
    WHEN 'developer' THEN v_user_role_order := 2;
    ELSE                  v_user_role_order := 1;
  END CASE;

  RETURN v_user_role_order >= v_role_order;
END;
$$;

-- ── Enable RLS on every OTA table ────────────────────────────
ALTER TABLE public.applications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_runtimes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_bundles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_deployments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rollouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_installations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_crashes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_rollbacks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_analytics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ota_devices          ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════
-- applications
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "applications: any authenticated user can create" ON public.applications;
CREATE POLICY "applications: any authenticated user can create"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "applications: members can read" ON public.applications;
CREATE POLICY "applications: members can read"
  ON public.applications FOR SELECT
  TO authenticated
  USING (public.ota_is_app_member(id, 'viewer'));

DROP POLICY IF EXISTS "applications: admins can update" ON public.applications;
CREATE POLICY "applications: admins can update"
  ON public.applications FOR UPDATE
  TO authenticated
  USING  (public.ota_is_app_member(id, 'admin'))
  WITH CHECK (public.ota_is_app_member(id, 'admin'));

DROP POLICY IF EXISTS "applications: owner can delete" ON public.applications;
CREATE POLICY "applications: owner can delete"
  ON public.applications FOR DELETE
  TO authenticated
  USING (public.ota_is_app_member(id, 'owner'));

-- ════════════════════════════════════════════════════════════════
-- application_members
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "members: can read own app's members" ON public.application_members;
CREATE POLICY "members: can read own app's members"
  ON public.application_members FOR SELECT
  TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "members: admins can manage members" ON public.application_members;
CREATE POLICY "members: admins can manage members"
  ON public.application_members FOR INSERT
  TO authenticated
  WITH CHECK (public.ota_is_app_member(application_id, 'admin'));

DROP POLICY IF EXISTS "members: admins can update roles" ON public.application_members;
CREATE POLICY "members: admins can update roles"
  ON public.application_members FOR UPDATE
  TO authenticated
  USING  (public.ota_is_app_member(application_id, 'admin'))
  WITH CHECK (public.ota_is_app_member(application_id, 'admin'));

DROP POLICY IF EXISTS "members: admins or self can remove" ON public.application_members;
CREATE POLICY "members: admins or self can remove"
  ON public.application_members FOR DELETE
  TO authenticated
  USING (
    public.ota_is_app_member(application_id, 'admin')
    OR user_id = auth.uid()
  );

-- ════════════════════════════════════════════════════════════════
-- ota_channels
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "channels: members can read" ON public.ota_channels;
CREATE POLICY "channels: members can read"
  ON public.ota_channels FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "channels: developers can create" ON public.ota_channels;
CREATE POLICY "channels: developers can create"
  ON public.ota_channels FOR INSERT TO authenticated
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

DROP POLICY IF EXISTS "channels: admins can update" ON public.ota_channels;
CREATE POLICY "channels: admins can update"
  ON public.ota_channels FOR UPDATE TO authenticated
  USING  (public.ota_is_app_member(application_id, 'admin'))
  WITH CHECK (public.ota_is_app_member(application_id, 'admin'));

DROP POLICY IF EXISTS "channels: admins can delete" ON public.ota_channels;
CREATE POLICY "channels: admins can delete"
  ON public.ota_channels FOR DELETE TO authenticated
  USING (public.ota_is_app_member(application_id, 'admin'));

-- ════════════════════════════════════════════════════════════════
-- ota_runtimes
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "runtimes: members can read" ON public.ota_runtimes;
CREATE POLICY "runtimes: members can read"
  ON public.ota_runtimes FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "runtimes: developers can manage" ON public.ota_runtimes;
CREATE POLICY "runtimes: developers can manage"
  ON public.ota_runtimes FOR INSERT TO authenticated
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

DROP POLICY IF EXISTS "runtimes: developers can update" ON public.ota_runtimes;
CREATE POLICY "runtimes: developers can update"
  ON public.ota_runtimes FOR UPDATE TO authenticated
  USING  (public.ota_is_app_member(application_id, 'developer'))
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

-- ════════════════════════════════════════════════════════════════
-- ota_bundles
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "bundles: members can read" ON public.ota_bundles;
CREATE POLICY "bundles: members can read"
  ON public.ota_bundles FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "bundles: developers can create" ON public.ota_bundles;
CREATE POLICY "bundles: developers can create"
  ON public.ota_bundles FOR INSERT TO authenticated
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

DROP POLICY IF EXISTS "bundles: developers can update" ON public.ota_bundles;
CREATE POLICY "bundles: developers can update"
  ON public.ota_bundles FOR UPDATE TO authenticated
  USING  (public.ota_is_app_member(application_id, 'developer'))
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

-- ════════════════════════════════════════════════════════════════
-- ota_deployments
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "deployments: members can read" ON public.ota_deployments;
CREATE POLICY "deployments: members can read"
  ON public.ota_deployments FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "deployments: developers can create" ON public.ota_deployments;
CREATE POLICY "deployments: developers can create"
  ON public.ota_deployments FOR INSERT TO authenticated
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

DROP POLICY IF EXISTS "deployments: developers can update" ON public.ota_deployments;
CREATE POLICY "deployments: developers can update"
  ON public.ota_deployments FOR UPDATE TO authenticated
  USING  (public.ota_is_app_member(application_id, 'developer'))
  WITH CHECK (public.ota_is_app_member(application_id, 'developer'));

-- ════════════════════════════════════════════════════════════════
-- ota_rollouts
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "rollouts: members can read" ON public.ota_rollouts;
CREATE POLICY "rollouts: members can read"
  ON public.ota_rollouts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ota_deployments d
      WHERE d.id = deployment_id
        AND public.ota_is_app_member(d.application_id, 'viewer')
    )
  );

DROP POLICY IF EXISTS "rollouts: developers can manage" ON public.ota_rollouts;
CREATE POLICY "rollouts: developers can manage"
  ON public.ota_rollouts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ota_deployments d
      WHERE d.id = deployment_id
        AND public.ota_is_app_member(d.application_id, 'developer')
    )
  );

DROP POLICY IF EXISTS "rollouts: developers can update" ON public.ota_rollouts;
CREATE POLICY "rollouts: developers can update"
  ON public.ota_rollouts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ota_deployments d
      WHERE d.id = deployment_id
        AND public.ota_is_app_member(d.application_id, 'developer')
    )
  );

-- ════════════════════════════════════════════════════════════════
-- ota_rollbacks
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "rollbacks: members can read" ON public.ota_rollbacks;
CREATE POLICY "rollbacks: members can read"
  ON public.ota_rollbacks FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

-- Writes only via service-role in Edge Functions (no INSERT policy for auth users)

-- ════════════════════════════════════════════════════════════════
-- Telemetry tables: installations, crashes, analytics, devices
-- Writes via service-role (Edge Functions) only.
-- Reads via dashboard (members).
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "installations: members can read" ON public.ota_installations;
CREATE POLICY "installations: members can read"
  ON public.ota_installations FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "crashes: members can read" ON public.ota_crashes;
CREATE POLICY "crashes: members can read"
  ON public.ota_crashes FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "analytics: members can read" ON public.ota_analytics;
CREATE POLICY "analytics: members can read"
  ON public.ota_analytics FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

DROP POLICY IF EXISTS "devices: members can read" ON public.ota_devices;
CREATE POLICY "devices: members can read"
  ON public.ota_devices FOR SELECT TO authenticated
  USING (public.ota_is_app_member(application_id, 'viewer'));

-- ════════════════════════════════════════════════════════════════
-- Grant service_role full bypass (already default in Supabase,
-- but explicit for clarity after RLS is enabled).
-- ════════════════════════════════════════════════════════════════
-- service_role bypasses RLS by default in Supabase — no extra grants needed.
-- The above policies govern the `authenticated` and `anon` roles only.
