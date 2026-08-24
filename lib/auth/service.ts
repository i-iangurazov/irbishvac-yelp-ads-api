import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RoleCode } from "@prisma/client";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail, getUserById } from "@/lib/db/users-repository";
import { resolveAccessibleTenant } from "@/lib/db/tenant-access-repository";
import { hasPermission, type Permission } from "@/lib/permissions";

export async function signIn(email: string, password: string) {
  const user = await findUserByEmail(email);

  if (!user || !user.isActive) {
    return { success: false as const, message: "Invalid email or password." };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return { success: false as const, message: "Invalid email or password." };
  }

  const token = await createSessionToken({
    sub: user.id,
    tenantId: user.tenantId,
    roleCode: user.role.code,
    email: user.email,
    name: user.name,
  });

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return { success: true as const };
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = await verifySessionToken(token);
    const user = await getUserById(payload.sub);

    if (!user.isActive) {
      return null;
    }

    const activeTenant = await resolveAccessibleTenant({
      userId: user.id,
      primaryTenantId: user.tenantId,
      roleCode: user.role.code,
      targetTenantId: payload.tenantId,
    });

    if (!activeTenant) {
      return null;
    }

    return {
      ...user,
      primaryTenantId: user.tenantId,
      tenantId: activeTenant.id,
      tenant: activeTenant,
    };
  } catch {
    return null;
  }
}

export async function switchActiveTenant(tenantId: string) {
  const user = await getCurrentUser();

  if (!user) {
    return { success: false as const, message: "Unauthorized" };
  }

  const target = await resolveAccessibleTenant({
    userId: user.id,
    primaryTenantId: user.primaryTenantId,
    roleCode: user.role.code,
    targetTenantId: tenantId,
  });

  if (!target) {
    return { success: false as const, message: "Tenant access denied." };
  }

  const token = await createSessionToken({
    sub: user.id,
    tenantId: target.id,
    roleCode: user.role.code,
    email: user.email,
    name: user.name,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return {
    success: true as const,
    tenant: { id: target.id, name: target.name, slug: target.slug },
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(roleCodes: RoleCode[]) {
  const user = await requireUser();

  if (!roleCodes.includes(user.role.code)) {
    redirect("/dashboard");
  }

  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireUser();

  if (!hasPermission(user.role.code, permission)) {
    redirect("/dashboard");
  }

  return user;
}
