import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

test("lists products through the gateway", async () => {
  const { status, body } = await stack.call(ADA, "GET", "/products");
  assert.equal(status, 200);
  assert.equal(body.length, 6);
  assert.ok(body.every((p: { priceCents: number }) => Number.isInteger(p.priceCents)));
});

test("filters by category and rejects unknown categories", async () => {
  const apparel = await stack.call(ADA, "GET", "/products?category=apparel");
  assert.deepEqual(
    apparel.body.map((p: { sku: string }) => p.sku).sort(),
    ["HOODIE-GRY-L", "TSHIRT-BLK-M", "TSHIRT-WHT-M"],
  );
  assert.equal((await stack.call(ADA, "GET", "/products?category=toys")).status, 400);
});

test("requires sign-in", async () => {
  assert.equal((await stack.call(null, "GET", "/products")).status, 401);
});
