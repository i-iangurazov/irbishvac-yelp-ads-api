import "server-only";

import type { RoleCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true, tenant: true }
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    include: { role: true, tenant: true }
  });
}

export async function getTenantUserById(userId: string, tenantId: string) {
  return prisma.user.findFirstOrThrow({
    where: { id: userId, tenantId },
    include: { role: true, tenant: true }
  });
}

export async function listUsersByTenant(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    include: { role: true },
    orderBy: { name: "asc" }
  });
}

export async function countActiveUsersByRole(tenantId: string, roleCode: RoleCode) {
  return prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      role: {
        code: roleCode
      }
    }
  });
}

export async function updateUserRole(tenantId: string, userId: string, roleCode: RoleCode) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: roleCode }
  });

  await prisma.user.findFirstOrThrow({
    where: {
      id: userId,
      tenantId
    }
  });

  return prisma.user.update({
    where: { id: userId },
    data: { roleId: role.id },
    include: { role: true, tenant: true }
  });
}
