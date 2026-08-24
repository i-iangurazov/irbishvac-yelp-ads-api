const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptWindow = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptWindow>();

function normalizedKey(ipAddress: string, email: string) {
  return `${ipAddress.trim() || "unknown"}:${email.trim().toLowerCase()}`;
}

export function checkLoginRateLimit(
  ipAddress: string,
  email: string,
  now = Date.now(),
) {
  const key = normalizedKey(ipAddress, email);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: current.count < MAX_ATTEMPTS,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function recordFailedLogin(
  ipAddress: string,
  email: string,
  now = Date.now(),
) {
  const key = normalizedKey(ipAddress, email);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempts.set(key, { ...current, count: current.count + 1 });
}

export function clearFailedLogins(ipAddress: string, email: string) {
  attempts.delete(normalizedKey(ipAddress, email));
}
