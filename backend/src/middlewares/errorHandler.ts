import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  console.error("Unhandled error in request: ", err);

  const isHttp = err instanceof HttpError;

  const status = isHttp ? err.status : 500;
  const message = isHttp ? err.message : "Internal Server Error";

  const details =
    isHttp && err.details && typeof err.details === "object"
      ? (err.details as Record<string, unknown>)
      : undefined;

  const code =
    details && typeof details.code === "string"
      ? details.code
      : "INTERNAL_ERROR";

  const cleanDetails =
    details && "details" in details && typeof details.details === "object"
      ? (details.details as Record<string, unknown>)
      : details && !("code" in details)
        ? details
        : undefined;

  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      ...(cleanDetails ? { details: cleanDetails } : {}),
    },
  });
}
