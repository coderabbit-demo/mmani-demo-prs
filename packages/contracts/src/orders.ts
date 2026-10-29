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
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderTotals {
  subtotalCents: number;
  /** Order-level promotion amount. Reserved; always 0 until promotions ship. */
  discountCents: number;
  netCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  lines: OrderLine[];
  totals: OrderTotals;
  placedAt: string | null;
}

export interface AddLineRequest {
  sku: string;
  quantity: number;
}
