# Architecture

## Services

| Service | Owns | Exposes (internal) |
| --- | --- | --- |
| gateway | shopper sessions | `/api/*` allow-list in `services/gateway/src/routes.ts` |
| catalog | `products` (price, stock) | `GET /products`, `GET /products/:sku`, `POST /reservations` |
| orders | `orders`, `order_lines` | `POST /orders`, `GET /orders/:id`, `PUT/DELETE /orders/:id/lines/:sku`, `POST /orders/:id/checkout` |

Backend services accept requests only from the gateway (`x-gateway-token` + `x-customer-id`)
or from trusted services (`x-service-token`, read-only).

## Checkout sequence

1. Storefront → gateway `POST /api/orders/:id/checkout`.
2. Gateway authenticates the shopper → orders service.
3. Orders → catalog `POST /reservations` (all lines reserved atomically, or none).
4. Orders marks the order `placed` and sends `order.placed` to fulfillment.
5. Fulfillment (`mmani-demo-prs-consumer`) → orders `GET /orders/:id`, builds a pick list from
   `lines`, and posts a journal from `totals`.

## Order invariants

- `order_lines.quantity > 0` and `unit_price_cents >= 0` are enforced by `CHECK` constraints.
- `orders.discount_cents` is the single, order-level promotion amount (`>= 0`), reserved for
  discount codes.
- Totals are derived in `services/orders/src/pricing.ts`: `subtotal = Σ line totals`,
  `net = subtotal − discount`.
