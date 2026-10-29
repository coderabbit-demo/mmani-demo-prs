import express from "express";
import type { DatabaseSync } from "node:sqlite";
import type { ReservationLine } from "../../../packages/contracts/src/catalog.ts";
import {
  HttpError,
  errorHandler,
  requireQuantity,
  requireSku,
} from "../../../packages/service-kit/src/http.ts";
import { internalAuth, type InternalAuthOptions } from "../../../packages/service-kit/src/internalAuth.ts";
import { getProduct, listProducts, reserveStock } from "./products.ts";

export function createCatalogApp(db: DatabaseSync, auth: InternalAuthOptions) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "catalog" });
  });

  app.use(internalAuth(auth));

  app.get("/products", (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
    res.json(listProducts(db, category, sort));
  });

  app.get("/products/:sku", (req, res) => {
    const product = getProduct(db, requireSku(req.params.sku));
    if (!product) throw new HttpError(404, "Product not found");
    res.json(product);
  });

  app.post("/reservations", (req, res) => {
    const raw = req.body?.lines;
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new HttpError(400, "lines must be a non-empty array");
    }
    const lines: ReservationLine[] = raw.map((line: { sku?: unknown; quantity?: unknown }) => ({
      sku: requireSku(line?.sku),
      quantity: requireQuantity(line?.quantity),
    }));
    for (const line of lines) {
      if (!getProduct(db, line.sku)) throw new HttpError(404, `Unknown sku ${line.sku}`);
    }
    reserveStock(db, lines);
    res.status(201).json({ reserved: lines });
  });

  app.use(errorHandler);
  return app;
}
