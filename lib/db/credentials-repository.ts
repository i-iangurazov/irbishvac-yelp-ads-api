import "server-only";

import type { ConnectionTestStatus, CredentialKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listCredentialSets(tenantId: string) {
  return prisma.credentialSet.findMany({
    where: { tenantId },
    orderBy: { kind: "asc" }
  });
}

export async function getCredentialSet(tenantId: string, kind: CredentialKind) {
  return prisma.credentialSet.findUnique({
    where: {
      tenantId_kind: {
        tenantId,
        kind
      }
    }
  });
}

export async function upsertCredentialSet(tenantId: string, kind: CredentialKind, data: Prisma.CredentialSetUncheckedCreateInput) {
  return prisma.credentialSet.upsert({
    where: {
      tenantId_kind: {
        tenantId,
        kind
      }
    },
    update: data,
    create: {
      ...data,
      tenantId,
      kind
    }
  });
}

export async function updateCredentialTestResult(
  tenantId: string,
  kind: CredentialKind,
  status: ConnectionTestStatus,
  lastErrorMessage?: string | null
) {
  return prisma.credentialSet.update({
    where: {
      tenantId_kind: {
        tenantId,
        kind
      }
    },
    data: {
      lastTestStatus: status,
      lastTestedAt: new Date(),
      lastErrorMessage: lastErrorMessage ?? null
    }
  });
}
