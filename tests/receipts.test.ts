import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

test("placed orders list the applied discount as a receipt line", async () => {
  const { body: order } = await stack.call(ADA, "POST", "/orders");
  await stack.call(ADA, "PUT", `/orders/${order.id}/lines/TSHIRT-BLK-M`, { quantity: 2 });
  await stack.call(ADA, "POST", `/orders/${order.id}/discount`, { code: "WELCOME10" });
  await stack.call(ADA, "POST", `/orders/${order.id}/checkout`);

  const res = await fetch(`${stack.ordersUrl}/orders/${order.id}`, {
    headers: { "x-service-token": stack.serviceToken },
  });
  const placed = await res.json();
  assert.deepEqual(placed.lines.at(-1), {
    sku: "DISCOUNT-WELCOME10",
    name: "Discount (WELCOME10)",
    quantity: -1,
    unitPriceCents: 500,
    lineTotalCents: -500,
  });
  assert.deepEqual(placed.totals, { subtotalCents: 5000, discountCents: 500, netCents: 4500 });
});
