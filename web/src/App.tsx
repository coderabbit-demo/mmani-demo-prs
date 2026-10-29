import { useEffect, useState } from "react";
import type { Product } from "../../packages/contracts/src/catalog.ts";
import type { Order, OrderSummary } from "../../packages/contracts/src/orders.ts";
import { api, formatCents, type Shopper } from "./api.ts";
import { Cart } from "./Cart.tsx";
import { OrderHistory } from "./OrderHistory.tsx";

/**
 * Render the storefront, cart and order history for the selected demo shopper.
 * Load products and placed-order history when the shopper changes and refresh
 * both after checkout. Display request failures in the storefront's error banner.
 */
export function App() {
  const [shoppers, setShoppers] = useState<Shopper[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<OrderSummary[]>([]);

  useEffect(() => {
    api.shoppers().then((list) => {
      setShoppers(list);
      setToken(list[0]?.token ?? null);
    }, (err) => setError(String(err.message)));
  }, []);

  useEffect(() => {
    if (!token) return;
    setOrder(null);
    api.products(token).then(setProducts, (err) => setError(String(err.message)));
    api.orderHistory(token).then(setHistory, (err) => setError(String(err.message)));
  }, [token]);

  async function run(action: () => Promise<Order>) {
    setBusy(true);
    setError(null);
    try {
      setOrder(await action());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cartId(): Promise<string> {
    if (order && order.status === "cart") return order.id;
    const created = await api.createOrder(token!);
    setOrder(created);
    return created.id;
  }

  function addToCart(product: Product) {
    const current = order?.status === "cart" ? order.lines.find((l) => l.sku === product.sku) : undefined;
    void run(async () => api.setLine(token!, await cartId(), product.sku, (current?.quantity ?? 0) + 1));
  }

  return (
    <div className="shell">
      <header>
        <h1>Rabbit Outfitters</h1>
        <label>
          Shopping as{" "}
          <select value={token ?? ""} onChange={(e) => setToken(e.target.value)}>
            {shoppers.map((s) => (
              <option key={s.token} value={s.token}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <main>
        <section className="products" aria-label="Products">
          {products.map((product) => (
            <article key={product.sku} className="product">
              <h3>{product.name}</h3>
              <p className="muted">{product.category}</p>
              <p className="price">{formatCents(product.priceCents)}</p>
              <p className="muted">{product.stock} in stock</p>
              <button disabled={busy || product.stock === 0} onClick={() => addToCart(product)}>
                Add to cart
              </button>
            </article>
          ))}
        </section>
        <div className="side">
          <Cart
            order={order}
            busy={busy}
            onQuantity={(sku, quantity) =>
              quantity >= 1 && void run(() => api.setLine(token!, order!.id, sku, quantity))
            }
            onRemove={(sku) => void run(() => api.removeLine(token!, order!.id, sku))}
            onApplyCode={(code) => void run(() => api.applyDiscount(token!, order!.id, code))}
            onCheckout={() =>
              void run(async () => {
                const placed = await api.checkout(token!, order!.id);
                setProducts(await api.products(token!));
                setHistory(await api.orderHistory(token!));
                return placed;
              })
            }
          />
          <OrderHistory orders={history} />
        </div>
      </main>
    </div>
  );
}
