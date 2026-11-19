-- AuditLog RLS hardening.
--
-- Tenant audit rows: readable/insertable only inside the matching tenant context.
-- Global auth rows (tenantId IS NULL): insertable only outside a tenant context,
-- and NOT readable by the runtime role at all. Investigation of global events
-- goes through a privileged admin workflow, never the tenant API.
--
-- AuditService inserts with createMany (plain INSERT, no RETURNING), so no
-- SELECT policy is needed for global rows to be written.

-- 1. Replace the broad FOR ALL tenant policy with SELECT/INSERT-only policies.
--    UPDATE/DELETE stay revoked + trigger-blocked (audit_log_append_only).
DROP POLICY tenant_isolation ON "AuditLog";

CREATE POLICY audit_log_tenant_select ON "AuditLog"
  AS PERMISSIVE
  FOR SELECT
  TO tenantflow_app
  USING (
    "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY audit_log_tenant_insert ON "AuditLog"
  AS PERMISSIVE
  FOR INSERT
  TO tenantflow_app
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

-- 2. Global rows: keep the insert path, remove the read path.
DROP POLICY platform_events_select ON "AuditLog";

DROP POLICY platform_events_insert ON "AuditLog";

CREATE POLICY audit_log_global_insert ON "AuditLog"
  AS PERMISSIVE
  FOR INSERT
  TO tenantflow_app
  WITH CHECK (
    "tenantId" IS NULL
    AND NULLIF(current_setting('app.tenant_id', true), '') IS NULL
  );

-- 3. Restrictive boundaries (AND-ed with every permissive policy), so a future
--    permissive policy cannot accidentally widen access.
CREATE POLICY audit_log_select_boundary ON "AuditLog"
  AS RESTRICTIVE
  FOR SELECT
  TO tenantflow_app
  USING (
    "tenantId" IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE POLICY audit_log_insert_boundary ON "AuditLog"
  AS RESTRICTIVE
  FOR INSERT
  TO tenantflow_app
  WITH CHECK (
    ("tenantId" IS NULL
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NULL)
    OR "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
  );
