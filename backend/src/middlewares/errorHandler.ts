import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../utils/httpError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const isHttp = err instanceof HttpError;

  const status = isHttp ? err.status : 500;
  const message = isHttp ? err.message : "Internal Server Error";

  // Keeping error payload consistent for frontend
  res.status(status).json({
    ok: false,
    error: {
      message,
      ...(isHttp && err.details ? { details: err.details } : {}),
    },
  });
}
