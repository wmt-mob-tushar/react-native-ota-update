-- ============================================================
-- OTA Platform — Default channel auto-creation
-- Migration: 20260609000007_default_channel
--
-- Creating an app in the dashboard only enrolled the owner; the
-- "production" channel had to be created manually (CLI/dashboard)
-- before check-update could match anything. Create it automatically
-- on app creation, and backfill apps that don't have one yet.
-- ============================================================

-- Auto-enroll the creator as owner AND create the default channel
CREATE OR REPLACE FUNCTION public.ota_on_application_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.application_members (application_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (application_id, user_id) DO NOTHING;

  INSERT INTO public.ota_channels (application_id, name, is_default)
  VALUES (NEW.id, 'production', TRUE)
  ON CONFLICT (application_id, name) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Backfill: every existing app gets a production channel (default only
-- if the app has no default channel yet).
INSERT INTO public.ota_channels (application_id, name, is_default)
SELECT a.id, 'production',
       NOT EXISTS (
         SELECT 1 FROM public.ota_channels c
         WHERE c.application_id = a.id AND c.is_default
       )
FROM public.applications a
ON CONFLICT (application_id, name) DO NOTHING;
