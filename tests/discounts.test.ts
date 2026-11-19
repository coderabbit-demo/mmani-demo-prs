import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, GRACE, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

async function cartWith(lines: Array<[string, number]>) {
  const { body: order } = await stack.call(ADA, "POST", "/orders");
  for (const [sku, quantity] of lines) {
    await stack.call(ADA, "PUT", `/orders/${order.id}/lines/${sku}`, { quantity });
  }
  return order.id as string;
}

function applyCode(orderId: string, code: string) {
  return stack.call(ADA, "POST", `/orders/${orderId}/discount`, { code });
}

test("applies a percent code", async () => {
  const orderId = await cartWith([["TSHIRT-BLK-M", 2], ["MUG-CERAMIC", 1]]);
  const { status, body } = await applyCode(orderId, "WELCOME10");
  assert.equal(status, 200);
  assert.equal(body.totals.discountCents, 650);
  assert.equal(body.totals.netCents, 5200);
});

test("codes are case-insensitive", async () => {
  const orderId = await cartWith([["HOODIE-GRY-L", 1]]);
  const { status, body } = await applyCode(orderId, "save20");
  assert.equal(status, 200);
  assert.equal(body.totals.discountCents, 2000);
});

test("category codes only discount eligible lines", async () => {
  const orderId = await cartWith([["TSHIRT-WHT-M", 2], ["BOTTLE-STEEL", 1]]);
  const { body } = await applyCode(orderId, "APPAREL15");
  assert.equal(body.totals.discountCents, 750);
});

test("fixed discount larger than the cart", async () => {
  const orderId = await cartWith([["MUG-CERAMIC", 1]]);
  const { status, body } = await applyCode(orderId, "SAVE20");
  assert.equal(status, 200);
  assert.equal(body.totals.netCents, -2500);
});

test("discount is listed on the order", async () => {
  const orderId = await cartWith([["STICKER-PACK", 4]]);
  const { body } = await applyCode(orderId, "WELCOME10");
  const discountLine = body.lines.find((line: { sku: string }) => line.sku === "DISCOUNT-WELCOME10");
  assert.ok(discountLine);
  assert.equal(discountLine.quantity, -1);
});

test("rejects unknown, expired, and exhausted codes", async () => {
  const orderId = await cartWith([["HOODIE-GRY-L", 2]]);
  assert.equal((await applyCode(orderId, "NOPE")).status, 404);
  assert.equal((await applyCode(orderId, "SUMMER25")).status, 422);
  assert.equal((await applyCode(orderId, "VIP50")).status, 200);
  const other = await cartWith([["HOODIE-GRY-L", 2]]);
  assert.equal((await applyCode(other, "VIP50")).status, 409);
});

test("checkout skips discount lines when reserving stock", async () => {
  const orderId = await cartWith([["BOTTLE-STEEL", 2]]);
  await applyCode(orderId, "SAVE20");
  const placed = await stack.call(ADA, "POST", `/orders/${orderId}/checkout`);
  assert.equal(placed.status, 200);
  const bottle = await stack.call(ADA, "GET", "/products/BOTTLE-STEEL");
  assert.equal(bottle.body.stock, 28);
});

test("products can be sorted by price", async () => {
  const { body } = await stack.call(ADA, "GET", "/products?sort=price_cents");
  assert.equal(body[0].sku, "STICKER-PACK");
});


test("discount route rejects missing, blank, and non-string codes without mutation", async () => {
  const orderId = await cartWith([["MUG-CERAMIC", 1]]);
  const original = await stack.call(ADA, "GET", `/orders/${orderId}`);
  for (const body of [undefined, {}, { code: "" }, { code: " \t " }, { code: null },
    { code: 123 }, { code: [] }, { code: {} }]) {
    const result = await stack.call(ADA, "POST", `/orders/${orderId}/discount`, body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.deepEqual(result.body, { error: "code is required" });
  }
  assert.deepEqual((await stack.call(ADA, "GET", `/orders/${orderId}`)).body, original.body);
});

test("discount route requires sign-in and hides another shopper's order", async () => {
  const orderId = await cartWith([["MUG-CERAMIC", 1]]);
  const original = await stack.call(ADA, "GET", `/orders/${orderId}`);
  assert.equal((await stack.call(null, "POST", `/orders/${orderId}/discount`, { code: "WELCOME10" })).status, 401);
  assert.equal((await stack.call(GRACE, "POST", `/orders/${orderId}/discount`, { code: "WELCOME10" })).status, 404);
  assert.deepEqual((await stack.call(ADA, "GET", `/orders/${orderId}`)).body, original.body);
});

test("discount route validates order IDs and rejects nonexistent orders", async () => {
  assert.equal((await applyCode("invalid", "WELCOME10")).status, 400);
  assert.equal((await applyCode("ord_nonexistent", "WELCOME10")).status, 404);
});

test("placed orders reject discounts without changing the saved order", async () => {
  const orderId = await cartWith([["MUG-CERAMIC", 1]]);
  const placed = await stack.call(ADA, "POST", `/orders/${orderId}/checkout`);
  assert.equal(placed.status, 200);
  assert.equal((await applyCode(orderId, "WELCOME10")).status, 409);
  assert.deepEqual((await stack.call(ADA, "GET", `/orders/${orderId}`)).body, placed.body);
});

test("sort query composes with category and ignores non-scalar values", async () => {
  const filtered = await stack.call(ADA, "GET", "/products?category=drinkware&sort=price_cents");
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.map((p: { sku: string }) => p.sku), ["MUG-CERAMIC", "BOTTLE-STEEL"]);
  const defaultOrder = await stack.call(ADA, "GET", "/products");
  const repeated = await stack.call(ADA, "GET", "/products?sort=name&sort=price_cents");
  assert.equal(repeated.status, 200);
  assert.deepEqual(repeated.body, defaultOrder.body);
});
