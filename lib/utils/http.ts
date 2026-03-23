import "server-only";

import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/service";
import { hasPermission, type Permission } from "@/lib/permissions";
import { getServerEnv } from "@/lib/utils/env";
import { normalizeUnknownError, YelpApiError } from "@/lib/yelp/errors";

export async function requireApiUser() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return user;
}

export async function requireApiPermission(permission: Permission) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(user.role.code, permission)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  return user;
}

function secretsMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export function requireCronAuthorization(request: Request) {
  const { CRON_SECRET } = getServerEnv();

  if (!CRON_SECRET) {
    return NextResponse.json({ message: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  const providedSecret = bearerToken ?? headerSecret;

  if (!providedSecret || !secretsMatch(CRON_SECRET, providedSecret)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function handleRouteError(error: unknown) {
  const normalized = normalizeUnknownError(error);

  return NextResponse.json(
    {
      message: normalized.message,
      code: normalized instanceof YelpApiError ? normalized.code : undefined,
      details: normalized instanceof YelpApiError ? normalized.details ?? null : undefined
    },
    { status: normalized instanceof YelpApiError ? normalized.status : 500 }
  );
}
