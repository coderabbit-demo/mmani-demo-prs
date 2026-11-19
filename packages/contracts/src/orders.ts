/**
 * Orders service contract (services/orders).
 *
 * `GET /orders/:id` is consumed outside this repository by
 * coderabbit-demo/mmani-demo-prs-consumer (fulfillment and finance). Its
 * invariants are part of the contract:
 * - every line is a physical catalog SKU with an integer `quantity >= 1`;
 * - `lineTotalCents = quantity * unitPriceCents`, both non-negative;
 * - `subtotalCents` is the sum of line totals;
 * - `0 <= discountCents <= subtotalCents`; `netCents = subtotalCents - discountCents`.
 */

export type OrderStatus = "cart" | "placed" | "cancelled";

export interface OrderLine {
  sku: string;
  name: string;
  /** Units ordered. The receipt line for an applied discount (`DISCOUNT-<code>`) uses -1. */
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderTotals {
  subtotalCents: number;
  /** Order-level discount, `0..subtotalCents`. */
  discountCents: number;
  netCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  lines: OrderLine[];
  totals: OrderTotals;
  /** Discount code applied to the order, if any. */
  discountCode: string | null;
  placedAt: string | null;
}

export interface ApplyDiscountRequest {
  code: string;
}

export interface AddLineRequest {
  sku: string;
  quantity: number;
}
