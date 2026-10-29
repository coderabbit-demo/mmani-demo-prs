import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  Order,
  OrderLine,
  OrderStatus,
  OrderSummary,
} from "../../../packages/contracts/src/orders.ts";
import { HttpError } from "../../../packages/service-kit/src/http.ts";
import { computeTotals, lineTotalCents } from "./pricing.ts";

interface OrderRow {
  id: string;
  customer_id: string;
  status: OrderStatus;
  discount_code: string | null;
  discount_cents: number;
  placed_at: string | null;
}

interface LineRow {
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

export function newOrderId(): string {
  return `ord_${randomBytes(9).toString("base64url").replace(/[-_]/g, "x")}`;
}

export function createOrder(db: DatabaseSync, customerId: string): Order {
  const id = newOrderId();
  db.prepare("INSERT INTO orders (id, customer_id, created_at) VALUES (?, ?, ?)").run(
    id,
    customerId,
    new Date().toISOString(),
  );
  return getOrder(db, id)!;
}

export function getOrder(db: DatabaseSync, id: string): Order | undefined {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as OrderRow | undefined;
  if (!row) return undefined;
  const lineRows = db
    .prepare("SELECT sku, name, quantity, unit_price_cents FROM order_lines WHERE order_id = ? ORDER BY sku")
    .all(id) as unknown as LineRow[];
  const lines: OrderLine[] = lineRows.map((line) => ({
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    unitPriceCents: line.unit_price_cents,
    lineTotalCents: lineTotalCents(line.quantity, line.unit_price_cents),
  }));
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    lines,
    totals: computeTotals(lines, row.discount_cents),
    discountCode: row.discount_code,
    placedAt: row.placed_at,
  };
}

/** Load an order the caller may act on, or fail with 404 (never reveal other customers' orders). */
export function getOwnedOrder(db: DatabaseSync, id: string, customerId: string): Order {
  const order = getOrder(db, id);
  if (!order || order.customerId !== customerId) throw new HttpError(404, "Order not found");
  return order;
}

export function assertCart(order: Order): void {
  if (order.status !== "cart") throw new HttpError(409, "Order is no longer editable");
}

/** Set the quantity of a SKU in a cart, inserting or replacing the line. */
export function setLine(
  db: DatabaseSync,
  orderId: string,
  line: { sku: string; name: string; quantity: number; unitPriceCents: number },
): void {
  db.prepare(
    `INSERT INTO order_lines (order_id, sku, name, quantity, unit_price_cents)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (order_id, sku) DO UPDATE SET quantity = excluded.quantity,
       unit_price_cents = excluded.unit_price_cents, name = excluded.name`,
  ).run(orderId, line.sku, line.name, line.quantity, line.unitPriceCents);
}

export function removeLine(db: DatabaseSync, orderId: string, sku: string): void {
  db.prepare("DELETE FROM order_lines WHERE order_id = ? AND sku = ?").run(orderId, sku);
}

export function markPlaced(db: DatabaseSync, orderId: string): void {
  db.prepare("UPDATE orders SET status = 'placed', placed_at = ? WHERE id = ? AND status = 'cart'").run(
    new Date().toISOString(),
    orderId,
  );
}

/**
 * Return this customer's orders with the requested status, newest first by
 * placement date, falling back to creation date for orders without one.
 * Each summary counts total units across lines and reports the net total in
 * cents after the stored order discount. Returns an empty array if none match.
 * Database errors propagate to the caller.
 */
export function listOrders(db: DatabaseSync, customerId: string, status: OrderStatus): OrderSummary[] {
  const ids = db
    .prepare("SELECT id FROM orders WHERE customer_id = ? AND status = ? ORDER BY COALESCE(placed_at, created_at) DESC")
    .all(customerId, status) as Array<{ id: string }>;
  return ids.map(({ id }) => {
    const order = getOrder(db, id)!;
    return {
      id: order.id,
      placedAt: order.placedAt,
      itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      netCents: order.totals.netCents,
    };
  });
}
