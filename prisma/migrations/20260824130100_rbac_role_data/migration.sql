INSERT INTO "Role" ("id", "code", "name", "description", "permissionsJson", "createdAt", "updatedAt")
VALUES
  ('role_platform_admin', 'PLATFORM_ADMIN', 'Platform Admin', 'Cross-tenant platform administration', '["*"]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_agency_operator', 'AGENCY_OPERATOR', 'Agency Operator', 'Assigned client operations', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_client_admin', 'CLIENT_ADMIN', 'Client Admin', 'Client tenant administration', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_client_manager', 'CLIENT_MANAGER', 'Client Manager', 'Campaign and autoresponder management', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role_reviewer', 'REVIEWER', 'Reviewer', 'Reply review and approval', '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "User" SET "roleId" = 'role_platform_admin'
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "code" = 'ADMIN');

UPDATE "User" SET "roleId" = 'role_agency_operator'
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "code" = 'OPERATOR');

UPDATE "User" SET "roleId" = 'role_reviewer'
WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "code" = 'ANALYST');

CREATE TABLE "UserTenantAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTenantAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTenantAccess_userId_tenantId_key" ON "UserTenantAccess"("userId", "tenantId");
CREATE INDEX "UserTenantAccess_tenantId_userId_idx" ON "UserTenantAccess"("tenantId", "userId");
ALTER TABLE "UserTenantAccess" ADD CONSTRAINT "UserTenantAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserTenantAccess" ADD CONSTRAINT "UserTenantAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
