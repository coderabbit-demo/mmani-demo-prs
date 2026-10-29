# Rabbit Outfitters — microservices e-commerce demo

A small storefront built as independent services. It is the base application for the
CodeRabbit PR examples in this repository: each demo PR is an ordinary feature change made on
top of this `main` branch.

```
browser ──▶ gateway :8080 ──▶ catalog :4001   (products, stock)       catalog.db
  (React)     /api/*      └──▶ orders  :4002   (carts, pricing, checkout) orders.db
                                   │
                                   └── order.placed ──▶ fulfillment & finance
                                                        (coderabbit-demo/mmani-demo-prs-consumer)
```

| Path | What it is |
| --- | --- |
| `services/gateway` | Public API. Authenticates the shopper and forwards allow-listed routes. |
| `services/catalog` | Products and stock; atomic stock reservations. |
| `services/orders` | Carts, pricing, checkout; notifies fulfillment when an order is placed. |
| `packages/contracts` | Shared request/response types. `orders.ts` is consumed by another repo. |
| `packages/service-kit` | Error handling, input validation, internal service authentication. |
| `web` | React storefront. |

Each service owns its own SQLite database (Node's built-in `node:sqlite`) and talks to the
others only over HTTP.

## Run it

Requires Node 24+ (TypeScript runs directly via type stripping).

```bash
npm install
npm run dev          # services + Vite on http://localhost:5173
npm start            # build the storefront, serve everything on http://localhost:8080
docker compose up    # same stack in containers on http://localhost:8080
```

Pick a demo shopper (Ada or Grace) in the header. Data is synthetic and resets on restart
unless `CATALOG_DB` / `ORDERS_DB` point to files.

## Check it

```bash
npm run check        # tsc + integration tests (in-memory stack on ephemeral ports)
```

## Engineering rules

- [`AGENTS.md`](AGENTS.md) — instructions for humans and coding agents working here.
- [`docs/architecture.md`](docs/architecture.md) — service boundaries and the order contract.
- Org standards in [`coderabbit-standards`](https://github.com/coderabbit-demo/coderabbit-standards),
  including the opt-in `commerce/` rules for orders and discounts.

> Demo application. Do not deploy it publicly; the demo sign-in is not real authentication.
