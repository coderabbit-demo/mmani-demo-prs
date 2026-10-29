import type { DatabaseSync } from "node:sqlite";
import type { Order, OrderLine } from "../../../packages/contracts/src/orders.ts";
import { HttpError } from "../../../packages/service-kit/src/http.ts";
import type { CatalogClient } from "./catalogClient.ts";
import { getOrder } from "./orders.ts";

export type DiscountKind = "percent" | "fixed";

export interface DiscountCode {
  code: string;
  kind: DiscountKind;
  /** Percent (1..100) for percent codes; cents for fixed codes. */
  value: number;
  category: string | null;
  active: boolean;
  expiresAt: string | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
}

interface DiscountCodeRow {
  code: string;
  kind: DiscountKind;
  value: number;
  category: string | null;
  active: number;
  expires_at: string | null;
  max_redemptions: number | null;
  times_redeemed: number;
}

const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

/** Normalize shopper input to the stored upper-case form, or reject it with 400. */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") throw new HttpError(400, "code is required");
  const code = raw.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new HttpError(400, "Invalid discount code");
  return code;
}

/** Look up a discount code by its normalized value. */
export function findDiscountCode(db: DatabaseSync, code: string): DiscountCode | undefined {
  const row = db.prepare("SELECT * FROM discount_codes WHERE code = ?").get(code) as
    | DiscountCodeRow
    | undefined;
  if (!row) return undefined;
  return {
    code: row.code,
    kind: row.kind,
    value: row.value,
    category: row.category,
    active: row.active === 1,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    timesRedeemed: row.times_redeemed,
  };
}

/** Reject codes that cannot be used now: inactive or expired codes get 422. */
export function assertUsable(code: DiscountCode, now: Date = new Date()): void {
  if (!code.active || (code.expiresAt !== null && new Date(code.expiresAt) <= now)) {
    throw new HttpError(422, "Discount code is not active");
  }
}

/**
 * Discount for an order's lines, in integer cents. Only eligible lines count
 * (all lines unless the code is category-restricted), and the result never
 * exceeds the eligible subtotal, so the net total cannot go negative.
 */
export function discountCentsFor(code: DiscountCode, lines: OrderLine[], eligibleSkus?: Set<string>): number {
  const eligibleCents = lines
    .filter((line) => !eligibleSkus || eligibleSkus.has(line.sku))
    .reduce((sum, line) => sum + line.lineTotalCents, 0);
  const amount = code.kind === "percent" ? Math.round((eligibleCents * code.value) / 100) : code.value;
  return Math.min(amount, eligibleCents);
}

async function eligibleSkus(code: DiscountCode, catalog: CatalogClient): Promise<Set<string> | undefined> {
  return code.category ? catalog.skusInCategory(code.category) : undefined;
}

/** Undo the redemption held by an order, e.g. when its code is replaced. */
function releaseRedemption(db: DatabaseSync, orderId: string, code: string): void {
  const { changes } = db.prepare("DELETE FROM discount_redemptions WHERE order_id = ?").run(orderId);
  if (changes === 1) {
    db.prepare(
      "UPDATE discount_codes SET times_redeemed = times_redeemed - 1 WHERE code = ? AND times_redeemed > 0",
    ).run(code);
  }
}

/**
 * Apply a code to a cart and return the updated order.
 *
 * - Re-applying the code already on the order is a no-op.
 * - A different code replaces the current one and releases its redemption.
 * - Fixed-amount codes can be redeemed once per order, so a shopper who
 *   abandons a cart can use the code again on a new one.
 * - The redemption is reserved with a conditional increment in the same
 *   transaction as the order update, so `max_redemptions` holds under
 *   concurrency and a failure leaves nothing behind.
 */
export async function applyDiscountCode(
  db: DatabaseSync,
  order: Order,
  rawCode: unknown,
  catalog: CatalogClient,
): Promise<Order> {
  const code = findDiscountCode(db, normalizeCode(rawCode));
  if (!code) throw new HttpError(404, "Unknown discount code");
  assertUsable(code);
  if (order.status !== "cart") throw new HttpError(409, "Order is no longer editable");
  if (order.discountCode === code.code) return order;

  const amountCents = discountCentsFor(code, order.lines, await eligibleSkus(code, catalog));

  db.exec("BEGIN IMMEDIATE");
  try {
    if (order.discountCode) releaseRedemption(db, order.id, order.discountCode);

    if (code.kind === "fixed") {
      const used = db
        .prepare("SELECT 1 FROM discount_redemptions WHERE code = ? AND order_id = ?")
        .get(code.code, order.id);
      if (used) throw new HttpError(409, "This code is already applied to this order");
    }

    const reserved = db
      .prepare(
        `UPDATE discount_codes SET times_redeemed = times_redeemed + 1
         WHERE code = ? AND (max_redemptions IS NULL OR times_redeemed < max_redemptions)`,
      )
      .run(code.code);
    if (reserved.changes !== 1) throw new HttpError(409, "Discount code has been fully redeemed");

    db.prepare(
      "INSERT INTO discount_redemptions (order_id, code, customer_id, redeemed_at) VALUES (?, ?, ?, ?)",
    ).run(order.id, code.code, order.customerId, new Date().toISOString());

    const updated = db
      .prepare("UPDATE orders SET discount_code = ?, discount_cents = ? WHERE id = ? AND status = 'cart'")
      .run(code.code, amountCents, order.id);
    if (updated.changes !== 1) throw new HttpError(409, "Order is no longer editable");

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getOrder(db, order.id)!;
}

/**
 * Re-price the discount after a cart's lines change. The redemption itself is
 * unchanged; only the amount follows the new eligible subtotal.
 */
export async function recalculateDiscount(
  db: DatabaseSync,
  orderId: string,
  catalog: CatalogClient,
): Promise<void> {
  const order = getOrder(db, orderId);
  if (!order?.discountCode) return;
  const code = findDiscountCode(db, order.discountCode);
  if (!code) return;
  const amountCents = discountCentsFor(code, order.lines, await eligibleSkus(code, catalog));
  db.prepare("UPDATE orders SET discount_cents = ? WHERE id = ? AND status = 'cart'").run(amountCents, orderId);
}
