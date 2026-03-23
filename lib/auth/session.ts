import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { getServerEnv } from "@/lib/utils/env";

const encoder = new TextEncoder();

export type SessionPayload = {
  sub: string;
  tenantId: string;
  roleCode: string;
  email: string;
  name: string;
};

function getSigningKey() {
  return encoder.encode(getServerEnv().SESSION_SECRET);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSigningKey());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSigningKey());
  return payload as unknown as SessionPayload;
}
