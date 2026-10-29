import type { OrderSummary } from "../../packages/contracts/src/orders.ts";
import { formatCents } from "./api.ts";

/**
 * Render summaries in the supplied order, or an empty-history message.
 * Show placement dates in the browser's locale, using a dash for missing dates,
 * alongside net totals in USD, unit counts and order IDs.
 */
export function OrderHistory({ orders }: { orders: OrderSummary[] }) {
  return (
    <section className="history" aria-label="Order history">
      <h2>Order history</h2>
      {orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : (
        <ol>
          {orders.map((order) => (
            <li key={order.id}>
              <span>{order.placedAt ? new Date(order.placedAt).toLocaleDateString() : "—"}</span>
              <span className="amount">{formatCents(order.netCents)}</span>
              <span className="muted">
                {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · {order.id}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
