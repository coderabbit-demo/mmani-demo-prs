import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { GRACE, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

test("a fixed code keeps its full amount when items are removed", async () => {
  const { body: order } = await stack.call(GRACE, "POST", "/orders");
  await stack.call(GRACE, "PUT", `/orders/${order.id}/lines/BOTTLE-STEEL`, { quantity: 1 });
  await stack.call(GRACE, "PUT", `/orders/${order.id}/lines/MUG-CERAMIC`, { quantity: 1 });
  await stack.call(GRACE, "POST", `/orders/${order.id}/discount`, { code: "SAVE20" });

  const { body } = await stack.call(GRACE, "DELETE", `/orders/${order.id}/lines/BOTTLE-STEEL`);
  assert.equal(body.discountCode, "SAVE20");
  assert.deepEqual(body.totals, { subtotalCents: 1500, discountCents: 2000, netCents: -500 });
});
