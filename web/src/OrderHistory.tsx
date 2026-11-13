import type { OrderSummary } from "../../packages/contracts/src/orders.ts";
import { formatCents } from "./api.ts";

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
