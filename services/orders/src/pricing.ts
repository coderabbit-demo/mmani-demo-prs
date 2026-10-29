import type { OrderLine, OrderTotals } from "../../../packages/contracts/src/orders.ts";

/** Line total in integer cents. */
export function lineTotalCents(quantity: number, unitPriceCents: number): number {
  return quantity * unitPriceCents;
}

/**
 * Order totals. The subtotal is the sum of line totals; the discount is an
 * order-level amount subtracted once to give the net.
 */
export function computeTotals(lines: OrderLine[], discountCents: number): OrderTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return {
    subtotalCents,
    discountCents,
    netCents: subtotalCents - discountCents,
  };
}
