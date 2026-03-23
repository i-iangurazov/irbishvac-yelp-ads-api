import "server-only";

import type { Prisma } from "@prisma/client";

export function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
