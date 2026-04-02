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
  "leads:read": "leads:read",
  "leads:write": "leads:write",
  "reports:read": "reports:read",
  "reports:request": "reports:request",
  "locations:read": "locations:read",
  "services:read": "services:read",
  "integrations:read": "integrations:read",
  "sync:read": "sync:read",
  "sync:retry": "sync:retry",
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
    PERMISSIONS["leads:read"],
    PERMISSIONS["leads:write"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["reports:request"],
    PERMISSIONS["locations:read"],
    PERMISSIONS["services:read"],
    PERMISSIONS["integrations:read"],
    PERMISSIONS["sync:read"],
    PERMISSIONS["sync:retry"],
    PERMISSIONS["audit:read"]
  ],
  ANALYST: [
    PERMISSIONS["settings:read"],
    PERMISSIONS["businesses:read"],
    PERMISSIONS["programs:read"],
    PERMISSIONS["features:read"],
    PERMISSIONS["leads:read"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["reports:request"],
    PERMISSIONS["locations:read"],
    PERMISSIONS["services:read"],
    PERMISSIONS["integrations:read"],
    PERMISSIONS["sync:read"],
    PERMISSIONS["audit:read"]
  ],
  VIEWER: [
    PERMISSIONS["settings:read"],
    PERMISSIONS["businesses:read"],
    PERMISSIONS["programs:read"],
    PERMISSIONS["features:read"],
    PERMISSIONS["leads:read"],
    PERMISSIONS["reports:read"],
    PERMISSIONS["locations:read"],
    PERMISSIONS["services:read"],
    PERMISSIONS["integrations:read"],
    PERMISSIONS["sync:read"],
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
