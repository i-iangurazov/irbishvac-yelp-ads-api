import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getServerEnv } from "@/lib/utils/env";

const ALGORITHM = "aes-256-gcm";

function getKey() {
  return createHash("sha256").update(getServerEnv().APP_ENCRYPTION_KEY).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string) {
  const [iv, tag, encrypted] = payload.split(".");

  if (!iv || !tag || !encrypted) {
    throw new Error("Invalid encrypted payload.");
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
