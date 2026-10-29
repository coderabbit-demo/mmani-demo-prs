import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.ts";

/** Who is calling a backend service, as established by the gateway or a service token. */
export type Caller = { kind: "customer"; customerId: string } | { kind: "service" };

export interface InternalAuthOptions {
  /** Shared secret the gateway sends on every forwarded request. */
  gatewayToken: string;
  /** Read-only token for trusted services such as fulfillment. */
  serviceToken: string;
}

function matches(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Backend services are not exposed publicly. Requests must come from the
 * gateway (which authenticates the customer and forwards `x-customer-id`) or
 * from a trusted service presenting the service token.
 */
export function internalAuth(options: InternalAuthOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (matches(options.gatewayToken, req.header("x-gateway-token"))) {
      const customerId = req.header("x-customer-id");
      if (!customerId) return next(new HttpError(401, "Missing customer"));
      res.locals.caller = { kind: "customer", customerId } satisfies Caller;
      return next();
    }
    if (matches(options.serviceToken, req.header("x-service-token"))) {
      res.locals.caller = { kind: "service" } satisfies Caller;
      return next();
    }
    next(new HttpError(401, "Unauthenticated"));
  };
}

export function callerOf(res: Response): Caller {
  return res.locals.caller as Caller;
}
