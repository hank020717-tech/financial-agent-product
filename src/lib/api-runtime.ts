import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

type ApiTraceDetails = Record<string, string | number | boolean | null | undefined>;

type ApiTrace = {
  requestId: string;
  error: (event: string, error: unknown, details?: ApiTraceDetails) => void;
  info: (event: string, details?: ApiTraceDetails) => void;
};

type ApiHandler = (
  request: NextRequest,
  trace: ApiTrace,
) => Promise<Response>;

type RateLimitEntry = {
  timestamps: number[];
};

const globalForRateLimit = globalThis as typeof globalThis & {
  apiRateLimits?: Map<string, RateLimitEntry>;
  recentApiRequests?: Map<string, number>;
};

const apiRateLimits =
  globalForRateLimit.apiRateLimits ?? new Map<string, RateLimitEntry>();

globalForRateLimit.apiRateLimits = apiRateLimits;

const recentApiRequests =
  globalForRateLimit.recentApiRequests ?? new Map<string, number>();

globalForRateLimit.recentApiRequests = recentApiRequests;

function normalizeRequestId(value: string | null) {
  if (value && /^[a-zA-Z0-9_-]{8,80}$/.test(value)) return value;
  return randomUUID();
}

function logEvent(
  level: "info" | "error",
  route: string,
  requestId: string,
  event: string,
  details: ApiTraceDetails = {},
  error?: unknown,
) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    route,
    requestId,
    event,
    ...details,
    ...(error
      ? {
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage:
            error instanceof Error ? error.message : "Unknown server error",
        }
      : {}),
  };

  const message = JSON.stringify(payload);
  if (level === "error") {
    console.error(message);
  } else {
    console.info(message);
  }
}

export function withApiTrace(route: string, handler: ApiHandler) {
  return async function tracedHandler(request: NextRequest) {
    const requestedId = request.headers.get("x-request-id");
    const requestId = normalizeRequestId(requestedId);
    const startedAt = performance.now();
    const requestKey = `${route}:${requestId}`;
    const now = Date.now();

    if (requestedId && (recentApiRequests.get(requestKey) ?? 0) > now) {
      return NextResponse.json(
        {
          error: "该操作已经提交，请勿重复点击。",
          requestId,
        },
        {
          status: 409,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }

    if (requestedId) {
      recentApiRequests.set(requestKey, now + 10 * 60_000);
    }
    const trace: ApiTrace = {
      requestId,
      info(event, details) {
        logEvent("info", route, requestId, event, details);
      },
      error(event, error, details) {
        logEvent("error", route, requestId, event, details, error);
      },
    };

    trace.info("request_started", {
      method: request.method,
    });

    try {
      const response = await handler(request, trace);
      response.headers.set("x-request-id", requestId);
      response.headers.set("cache-control", "no-store");
      trace.info("request_finished", {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      });

      if (response.status >= 500) {
        recentApiRequests.delete(requestKey);
      }

      if (recentApiRequests.size > 5000) {
        for (const [key, expiresAt] of recentApiRequests.entries()) {
          if (expiresAt <= now) recentApiRequests.delete(key);
        }
      }

      return response;
    } catch (error) {
      recentApiRequests.delete(requestKey);
      trace.error("unhandled_error", error, {
        durationMs: Math.round(performance.now() - startedAt),
      });

      return NextResponse.json(
        {
          error: "服务暂时不可用，请稍后重试。",
          requestId,
        },
        {
          status: 500,
          headers: {
            "x-request-id": requestId,
            "cache-control": "no-store",
          },
        },
      );
    }
  };
}

export function checkApiRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const windowStartedAt = now - windowMs;
  const entry = apiRateLimits.get(key) ?? { timestamps: [] };
  entry.timestamps = entry.timestamps.filter(
    (timestamp) => timestamp > windowStartedAt,
  );

  if (entry.timestamps.length >= limit) {
    const retryAt = entry.timestamps[0] + windowMs;
    apiRateLimits.set(key, entry);
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now) / 1000)),
    };
  }

  entry.timestamps.push(now);
  apiRateLimits.set(key, entry);

  if (apiRateLimits.size > 2000) {
    for (const [entryKey, candidate] of apiRateLimits.entries()) {
      if (candidate.timestamps.every((timestamp) => timestamp <= windowStartedAt)) {
        apiRateLimits.delete(entryKey);
      }
    }
  }

  return {
    allowed: true as const,
    retryAfterSeconds: 0,
  };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: `操作过于频繁，请在 ${retryAfterSeconds} 秒后重试。`,
    },
    {
      status: 429,
      headers: {
        "retry-after": String(retryAfterSeconds),
      },
    },
  );
}
