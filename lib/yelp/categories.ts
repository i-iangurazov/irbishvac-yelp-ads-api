export type YelpCategoryOption = {
  label: string;
  alias?: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeAlias(value: string) {
  return value.length > 0 && !/\s/.test(value) && value === value.toLowerCase();
}

function normalizeEntry(entry: unknown): YelpCategoryOption | null {
  if (typeof entry === "string") {
    const value = entry.trim();

    if (!value) {
      return null;
    }

    return looksLikeAlias(value) ? { label: value, alias: value } : { label: value };
  }

  if (typeof entry !== "object" || entry === null) {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const label =
    normalizeText(record.label) ||
    normalizeText(record.title) ||
    normalizeText(record.name) ||
    normalizeText(record.display_name) ||
    normalizeText(record.alias);
  const alias = normalizeText(record.alias);

  if (!label && !alias) {
    return null;
  }

  return {
    label: label || alias,
    alias: alias || undefined
  };
}

export function normalizeYelpCategories(input: unknown): YelpCategoryOption[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduped = new Map<string, YelpCategoryOption>();

  for (const entry of input) {
    const normalized = normalizeEntry(entry);

    if (!normalized) {
      continue;
    }

    const key = normalized.alias ?? normalized.label.toLowerCase();
    const existing = deduped.get(key);

    deduped.set(key, {
      label: normalized.label || existing?.label || key,
      alias: normalized.alias ?? existing?.alias
    });
  }

  return [...deduped.values()];
}

export function formatYelpCategory(option: YelpCategoryOption) {
  return option.alias ? `${option.label} (${option.alias})` : option.label;
}

export function extractYelpCategoryAliases(input: unknown) {
  return normalizeYelpCategories(input)
    .map((category) => category.alias)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function parseManualCategoryText(input: string) {
  const entries = input
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  return normalizeYelpCategories(
    entries.map((entry) => {
      const [rawLabel, rawAlias] = entry.split("|").map((value) => value.trim());

      if (rawAlias) {
        return {
          label: rawLabel,
          alias: rawAlias
        };
      }

      return rawLabel;
    })
  );
}
