-- Allow platform-level audit events (tenantId IS NULL), e.g. login / MFA / logout,
-- which are written before any tenant context exists.
--
-- These rows are only visible/insertable when NO tenant context is set, so
-- tenant-scoped transactions (app.tenant_id set) still only see their own rows.
-- SELECT is required too because Prisma's create() uses INSERT ... RETURNING.
-- No UPDATE/DELETE policy: platform audit rows are append-only.

CREATE POLICY platform_events_insert ON "AuditLog"
  FOR INSERT
  WITH CHECK (
    "tenantId" IS NULL
    AND COALESCE(current_setting('app.tenant_id', true), '') = ''
  );

CREATE POLICY platform_events_select ON "AuditLog"
  FOR SELECT
  USING (
    "tenantId" IS NULL
    AND COALESCE(current_setting('app.tenant_id', true), '') = ''
  );
