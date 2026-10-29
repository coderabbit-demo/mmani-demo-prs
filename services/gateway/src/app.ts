import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { errorHandler, HttpError } from "../../../packages/service-kit/src/http.ts";
import { ROUTES, type Route, type Upstream } from "./routes.ts";
import { customerForToken, DEMO_SHOPPERS } from "./sessions.ts";

export interface GatewayOptions {
  upstreams: Record<Upstream, string>;
  gatewayToken: string;
  /** Built storefront to serve, if present. */
  webDist?: string;
  timeoutMs?: number;
}

function targetPath(route: Route, params: Record<string, string>): string {
  return route.target.replace(/:(\w+)/g, (_m, name: string) => encodeURIComponent(params[name] ?? ""));
}

export function createGateway(options: GatewayOptions) {
  const app = express();
  const timeoutMs = options.timeoutMs ?? 5000;
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "gateway" });
  });

  app.get("/api/shoppers", (_req, res) => {
    res.json(DEMO_SHOPPERS.map(({ token, name }) => ({ token, name })));
  });

  const api = express.Router();
  for (const route of ROUTES) {
    const method = route.method.toLowerCase() as "get" | "post" | "put" | "delete";
    api[method](route.path, async (req: Request, res: Response) => {
      const customerId = customerForToken(req.header("authorization"));
      if (!customerId) throw new HttpError(401, "Sign in required");

      const query = new URL(req.originalUrl, "http://gateway").search;
      const url = `${options.upstreams[route.upstream]}${targetPath(route, req.params as Record<string, string>)}${query}`;
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(url, {
          method: route.method,
          headers: {
            "content-type": "application/json",
            "x-gateway-token": options.gatewayToken,
            "x-customer-id": customerId,
          },
          body: route.method === "GET" || route.method === "DELETE" ? undefined : JSON.stringify(req.body ?? {}),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new HttpError(503, `${route.upstream} service unavailable`);
      }
      res.status(upstream.status).type("application/json").send(await upstream.text());
    });
  }
  app.use("/api", api);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  if (options.webDist && existsSync(options.webDist)) {
    app.use(express.static(options.webDist));
    app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: options.webDist }));
  }

  app.use(errorHandler);
  return app;
}
