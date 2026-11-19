// Regression tests for F2 (PR #3): a discount must be deducted exactly once and
// capped at the eligible subtotal, so netCents is never negative. The tests go
// through the public gateway, so they hold for any implementation of the
// discount route and fail on one that double-counts or skips the cap.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, GRACE, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

const PRICES: Record<string, number> = {
  "HOODIE-GRY-L": 6000,
  "MUG-CERAMIC": 1500,
  "BOTTLE-STEEL": 2800,
};

interface Line {
  sku: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

async function cartWith(token: string, lines: Array<[string, number]>) {
  const { body: order } = await stack.call(token, "POST", "/orders");
  for (const [sku, quantity] of lines) {
    await stack.call(token, "PUT", `/orders/${order.id}/lines/${sku}`, { quantity });
  }
  return order.id as string;
}

function applyCode(token: string, orderId: string, code: string) {
  return stack.call(token, "POST", `/orders/${orderId}/discount`, { code });
}

/** Totals must be one deduction from the physical subtotal, within 0..subtotal. */
function assertSingleCappedDeduction(order: { lines: Line[]; totals: Record<string, number> }) {
  for (const line of order.lines) {
    assert.ok(line.sku in PRICES, `line ${line.sku} is not a catalog SKU`);
    assert.ok(line.quantity >= 1, `line ${line.sku} has quantity ${line.quantity}`);
  }
  const physical = order.lines.reduce((sum, line) => sum + line.quantity * PRICES[line.sku], 0);
  const { subtotalCents, discountCents, netCents } = order.totals;
  assert.equal(subtotalCents, physical, "subtotal must be the sum of physical lines, before any discount");
  assert.ok(discountCents >= 0 && discountCents <= subtotalCents, "discount must be within 0..subtotal");
  assert.equal(netCents, subtotalCents - discountCents, "discount must be subtracted exactly once");
  assert.ok(netCents >= 0, "net must never be negative");
}

test("F2 cap: a fixed code larger than the cart nets zero, not a negative total", async () => {
  const orderId = await cartWith(GRACE, [["MUG-CERAMIC", 1]]);
  const { status, body } = await applyCode(GRACE, orderId, "SAVE20");
  assert.equal(status, 200);
  assert.deepEqual(body.totals, { subtotalCents: 1500, discountCents: 1500, netCents: 0 });
  assertSingleCappedDeduction(body);
});

test("F2 cap: the cap still holds after the cart shrinks below the code value", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1], ["MUG-CERAMIC", 1]]);
  const applied = await applyCode(ADA, orderId, "SAVE20");
  assert.deepEqual(applied.body.totals, { subtotalCents: 7500, discountCents: 2000, netCents: 5500 });

  const shrunk = await stack.call(ADA, "DELETE", `/orders/${orderId}/lines/HOODIE-GRY-L`);
  assert.equal(shrunk.status, 200);
  assert.deepEqual(shrunk.body.totals, { subtotalCents: 1500, discountCents: 1500, netCents: 0 });
  assertSingleCappedDeduction(shrunk.body);
});

test("F2 single deduction: a percent code comes off the physical subtotal once", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  const { status, body } = await applyCode(ADA, orderId, "WELCOME10");
  assert.equal(status, 200);
  assert.deepEqual(body.totals, { subtotalCents: 6000, discountCents: 600, netCents: 5400 });
  assertSingleCappedDeduction(body);
});

test("F2 single deduction: the discount is not also stored as an order line", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  await applyCode(ADA, orderId, "WELCOME10");
  const { body } = await stack.call(ADA, "GET", `/orders/${orderId}`);
  assert.deepEqual(
    body.lines.map((line: Line) => [line.sku, line.quantity]),
    [["HOODIE-GRY-L", 1]],
  );
  assertSingleCappedDeduction(body);
});

test("F2 single deduction: re-applying the same code does not deduct it again", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  await applyCode(ADA, orderId, "WELCOME10");
  const { body } = await applyCode(ADA, orderId, "WELCOME10");
  assert.deepEqual(body.totals, { subtotalCents: 6000, discountCents: 600, netCents: 5400 });
  assertSingleCappedDeduction(body);
});

test("F2 handoff: a placed order keeps one capped, non-negative deduction", async () => {
  const orderId = await cartWith(ADA, [["BOTTLE-STEEL", 1]]);
  await applyCode(ADA, orderId, "WELCOME10");
  const placed = await stack.call(ADA, "POST", `/orders/${orderId}/checkout`);
  assert.equal(placed.status, 200);
  const { body } = await stack.call(ADA, "GET", `/orders/${orderId}`);
  assert.equal(body.status, "placed");
  assert.deepEqual(body.totals, { subtotalCents: 2800, discountCents: 280, netCents: 2520 });
  assertSingleCappedDeduction(body);
});
