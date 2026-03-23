import { format } from "date-fns";

export function formatCurrency(cents: number | null | undefined, currency = "USD") {
  if (typeof cents !== "number") {
    return "Not set";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function formatInteger(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

export function parseCurrencyToCents(input: string) {
  const normalized = input.replace(/[$,\s]/g, "");

  if (!normalized) {
    return 0;
  }

  const numeric = Number(normalized);

  if (Number.isNaN(numeric)) {
    throw new Error("Currency input is invalid.");
  }

  return Math.round(numeric * 100);
}

export function formatDateTime(value: string | Date | null | undefined, pattern = "MMM d, yyyy h:mm a") {
  if (!value) {
    return "Not available";
  }

  return format(new Date(value), pattern);
}

export function titleCase(value: string) {
  return value
    .replaceAll(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
