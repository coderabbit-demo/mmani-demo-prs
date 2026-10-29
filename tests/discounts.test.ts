import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, GRACE, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

async function cartWith(token: string, lines: Array<[string, number]>) {
  const { body: order } = await stack.call(token, "POST", "/orders");
  for (const [sku, quantity] of lines) {
    await stack.call(token, "PUT", `/orders/${order.id}/lines/${sku}`, { quantity });
  }
  return order.id as string;
}

function applyCode(token: string, orderId: string, code: unknown) {
  return stack.call(token, "POST", `/orders/${orderId}/discount`, { code });
}

function redemptions(code: string): number {
  const row = stack.ordersDb.prepare("SELECT times_redeemed AS n FROM discount_codes WHERE code = ?").get(code);
  return (row as { n: number }).n;
}

test("percent code is subtracted once from the line subtotal", async () => {
  const orderId = await cartWith(ADA, [["TSHIRT-BLK-M", 2], ["MUG-CERAMIC", 1]]);
  const { status, body } = await applyCode(ADA, orderId, "welcome10");
  assert.equal(status, 200);
  assert.deepEqual(body.totals, { subtotalCents: 6500, discountCents: 650, netCents: 5850 });
  assert.equal(body.discountCode, "WELCOME10");
});

test("fixed code is capped at the subtotal so the net is never negative", async () => {
  const orderId = await cartWith(ADA, [["MUG-CERAMIC", 1]]);
  const { body } = await applyCode(ADA, orderId, "SAVE20");
  assert.deepEqual(body.totals, { subtotalCents: 1500, discountCents: 1500, netCents: 0 });
});

test("order lines stay physical catalog SKUs", async () => {
  const orderId = await cartWith(GRACE, [["STICKER-PACK", 4]]);
  const { body } = await applyCode(GRACE, orderId, "WELCOME10");
  assert.deepEqual(
    body.lines.map((line: { sku: string; quantity: number }) => [line.sku, line.quantity]),
    [["STICKER-PACK", 4]],
  );
});

test("category codes only discount eligible lines", async () => {
  const orderId = await cartWith(ADA, [["TSHIRT-WHT-M", 2], ["BOTTLE-STEEL", 1]]);
  const { body } = await applyCode(ADA, orderId, "APPAREL15");
  assert.equal(body.totals.discountCents, 750);
});

test("re-applying the same code is a no-op", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  const before = redemptions("WELCOME10");
  await applyCode(ADA, orderId, "WELCOME10");
  const { body } = await applyCode(ADA, orderId, "WELCOME10");
  assert.equal(body.totals.discountCents, 600);
  assert.equal(redemptions("WELCOME10"), before + 1);
});

test("a different code replaces the first and releases its redemption", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  const before = redemptions("WELCOME10");
  await applyCode(ADA, orderId, "WELCOME10");
  const { body } = await applyCode(ADA, orderId, "APPAREL15");
  assert.equal(body.discountCode, "APPAREL15");
  assert.equal(body.totals.discountCents, 900);
  assert.equal(redemptions("WELCOME10"), before);
});

test("a shopper can reuse a fixed code on a new cart", async () => {
  const abandoned = await cartWith(GRACE, [["HOODIE-GRY-L", 1]]);
  assert.equal((await applyCode(GRACE, abandoned, "SAVE20")).status, 200);
  const next = await cartWith(GRACE, [["HOODIE-GRY-L", 1]]);
  const { status, body } = await applyCode(GRACE, next, "SAVE20");
  assert.equal(status, 200);
  assert.equal(body.totals.discountCents, 2000);
});

test("max_redemptions holds when two carts race for the last redemption", async () => {
  const [a, b] = await Promise.all([
    cartWith(ADA, [["HOODIE-GRY-L", 1]]),
    cartWith(GRACE, [["HOODIE-GRY-L", 1]]),
  ]);
  const results = await Promise.all([applyCode(ADA, a, "VIP50"), applyCode(GRACE, b, "VIP50")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(redemptions("VIP50"), 1);
});

test("placed orders cannot take a discount", async () => {
  const orderId = await cartWith(ADA, [["MUG-CERAMIC", 1]]);
  await stack.call(ADA, "POST", `/orders/${orderId}/checkout`);
  const res = await applyCode(ADA, orderId, "WELCOME10");
  assert.equal(res.status, 409);
});

test("removing items re-prices the discount within the new subtotal", async () => {
  const orderId = await cartWith(ADA, [["BOTTLE-STEEL", 1], ["MUG-CERAMIC", 1]]);
  const { body: before } = await stack.call(ADA, "GET", `/orders/${orderId}`);
  assert.equal(before.totals.subtotalCents, 4300);
  await applyCode(ADA, orderId, "WELCOME10");
  const { body } = await stack.call(ADA, "DELETE", `/orders/${orderId}/lines/BOTTLE-STEEL`);
  assert.deepEqual(body.totals, { subtotalCents: 1500, discountCents: 150, netCents: 1350 });
});

test("rejects malformed, unknown, and expired codes", async () => {
  const orderId = await cartWith(ADA, [["HOODIE-GRY-L", 1]]);
  assert.equal((await applyCode(ADA, orderId, "x' OR '1'='1")).status, 400);
  assert.equal((await applyCode(ADA, orderId, 42)).status, 400);
  assert.equal((await applyCode(ADA, orderId, "NOPE123")).status, 404);
  assert.equal((await applyCode(ADA, orderId, "SUMMER25")).status, 422);
});
