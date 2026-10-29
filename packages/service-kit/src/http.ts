import type { NextFunction, Request, Response } from "express";

/** An error with an HTTP status that is safe to show to the caller. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Express error handler shared by every service. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

const ID_PATTERN = /^[a-z]{3}_[A-Za-z0-9]{6,32}$/;
const SKU_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return value;
}

export function requireSku(value: unknown): string {
  if (typeof value !== "string" || !SKU_PATTERN.test(value)) {
    throw new HttpError(400, "Invalid sku");
  }
  return value;
}

export function requireQuantity(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 99) {
    throw new HttpError(400, "Quantity must be an integer between 1 and 99");
  }
  return value as number;
}
