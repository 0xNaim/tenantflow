-- Runtime application role (DATABASE_URL connects as this role).
--
-- Must NOT be a superuser, table owner, or have BYPASSRLS, otherwise the
-- tenant RLS policies are silently skipped. Migrations keep running as the
-- owner role via DIRECT_URL.
--
-- The password is deliberately not set here (secrets don't belong in git).
-- Set it per environment, e.g.:
--   ALTER ROLE tenantflow_app WITH LOGIN PASSWORD '<from DATABASE_URL>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenantflow_app') THEN
    CREATE ROLE tenantflow_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO tenantflow_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenantflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tenantflow_app;

-- Tables/sequences created by later migrations (run as the owner role).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tenantflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO tenantflow_app;

-- The migration bookkeeping table is not the app's business.
REVOKE ALL ON TABLE "_prisma_migrations" FROM tenantflow_app;
