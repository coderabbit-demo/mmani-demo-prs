import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, GRACE, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

async function placeOrder(token: string, sku: string, quantity: number) {
  const { body: order } = await stack.call(token, "POST", "/orders");
  await stack.call(token, "PUT", `/orders/${order.id}/lines/${sku}`, { quantity });
  await stack.call(token, "POST", `/orders/${order.id}/checkout`);
  return order.id as string;
}

test("lists the shopper's placed orders, newest first", async () => {
  const first = await placeOrder(ADA, "MUG-CERAMIC", 2);
  const second = await placeOrder(ADA, "STICKER-PACK", 3);
  await stack.call(ADA, "POST", "/orders"); // an open cart is not history
  const { status, body } = await stack.call(ADA, "GET", "/orders?status=placed");
  assert.equal(status, 200);
  assert.deepEqual(body.map((o: { id: string }) => o.id), [second, first]);
  assert.deepEqual(
    { itemCount: body[0].itemCount, netCents: body[0].netCents },
    { itemCount: 3, netCents: 1500 },
  );
});

test("never includes another shopper's orders", async () => {
  const graces = await placeOrder(GRACE, "BOTTLE-STEEL", 1);
  const { body } = await stack.call(ADA, "GET", "/orders?status=placed");
  assert.ok(!body.some((o: { id: string }) => o.id === graces));
});

test("rejects unknown statuses", async () => {
  assert.equal((await stack.call(ADA, "GET", "/orders?status=shipped")).status, 400);
});
