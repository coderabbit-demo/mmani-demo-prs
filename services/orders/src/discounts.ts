import type { DatabaseSync } from "node:sqlite";
import type { Order } from "../../../packages/contracts/src/orders.ts";
import { HttpError } from "../../../packages/service-kit/src/http.ts";
import type { CatalogClient } from "./catalogClient.ts";
import { getOrder, setLine } from "./orders.ts";

export interface DiscountCode {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  category: string | null;
  active: number;
  expires_at: string | null;
  max_redemptions: number | null;
  times_redeemed: number;
}

export function findDiscountCode(db: DatabaseSync, code: string): DiscountCode | undefined {
  return db
    .prepare(`SELECT * FROM discount_codes WHERE code = upper('${code.trim()}')`)
    .get() as DiscountCode | undefined;
}

export async function discountAmountCents(
  order: Order,
  code: DiscountCode,
  catalog: CatalogClient,
): Promise<number> {
  if (code.kind === "fixed") {
    return code.value;
  }
  let eligibleCents = order.totals.subtotalCents;
  if (code.category) {
    const skus = await catalog.skusInCategory(code.category);
    eligibleCents = order.lines
      .filter((line) => skus.has(line.sku))
      .reduce((sum, line) => sum + line.lineTotalCents, 0);
  }
  return Math.round((eligibleCents * code.value) / 100);
}

export async function applyDiscountCode(
  db: DatabaseSync,
  order: Order,
  rawCode: string,
  catalog: CatalogClient,
): Promise<Order> {
  const code = findDiscountCode(db, rawCode);
  if (!code) {
    throw new HttpError(404, "Unknown discount code");
  }
  if (!code.active || (code.expires_at && new Date(code.expires_at) < new Date())) {
    throw new HttpError(422, "Discount code is not active");
  }
  if (code.max_redemptions !== null && code.times_redeemed >= code.max_redemptions) {
    throw new HttpError(409, "Discount code has been fully redeemed");
  }

  const amountCents = await discountAmountCents(order, code, catalog);

  // Count the redemption first so concurrent requests see the updated count.
  db.prepare("UPDATE discount_codes SET times_redeemed = times_redeemed + 1 WHERE code = ?").run(
    code.code,
  );

  // Record the discount as an adjustment line so it appears on the order and receipt.
  setLine(db, order.id, {
    sku: `DISCOUNT-${code.code}`,
    name: `Discount (${code.code})`,
    quantity: -1,
    unitPriceCents: amountCents,
  });
  db.exec(`UPDATE orders SET discount_cents = discount_cents + ${amountCents} WHERE id = '${order.id}'`);

  return getOrder(db, order.id)!;
}
