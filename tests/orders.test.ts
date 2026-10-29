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
  return (await stack.call(ADA, "GET", `/orders/${order.id}`)).body;
}

test("prices lines from the catalog in integer cents", async () => {
  const order = await cartWith([["TSHIRT-BLK-M", 2], ["MUG-CERAMIC", 1]]);
  assert.deepEqual(order.totals, { subtotalCents: 6500, discountCents: 0, netCents: 6500 });
  assert.deepEqual(
    order.lines.map((l: { sku: string; quantity: number }) => [l.sku, l.quantity]),
    [["MUG-CERAMIC", 1], ["TSHIRT-BLK-M", 2]],
  );
});

test("rejects non-positive and fractional quantities", async () => {
  const { body: order } = await stack.call(ADA, "POST", "/orders");
  for (const quantity of [0, -1, 1.5, "2"]) {
    const res = await stack.call(ADA, "PUT", `/orders/${order.id}/lines/MUG-CERAMIC`, { quantity });
    assert.equal(res.status, 400, `quantity ${JSON.stringify(quantity)}`);
  }
});

test("customers cannot see or change each other's orders", async () => {
  const order = await cartWith([["MUG-CERAMIC", 1]]);
  assert.equal((await stack.call(GRACE, "GET", `/orders/${order.id}`)).status, 404);
  assert.equal(
    (await stack.call(GRACE, "PUT", `/orders/${order.id}/lines/MUG-CERAMIC`, { quantity: 3 })).status,
    404,
  );
});

test("checkout reserves stock and freezes the order", async () => {
  const order = await cartWith([["HOODIE-GRY-L", 2]]);
  const placed = await stack.call(ADA, "POST", `/orders/${order.id}/checkout`);
  assert.equal(placed.status, 200);
  assert.equal(placed.body.status, "placed");

  const hoodie = await stack.call(ADA, "GET", "/products/HOODIE-GRY-L");
  assert.equal(hoodie.body.stock, 10);

  const edit = await stack.call(ADA, "PUT", `/orders/${order.id}/lines/HOODIE-GRY-L`, { quantity: 1 });
  assert.equal(edit.status, 409);
});

test("a shortage reserves nothing", async () => {
  const order = await cartWith([["STICKER-PACK", 1], ["HOODIE-GRY-L", 50]]);
  const res = await stack.call(ADA, "POST", `/orders/${order.id}/checkout`);
  assert.equal(res.status, 409);
  const stickers = await stack.call(ADA, "GET", "/products/STICKER-PACK");
  assert.equal(stickers.body.stock, 200);
});

test("fulfillment reads placed orders with the service token", async () => {
  const order = await cartWith([["MUG-CERAMIC", 2]]);
  await stack.call(ADA, "POST", `/orders/${order.id}/checkout`);
  const res = await fetch(`${stack.ordersUrl}/orders/${order.id}`, {
    headers: { "x-service-token": stack.serviceToken },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "placed");
  assert.ok(body.lines.every((l: { quantity: number }) => Number.isInteger(l.quantity) && l.quantity >= 1));
});
