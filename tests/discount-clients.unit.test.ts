import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogClient } from "../services/orders/src/catalogClient.ts";
import { api, ApiError } from "../web/src/api.ts";

const options = { baseUrl: "http://catalog.test///", serviceToken: "test-only", timeoutMs: 20 };

test("category client authenticates, trims base URL, and deduplicates SKUs", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "http://catalog.test/products?category=apparel");
    assert.equal(new Headers(init.headers).get("x-service-token"), "test-only");
    return Response.json([{ sku: "TEE" }, { sku: "TEE" }, { sku: "HOODIE" }]);
  });
  assert.deepEqual(await createCatalogClient(options).skusInCategory("apparel"), new Set(["TEE", "HOODIE"]));
});

test("category client handles an empty category", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([]));
  assert.deepEqual(await createCatalogClient(options).skusInCategory("apparel"), new Set());
});

test("category client maps upstream HTTP errors to 502", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Unavailable" }, { status: 500 }));
  await assert.rejects(createCatalogClient(options).skusInCategory("apparel"), { status: 502 });
});

test("category client maps transport failure to 503", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(createCatalogClient(options).skusInCategory("apparel"), { status: 503 });
});

test("category lookup supplies the documented bounded timeout", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json([]);
  });
  await createCatalogClient(options).skusInCategory("apparel");
});

test("storefront sends discount as JSON with shopper authentication and returns the order", async (t) => {
  const order = { id: "ord_abcdef", totals: { discountCents: 100 } };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/orders/ord_abcdef/discount");
    assert.equal(init.method, "POST");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer shopper");
    assert.equal(new Headers(init.headers).get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(init.body as string), { code: ' SAVE"20 ' });
    return Response.json(order);
  });
  assert.deepEqual(await api.applyDiscount("shopper", "ord_abcdef", ' SAVE"20 '), order);
});

for (const status of [404, 409, 422]) {
  test(`storefront surfaces discount rejection ${status}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Code rejected" }, { status }));
    await assert.rejects(api.applyDiscount("shopper", "ord_abcdef", "INVALID"),
      (err: unknown) => err instanceof ApiError && err.message === "Code rejected");
  });
}

for (const sort of [undefined, "name", "price_cents"]) {
  test(`storefront requests product sort ${sort ?? "default"}`, async (t) => {
    t.mock.method(globalThis, "fetch", async (url: string) => {
      assert.equal(url, `/api/products?sort=${sort ?? "name"}`);
      return Response.json([]);
    });
    assert.deepEqual(await api.products("shopper", sort), []);
  });
}
