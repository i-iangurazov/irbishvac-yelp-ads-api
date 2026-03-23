export type YelpJobIssueSummary = {
  title: string;
  description: string;
  code?: string;
  rawMessage?: string;
};

type YelpJobError = {
  code?: string;
  message?: string;
};

type YelpStoredError = {
  code?: string;
  message?: string;
  details?: unknown;
};

const errorPriority: Record<string, number> = {
  CATEGORY_ALIAS_NOT_RECOGNIZED: 100,
  INVALID_LIST_INDEXES: 90,
  INVALID_OR_MISSING_REQUIRED_KEY: 80,
  BUSINESS_AUTHORIZATION_FAILED: 70,
  BUSINESS_NOT_ACTIVE: 70,
  PARENT_WAS_REJECTED: 1
};

function isIssueSummary(payload: unknown): payload is YelpJobIssueSummary {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { title?: unknown }).title === "string" &&
    typeof (payload as { description?: unknown }).description === "string"
  );
}

function getTopLevelError(payload: unknown): { code?: string; description?: string } | null {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error !== "object" || error === null) {
    return null;
  }

  return {
    code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined,
    description:
      typeof (error as { description?: unknown }).description === "string"
        ? (error as { description: string }).description
        : undefined
  };
}

function getStoredError(payload: unknown): YelpStoredError | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const source = payload as { code?: unknown; message?: unknown; details?: unknown };

  if (typeof source.code !== "string" && typeof source.message !== "string" && source.details === undefined) {
    return null;
  }

  return {
    code: typeof source.code === "string" ? source.code : undefined,
    message: typeof source.message === "string" ? source.message : undefined,
    details: source.details
  };
}

function collectNestedErrors(value: unknown, collected: YelpJobError[] = [], depth = 0): YelpJobError[] {
  if (depth > 8 || typeof value !== "object" || value === null) {
    return collected;
  }

  const record = value as Record<string, unknown>;

  if ("error" in record && typeof record.error === "object" && record.error !== null) {
    const error = record.error as Record<string, unknown>;

    if (typeof error.code === "string" || typeof error.message === "string") {
      collected.push({
        code: typeof error.code === "string" ? error.code : undefined,
        message: typeof error.message === "string" ? error.message : undefined
      });
    }
  }

  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        collectNestedErrors(entry, collected, depth + 1);
      }
      continue;
    }

    collectNestedErrors(child, collected, depth + 1);
  }

  return collected;
}

function getMostRelevantNestedError(payload: unknown): YelpJobError | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const businessResults = "business_results" in payload ? (payload as { business_results?: unknown }).business_results : undefined;

  if (!Array.isArray(businessResults)) {
    return null;
  }

  const errors = businessResults.flatMap((result) => collectNestedErrors(result));

  if (errors.length === 0) {
    return null;
  }

  return errors
    .slice()
    .sort((left, right) => (errorPriority[right.code ?? ""] ?? 10) - (errorPriority[left.code ?? ""] ?? 10))[0];
}

function getFirstBusinessError(payload: unknown): YelpJobError | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const businessResults = "business_results" in payload ? (payload as { business_results?: unknown }).business_results : undefined;

  if (!Array.isArray(businessResults)) {
    return null;
  }

  for (const result of businessResults) {
    if (typeof result !== "object" || result === null || !("error" in result)) {
      continue;
    }

    const error = (result as { error?: unknown }).error;

    if (typeof error !== "object" || error === null) {
      continue;
    }

    return {
      code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined,
      message:
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : undefined
    };
  }

  return null;
}

export function summarizeYelpJobIssue(payload: unknown): YelpJobIssueSummary | null {
  if (isIssueSummary(payload)) {
    return payload;
  }

  const topLevelError = getTopLevelError(payload);

  if (topLevelError?.code === "401_UNAUTHORIZED") {
    return {
      title: "Yelp rejected the status check credentials",
      description:
        "The original request may have been submitted, but Yelp would not allow this console to read the job status. Re-save the Partner API username and password, then retry polling.",
      code: topLevelError.code,
      rawMessage: topLevelError.description
    };
  }

  const issue = getMostRelevantNestedError(payload) ?? getFirstBusinessError(payload);

  if (!issue) {
    const storedError = getStoredError(payload);

    if (storedError?.code === "AUTH_FAILURE") {
      return {
        title: "Yelp rejected the status check credentials",
        description:
          "This job stopped polling because the saved Yelp Partner API credentials are no longer valid for job status checks. Re-save the credentials and retry.",
        code: storedError.code,
        rawMessage:
          typeof (storedError.details as { error?: { description?: string } } | null)?.error?.description === "string"
            ? ((storedError.details as { error: { description: string } }).error.description)
            : storedError.message
      };
    }

    if (storedError?.code === "MISSING_ACCESS") {
      return {
        title: "Yelp access is not enabled for status polling",
        description:
          "The console could not keep polling this Yelp job because the required Ads capability or credentials are now missing.",
        code: storedError.code,
        rawMessage: storedError.message
      };
    }

    if (storedError?.code === "UPSTREAM_UNAVAILABLE") {
      return {
        title: "Yelp status polling is temporarily unavailable",
        description:
          "The job is no longer being polled because Yelp could not be reached. Retry after checking network access, VPN requirements, or the saved base URL.",
        code: storedError.code,
        rawMessage: storedError.message
      };
    }

    if (storedError?.code === "UPSTREAM_RESPONSE_INVALID") {
      return {
        title: "Yelp returned a job status format this console could not read",
        description:
          "The status request reached Yelp, but the response shape did not match the format this console expected. The raw technical details are available below for investigation.",
        code: storedError.code,
        rawMessage: storedError.message
      };
    }

    if (topLevelError) {
      return {
        title: "Yelp status polling failed",
        description: topLevelError.description ?? "Yelp rejected the job status request.",
        code: topLevelError.code,
        rawMessage: topLevelError.description
      };
    }

    if (storedError?.message) {
      return {
        title: "Job polling failed",
        description: storedError.message,
        code: storedError.code,
        rawMessage: storedError.message
      };
    }

    return null;
  }

  if (issue.code === "BUSINESS_AUTHORIZATION_FAILED") {
    return {
      title: "This business is not authorized for your Yelp partner account",
      description:
        "Yelp received the request, but this credential set is not allowed to change that business. Confirm that the business belongs to your authorized account scope or ask Yelp to grant access for this business.",
      code: issue.code,
      rawMessage: issue.message
    };
  }

  if (issue.code === "BUSINESS_NOT_ACTIVE") {
    return {
      title: "This business is not eligible because Yelp has removed it from search",
      description:
        "Yelp rejected the request because the business is inactive or removed from Yelp search results. Ads changes cannot be made until the listing is active again.",
      code: issue.code,
      rawMessage: issue.message
    };
  }

  if (issue.code === "UNSUPPORTED_CATEGORIES") {
    return {
      title: "This business is not eligible for Yelp advertising",
      description:
        "Yelp marked this business as belonging to an advertising-restricted category, so ad programs cannot be created or updated for it.",
      code: issue.code,
      rawMessage: issue.message
    };
  }

  if (
    issue.code === "CATEGORY_ALIAS_NOT_RECOGNIZED" ||
    issue.code === "INVALID_LIST_INDEXES" ||
    (issue.code === "INVALID_OR_MISSING_REQUIRED_KEY" && /ad_categories/i.test(issue.message ?? ""))
  ) {
    return {
      title: "Yelp rejected the selected ad categories",
      description:
        "The selected values are not valid Yelp category aliases for CPC targeting. Update the business with valid Yelp category aliases and choose those aliases in the program form before resubmitting.",
      code: issue.code,
      rawMessage: issue.message
    };
  }

  return {
    title: "Yelp rejected this job",
    description: issue.message ?? "Yelp returned a business-level validation or authorization error.",
    code: issue.code,
    rawMessage: issue.message
  };
}
