import type { RoleCode } from "@prisma/client";

export const PERMISSIONS = {
  "settings:write": "settings:write",
  "settings:read": "settings:read",
  "businesses:read": "businesses:read",
  "businesses:write": "businesses:write",
  "programs:read": "programs:read",
  "programs:write": "programs:write",
  "programs:terminate": "programs:terminate",
  "features:read": "features:read",
  "features:write": "features:write",
  "reports:read": "reports:read",
  "reports:request": "reports:request",
  "audit:read": "audit:read"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const permissionMap: Record<RoleCode, Permission[] | ["*"]> = {
  ADMIN: ["*"],
  OPERATOR: [
    PERMISSIONS["settings:read"],
    PERMISSIONS["businesses:read"],
    PERMISSIONS["businesses:write"],
    PERMISSIONS["programs:read"],
    PERMISSIONS["programs:write"],
    PERMISSIONS["programs:terminate"],
    PERMISSIONS["features:read"],
    PERMISSIONS["features:write"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["reports:request"],
    PERMISSIONS["audit:read"]
  ],
  ANALYST: [
    PERMISSIONS["settings:read"],
    PERMISSIONS["businesses:read"],
    PERMISSIONS["programs:read"],
    PERMISSIONS["features:read"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["reports:request"],
    PERMISSIONS["audit:read"]
  ],
  VIEWER: [
    PERMISSIONS["settings:read"],
    PERMISSIONS["businesses:read"],
    PERMISSIONS["programs:read"],
    PERMISSIONS["features:read"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["audit:read"]
  ]
};

export function getPermissionsForRole(roleCode: RoleCode) {
  return permissionMap[roleCode];
}

export function hasPermission(roleCode: RoleCode, permission: Permission) {
  const permissions = getPermissionsForRole(roleCode);
  return (permissions as readonly string[]).includes("*") || (permissions as readonly string[]).includes(permission);
}
