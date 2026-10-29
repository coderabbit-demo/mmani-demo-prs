import express from "express";
import type { DatabaseSync } from "node:sqlite";
import {
  HttpError,
  errorHandler,
  requireId,
  requireQuantity,
  requireSku,
} from "../../../packages/service-kit/src/http.ts";
import {
  callerOf,
  internalAuth,
  type InternalAuthOptions,
} from "../../../packages/service-kit/src/internalAuth.ts";
import type { CatalogClient } from "./catalogClient.ts";
import { applyDiscountCode } from "./discounts.ts";
import { notifyOrderPlaced } from "./fulfillment.ts";
import {
  assertCart,
  createOrder,
  getOrder,
  getOwnedOrder,
  markPlaced,
  removeLine,
  setLine,
} from "./orders.ts";

export interface OrdersAppDeps {
  db: DatabaseSync;
  catalog: CatalogClient;
  auth: InternalAuthOptions;
  fulfillmentUrl?: string;
}

export function createOrdersApp({ db, catalog, auth, fulfillmentUrl }: OrdersAppDeps) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "orders" });
  });

  app.use(internalAuth(auth));

  /** Customers act on their own orders; trusted services may only read. */
  function customerId(res: express.Response): string {
    const caller = callerOf(res);
    if (caller.kind !== "customer") throw new HttpError(403, "Customers only");
    return caller.customerId;
  }

  app.post("/orders", (_req, res) => {
    res.status(201).json(createOrder(db, customerId(res)));
  });

  app.get("/orders/:orderId", (req, res) => {
    const orderId = requireId(req.params.orderId, "order id");
    const caller = callerOf(res);
    const order =
      caller.kind === "service" ? getOrder(db, orderId) : getOwnedOrder(db, orderId, caller.customerId);
    if (!order) throw new HttpError(404, "Order not found");
    res.json(order);
  });

  app.put("/orders/:orderId/lines/:sku", async (req, res) => {
    const order = getOwnedOrder(db, requireId(req.params.orderId, "order id"), customerId(res));
    assertCart(order);
    const sku = requireSku(req.params.sku);
    const quantity = requireQuantity(req.body?.quantity);
    const product = await catalog.getProduct(sku);
    if (!product) throw new HttpError(404, "Product not found");
    setLine(db, order.id, { sku, name: product.name, quantity, unitPriceCents: product.priceCents });
    res.json(getOrder(db, order.id));
  });

  app.delete("/orders/:orderId/lines/:sku", (req, res) => {
    const order = getOwnedOrder(db, requireId(req.params.orderId, "order id"), customerId(res));
    assertCart(order);
    removeLine(db, order.id, requireSku(req.params.sku));
    res.json(getOrder(db, order.id));
  });

  app.post("/orders/:orderId/discount", async (req, res) => {
    const order = getOwnedOrder(db, requireId(req.params.orderId, "order id"), customerId(res));
    const code = req.body?.code;
    if (typeof code !== "string" || code.trim() === "") throw new HttpError(400, "code is required");
    res.json(await applyDiscountCode(db, order, code, catalog));
  });

  app.post("/orders/:orderId/checkout", async (req, res) => {
    const order = getOwnedOrder(db, requireId(req.params.orderId, "order id"), customerId(res));
    assertCart(order);
    if (order.lines.length === 0) throw new HttpError(422, "Cart is empty");
    // Discount adjustment lines are not physical stock.
    const stockLines = order.lines.filter((line) => line.quantity > 0);
    await catalog.reserve(stockLines.map(({ sku, quantity }) => ({ sku, quantity })));
    markPlaced(db, order.id);
    await notifyOrderPlaced(fulfillmentUrl, order.id);
    res.json(getOrder(db, order.id));
  });

  app.use(errorHandler);
  return app;
}
