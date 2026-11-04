import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { ADA, startStack, type Stack } from "./stack.ts";

let stack: Stack;
before(async () => (stack = await startStack()));
after(() => stack.stop());

function setStock(sku: string, stock: number) {
  stack.catalogDb.prepare("UPDATE products SET stock = ? WHERE sku = ?").run(stock, sku);
}

async function product(sku: string) {
  return (await stack.call(ADA, "GET", `/products/${sku}`)).body;
}

test("flags products that are running low", async () => {
  setStock("HOODIE-GRY-L", 3);
  assert.equal((await product("HOODIE-GRY-L")).lowStock, true);
});

test("does not flag well-stocked products", async () => {
  setStock("MUG-CERAMIC", 10);
  assert.equal((await product("MUG-CERAMIC")).lowStock, false);
});

test("sold-out products are not low stock", async () => {
  setStock("BOTTLE-STEEL", 0);
  assert.equal((await product("BOTTLE-STEEL")).lowStock, false);
});
