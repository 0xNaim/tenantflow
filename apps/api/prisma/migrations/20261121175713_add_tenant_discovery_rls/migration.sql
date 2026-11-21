-- Allow authenticated users to discover only their own memberships.
CREATE POLICY membership_user_discovery
ON "Membership"
FOR SELECT
USING (
  "userId" = NULLIF(current_setting('app.user_id', true), '')
);

-- Allow users to see only tenants where they have an active membership.
CREATE POLICY tenant_member_discovery
ON "Tenant"
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM "Membership" m
    WHERE m."tenantId" = "Tenant"."id"
      AND m."userId" = NULLIF(current_setting('app.user_id', true), '')
      AND m."status" = 'ACTIVE'
  )
);
