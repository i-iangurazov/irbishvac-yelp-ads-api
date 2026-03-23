export type DiffEntry = {
  path: string;
  before: unknown;
  after: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function diffObjects(before: unknown, after: unknown, prefix = ""): DiffEntry[] {
  if (before === after) {
    return [];
  }

  if (!isObject(before) || !isObject(after)) {
    return [{ path: prefix || "root", before, after }];
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: DiffEntry[] = [];

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    changes.push(...diffObjects(before[key], after[key], path));
  }

  return changes;
}
