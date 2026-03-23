import { vi } from "vitest";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-session-secret";
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY ?? "test-encryption-secret";

vi.mock("server-only", () => ({}));
