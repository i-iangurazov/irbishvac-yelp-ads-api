import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/utils/env";

export async function getDefaultTenant() {
  return prisma.tenant.findUniqueOrThrow({
    where: { slug: getServerEnv().DEFAULT_TENANT_SLUG }
  });
}
