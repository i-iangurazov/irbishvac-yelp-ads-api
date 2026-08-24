import type { RoleCode } from "@prisma/client";

export const PRODUCTION_ROLE_CODES = [
  "PLATFORM_ADMIN",
  "AGENCY_OPERATOR",
  "CLIENT_ADMIN",
  "CLIENT_MANAGER",
  "REVIEWER",
  "VIEWER",
] as const satisfies readonly RoleCode[];

export type ProductionRoleCode = (typeof PRODUCTION_ROLE_CODES)[number];

export const roleLabels: Record<ProductionRoleCode, string> = {
  PLATFORM_ADMIN: "Platform administrator",
  AGENCY_OPERATOR: "Agency operator",
  CLIENT_ADMIN: "Client administrator",
  CLIENT_MANAGER: "Client manager",
  REVIEWER: "Reply reviewer",
  VIEWER: "Viewer",
};

const clientAssignableRoleCodes = [
  "CLIENT_ADMIN",
  "CLIENT_MANAGER",
  "REVIEWER",
  "VIEWER",
] as const satisfies readonly ProductionRoleCode[];

export function getAssignableRoleCodes(
  actorRole: RoleCode,
): readonly ProductionRoleCode[] {
  if (actorRole === "PLATFORM_ADMIN" || actorRole === "ADMIN") {
    return PRODUCTION_ROLE_CODES;
  }

  if (actorRole === "CLIENT_ADMIN") {
    return clientAssignableRoleCodes;
  }

  return [];
}

export function canAssignRole(actorRole: RoleCode, roleCode: RoleCode) {
  return getAssignableRoleCodes(actorRole).some((code) => code === roleCode);
}
