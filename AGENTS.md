# Working in this repository

Instructions for anyone — human or coding agent — changing this code.

## Before you start

- Read `docs/architecture.md` and the org commerce standards
  (`coderabbit-demo/coderabbit-standards`, `commerce/*.md`). They are enforced in review.
- Keep changes inside the issue's scope. Do not refactor or add features you were not asked for.

## Service rules

- A service reads and writes only its own database. Cross-service data goes over HTTP via a
  client with a bounded timeout (see `services/orders/src/catalogClient.ts`).
- Every SQL value is a bound parameter. No template literals or concatenation in SQL.
- Validate input at the route boundary with `packages/service-kit/src/http.ts` helpers.
- Multi-row or multi-table writes run in one transaction.
- New public routes must be added to `services/gateway/src/routes.ts`; nothing else is exposed.

## The order contract

`packages/contracts/src/orders.ts` is consumed by `coderabbit-demo/mmani-demo-prs-consumer`
(fulfillment and finance). Preserve its invariants: order lines are physical SKUs with
`quantity >= 1`; discounts are order-level (`discountCents`); `netCents` is never negative. Do
not weaken database `CHECK` constraints.

## Definition of done

- `npm run check` passes, with tests that assert the intended behavior (not whatever the code
  currently returns).
- Exported functions have a doc comment.
- The PR links its issue (`Closes #N`) and explains any deviation from it.
