
-- TenantFlow: PostgreSQL Row-Level Security
-- Tenant context must be set inside the current transaction.
-- Missing context must deny access.

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Tenant"
  FOR ALL
  USING (
    id = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    id = current_setting('app.tenant_id', true)
  );


ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Membership"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Role"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "MembershipRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipRole" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "MembershipRole"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "RolePermission"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Invitation"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "Project"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "ProjectMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectMember" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "ProjectMember"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );


ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "AuditLog"
  FOR ALL
  USING (
    "tenantId" = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.tenant_id', true)
  );
