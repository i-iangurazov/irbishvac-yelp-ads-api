import "server-only";

import { ZodError } from "zod";

export class YelpApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class YelpAuthFailureError extends YelpApiError {
  constructor(details?: unknown) {
    super("Yelp authentication failed. Check the configured credentials.", "AUTH_FAILURE", 401, details);
  }
}

export class YelpMissingAccessError extends YelpApiError {
  constructor(message = "This Yelp capability is not enabled or credentials are missing.", details?: unknown) {
    super(message, "MISSING_ACCESS", 403, details);
  }
}

export class YelpValidationError extends YelpApiError {
  constructor(message = "The submitted request is invalid.", details?: unknown) {
    super(message, "VALIDATION_ERROR", 422, details);
  }
}

export class YelpNotFoundError extends YelpApiError {
  constructor(message = "The requested Yelp resource was not found.", details?: unknown) {
    super(message, "NOT_FOUND", 404, details);
  }
}

export class YelpRateLimitError extends YelpApiError {
  constructor(details?: unknown) {
    super("Yelp rate limited the request. Please retry shortly.", "RATE_LIMIT", 429, details);
  }
}

export class YelpPartialAsyncJobFailureError extends YelpApiError {
  constructor(message = "The Yelp job completed with partial failures.", details?: unknown) {
    super(message, "PARTIAL_ASYNC_JOB_FAILURE", 207, details);
  }
}

export class YelpUpstreamUnavailableError extends YelpApiError {
  constructor(message = "Yelp is temporarily unavailable.", details?: unknown) {
    super(message, "UPSTREAM_UNAVAILABLE", 503, details);
  }
}

export async function normalizeYelpError(response: Response) {
  let payload: unknown = null;

  try {
    payload = await response.clone().json();
  } catch {
    try {
      payload = await response.text();
    } catch {
      payload = null;
    }
  }

  switch (response.status) {
    case 401:
      return new YelpAuthFailureError(payload);
    case 403:
      return new YelpMissingAccessError("The current Yelp account does not have access to this capability.", payload);
    case 404:
      return new YelpNotFoundError(undefined, payload);
    case 422:
    case 400:
      return new YelpValidationError("Yelp rejected the request payload.", payload);
    case 429:
      return new YelpRateLimitError(payload);
    case 500:
    case 502:
    case 503:
    case 504:
      return new YelpUpstreamUnavailableError(undefined, payload);
    default:
      return new YelpApiError(
        "The Yelp API returned an unexpected error.",
        "UNEXPECTED_UPSTREAM_ERROR",
        response.status,
        payload
      );
  }
}

export function normalizeUnknownError(error: unknown) {
  if (error instanceof YelpApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new YelpApiError("Yelp returned a response format this console could not parse.", "UPSTREAM_RESPONSE_INVALID", 502, {
      issues: error.issues
    });
  }

  if (error instanceof Error) {
    if (
      error.name === "AbortError" ||
      /fetch failed/i.test(error.message) ||
      /getaddrinfo/i.test(error.message) ||
      /ENOTFOUND/i.test(error.message) ||
      /ECONNREFUSED/i.test(error.message)
    ) {
      return new YelpUpstreamUnavailableError(
        "Could not reach Yelp. Check the base URL, network access, or VPN requirements.",
        {
          name: error.name,
          message: error.message
        }
      );
    }

    return new YelpApiError(error.message || "An unexpected server error occurred.", "UNKNOWN_ERROR", 500, {
      name: error.name,
      message: error.message
    });
  }

  return new YelpApiError("An unexpected server error occurred.", "UNKNOWN_ERROR", 500, error);
}
