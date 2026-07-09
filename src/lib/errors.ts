import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

/** Matches the error shape in BACKEND-API-SPEC.md §3 exactly. */
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(what: string) {
  return new ApiError(404, `${what.toUpperCase()}_NOT_FOUND`, `No ${what} found with that id.`);
}

export function badRequest(code: string, message: string) {
  return new ApiError(400, code, message);
}

export function unauthorized(message = "Missing or invalid credentials.") {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Not allowed to access this resource.") {
  return new ApiError(403, "FORBIDDEN", message);
}

// Express error-handling middleware. Must be mounted last, after all routes.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId ?? `req_${randomUUID()}`;

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId },
    });
    return;
  }

  // Zod validation errors
  if (err && typeof err === "object" && "issues" in (err as any)) {
    const zerr = err as any;
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: zerr.issues?.[0]?.message ?? "Invalid request body.",
        requestId,
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId },
  });
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction) {
  (req as any).requestId = `req_${randomUUID()}`;
  next();
}
