-- Add the new global permission.
INSERT INTO "Permission" (
  "id",
  "key",
  "description",
  "createdAt"
)
VALUES (
  gen_random_uuid()::text,
  'tenant:update',
  'Update tenant information',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- Grant tenant:update to existing OWNER roles.
INSERT INTO "RolePermission" (
  "tenantId",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  r."tenantId",
  r."id",
  p."id",
  NOW()
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'OWNER'
  AND p."key" = 'tenant:update'
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
