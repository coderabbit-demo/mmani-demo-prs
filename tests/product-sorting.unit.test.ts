import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { openCatalogDb } from "../services/catalog/src/db.ts";
import { listProducts } from "../services/catalog/src/products.ts";
let db: DatabaseSync;
beforeEach(() => { db = openCatalogDb(":memory:"); });
afterEach(() => db.close());

test("default and explicit name sorting agree and order the entire catalog", () => {
  const products = listProducts(db);
  assert.deepEqual(products, listProducts(db, undefined, "name"));
  assert.equal(products.length, 6);
  assert.deepEqual(products.map(p => p.name), products.map(p => p.name).sort());
});

test("price sorting orders every price numerically and preserves product fields", () => {
  const products = listProducts(db, undefined, "price_cents");
  assert.deepEqual(products.map(p => p.priceCents), [500, 1500, 2500, 2500, 2800, 6000]);
  assert.deepEqual([...products].sort((a, b) => a.sku.localeCompare(b.sku)),
    listProducts(db).sort((a, b) => a.sku.localeCompare(b.sku)));
});

test("category filtering composes with price sorting", () => {
  const products = listProducts(db, "drinkware", "price_cents");
  assert.deepEqual(products.map(p => p.sku), ["MUG-CERAMIC", "BOTTLE-STEEL"]);
  assert.ok(products.every(p => p.category === "drinkware"));
});

test("unknown category remains a boundary error when sorting", () => {
  assert.throws(() => listProducts(db, "toys", "price_cents"), { status: 400 });
});
