import "server-only";

export function logInfo(message: string, payload?: Record<string, unknown>) {
  console.info(`[info] ${message}`, payload ?? {});
}

export function logError(message: string, payload?: Record<string, unknown>) {
  console.error(`[error] ${message}`, payload ?? {});
}
