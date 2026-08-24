import "server-only";

import type { RoleCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function resolveAccessibleTenant(params: {
  userId: string;
  primaryTenantId: string;
  roleCode: RoleCode;
  targetTenantId: string;
}) {
  if (params.targetTenantId === params.primaryTenantId) {
    return prisma.tenant.findUnique({ where: { id: params.targetTenantId } });
  }

  if (params.roleCode === "PLATFORM_ADMIN") {
    return prisma.tenant.findUnique({ where: { id: params.targetTenantId } });
  }

  if (params.roleCode !== "AGENCY_OPERATOR") {
    return null;
  }

  const access = await prisma.userTenantAccess.findUnique({
    where: {
      userId_tenantId: {
        userId: params.userId,
        tenantId: params.targetTenantId,
      },
    },
    include: { tenant: true },
  });

  return access?.tenant ?? null;
}

export async function listAccessibleTenants(params: {
  userId: string;
  primaryTenantId: string;
  roleCode: RoleCode;
}) {
  if (params.roleCode === "PLATFORM_ADMIN") {
    return prisma.tenant.findMany({
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  if (params.roleCode === "AGENCY_OPERATOR") {
    const [primary, assigned] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: params.primaryTenantId } }),
      prisma.userTenantAccess.findMany({
        where: { userId: params.userId },
        include: { tenant: true },
        orderBy: { tenant: { name: "asc" } },
      }),
    ]);
    const tenants = [primary, ...assigned.map((entry) => entry.tenant)].filter(
      (tenant): tenant is NonNullable<typeof tenant> => Boolean(tenant),
    );

    return [...new Map(tenants.map((tenant) => [tenant.id, tenant])).values()];
  }

  const primary = await prisma.tenant.findUnique({
    where: { id: params.primaryTenantId },
  });
  return primary ? [primary] : [];
}
