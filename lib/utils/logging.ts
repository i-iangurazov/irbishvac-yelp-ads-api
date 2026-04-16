import "server-only";

function emitLog(level: "info" | "warn" | "error", message: string, payload?: Record<string, unknown>) {
  console[level](`[${level}] ${message}`, {
    at: new Date().toISOString(),
    ...(payload ?? {})
  });
}

export function logInfo(message: string, payload?: Record<string, unknown>) {
  emitLog("info", message, payload);
}

export function logWarn(message: string, payload?: Record<string, unknown>) {
  emitLog("warn", message, payload);
}

export function logError(message: string, payload?: Record<string, unknown>) {
  emitLog("error", message, payload);
}
