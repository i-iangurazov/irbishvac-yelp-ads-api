import "server-only";

import { prisma } from "@/lib/db/prisma";
import { toJsonValue } from "@/lib/db/json";

export async function getSystemSetting<T>(tenantId: string, key: string) {
  const setting = await prisma.systemSetting.findUnique({
    where: {
      tenantId_key: {
        tenantId,
        key
      }
    }
  });

  return (setting?.valueJson as T | undefined) ?? null;
}

export async function upsertSystemSetting(tenantId: string, key: string, valueJson: unknown) {
  return prisma.systemSetting.upsert({
    where: {
      tenantId_key: {
        tenantId,
        key
      }
    },
    update: { valueJson: toJsonValue(valueJson) },
    create: { tenantId, key, valueJson: toJsonValue(valueJson) }
  });
}
