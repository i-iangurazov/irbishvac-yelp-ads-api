import "server-only";

import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not configured. Copy .env.example to .env, start PostgreSQL, and rerun the app."
  );
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
