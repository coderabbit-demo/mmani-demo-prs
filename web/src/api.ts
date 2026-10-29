import type { Product } from "../../packages/contracts/src/catalog.ts";
import type { Order } from "../../packages/contracts/src/orders.ts";

export interface Shopper {
  token: string;
  name: string;
}

export class ApiError extends Error {}

async function request<T>(token: string | null, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  shoppers: () => request<Shopper[]>(null, "/shoppers"),
  products: (token: string) => request<Product[]>(token, "/products"),
  createOrder: (token: string) => request<Order>(token, "/orders", { method: "POST" }),
  setLine: (token: string, orderId: string, sku: string, quantity: number) =>
    request<Order>(token, `/orders/${orderId}/lines/${sku}`, {
      method: "PUT",
      body: JSON.stringify({ quantity }),
    }),
  removeLine: (token: string, orderId: string, sku: string) =>
    request<Order>(token, `/orders/${orderId}/lines/${sku}`, { method: "DELETE" }),
  applyDiscount: (token: string, orderId: string, code: string) =>
    request<Order>(token, `/orders/${orderId}/discount`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  checkout: (token: string, orderId: string) =>
    request<Order>(token, `/orders/${orderId}/checkout`, { method: "POST" }),
};

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
