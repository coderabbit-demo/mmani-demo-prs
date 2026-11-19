/**
 * Public API surface. Each route maps a public path to the backend service that
 * owns it. Anything not listed here is not reachable from the browser.
 */
export type Upstream = "catalog" | "orders";

export interface Route {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Express path pattern under /api. */
  path: string;
  upstream: Upstream;
  /** Path on the upstream service; `:params` are copied from the public path. */
  target: string;
}

export const ROUTES: Route[] = [
  { method: "GET", path: "/products", upstream: "catalog", target: "/products" },
  { method: "GET", path: "/products/:sku", upstream: "catalog", target: "/products/:sku" },
  { method: "POST", path: "/orders", upstream: "orders", target: "/orders" },
  { method: "GET", path: "/orders", upstream: "orders", target: "/orders" },
  { method: "GET", path: "/orders/:orderId", upstream: "orders", target: "/orders/:orderId" },
  { method: "PUT", path: "/orders/:orderId/lines/:sku", upstream: "orders", target: "/orders/:orderId/lines/:sku" },
  { method: "DELETE", path: "/orders/:orderId/lines/:sku", upstream: "orders", target: "/orders/:orderId/lines/:sku" },
  { method: "POST", path: "/orders/:orderId/discount", upstream: "orders", target: "/orders/:orderId/discount" },
  { method: "POST", path: "/orders/:orderId/checkout", upstream: "orders", target: "/orders/:orderId/checkout" },
];
