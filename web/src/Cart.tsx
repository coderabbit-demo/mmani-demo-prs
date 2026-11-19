import { useState } from "react";
import type { Order } from "../../packages/contracts/src/orders.ts";
import { formatCents } from "./api.ts";

interface CartProps {
  order: Order | null;
  busy: boolean;
  onQuantity(sku: string, quantity: number): void;
  onRemove(sku: string): void;
  onCheckout(): void;
  onApplyCode(code: string): void;
}

export function Cart({ order, busy, onQuantity, onRemove, onCheckout, onApplyCode }: CartProps) {
  const [code, setCode] = useState("");
  if (!order || order.lines.length === 0) {
    return (
      <aside className="cart" aria-label="Cart">
        <h2>Cart</h2>
        <p className="muted">{order?.status === "placed" ? "Order placed. Thank you!" : "Your cart is empty."}</p>
      </aside>
    );
  }
  const editable = order.status === "cart";
  return (
    <aside className="cart" aria-label="Cart">
      <h2>{editable ? "Cart" : "Order placed"}</h2>
      <ul className="lines">
        {order.lines.filter((line) => line.quantity > 0).map((line) => (
          <li key={line.sku}>
            <span className="line-name">{line.name}</span>
            {editable ? (
              <input
                aria-label={`Quantity of ${line.name}`}
                type="number"
                min={1}
                max={99}
                value={line.quantity}
                disabled={busy}
                onChange={(e) => onQuantity(line.sku, Number(e.target.value))}
              />
            ) : (
              <span>× {line.quantity}</span>
            )}
            <span className="amount">{formatCents(line.lineTotalCents)}</span>
            {editable && (
              <button className="link" disabled={busy} onClick={() => onRemove(line.sku)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <dl className="totals">
        <dt>Subtotal</dt>
        <dd>{formatCents(order.totals.subtotalCents)}</dd>
        {order.totals.discountCents > 0 && (
          <>
            <dt>Discount{order.discountCode ? ` (${order.discountCode})` : ""}</dt>
            <dd>−{formatCents(order.totals.discountCents)}</dd>
          </>
        )}
        <dt className="net">Total</dt>
        <dd className="net">{formatCents(order.totals.netCents)}</dd>
      </dl>
      {editable && (
        <form
          className="code"
          onSubmit={(e) => {
            e.preventDefault();
            onApplyCode(code);
          }}
        >
          <input
            aria-label="Discount code"
            placeholder="Discount code"
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value)}
          />
          <button disabled={busy || code.trim() === ""}>Apply</button>
        </form>
      )}
      {editable && (
        <button className="primary" disabled={busy} onClick={onCheckout}>
          Place order
        </button>
      )}
    </aside>
  );
}
