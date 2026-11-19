import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseSync } from "node:sqlite";
import { openOrdersDb } from "../services/orders/src/db.ts";
import { createOrder, getOrder, setLine } from "../services/orders/src/orders.ts";
import { applyDiscountCode, discountAmountCents, findDiscountCode, type DiscountCode } from "../services/orders/src/discounts.ts";
import type { CatalogClient } from "../services/orders/src/catalogClient.ts";
import type { Order } from "../packages/contracts/src/orders.ts";

let db: DatabaseSync;
let order: Order;
const catalog: CatalogClient = {
  async getProduct() { throw new Error("Unexpected product lookup"); },
  async reserve() { throw new Error("Unexpected stock reservation"); },
  async skusInCategory(category) {
    assert.equal(category, "apparel");
    return new Set(["TEE"]);
  },
};
beforeEach(() => {
  db = openOrdersDb(":memory:");
  order = createOrder(db, "customer");
  setLine(db, order.id, { sku: "TEE", name: "Tee", quantity: 3, unitPriceCents: 333 });
  setLine(db, order.id, { sku: "MUG", name: "Mug", quantity: 1, unitPriceCents: 502 });
  order = getOrder(db, order.id)!;
});
afterEach(() => db.close());

function code(overrides: Partial<DiscountCode> = {}): DiscountCode {
  return { code: "TEST", kind: "percent", value: 15, category: null, active: 1,
    expires_at: null, max_redemptions: null, times_redeemed: 0, ...overrides };
}
function redeemed(rawCode = "WELCOME10") {
  return findDiscountCode(db, rawCode)!.times_redeemed;
}

test("lookup trims whitespace, normalizes case, and returns undefined for unknown codes", () => {
  assert.equal(findDiscountCode(db, " \tWeLcOmE10\n")?.code, "WELCOME10");
  assert.equal(findDiscountCode(db, "MISSING"), undefined);
  assert.equal(findDiscountCode(db, "  "), undefined);
});

test("lookup treats apostrophes and SQL expressions as literal code input", () => {
  assert.equal(findDiscountCode(db, "O'HARE"), undefined);
  assert.equal(findDiscountCode(db, "') OR 1=1 --"), undefined);
  assert.equal(redeemed(), 0);
});

test("percentage rounds once on the full eligible subtotal", async () => {
  assert.equal(await discountAmountCents(order, code(), catalog), 225);
  assert.equal(await discountAmountCents(order, code({ value: 50 }), catalog), 751);
});

test("category percentage includes quantities and excludes other categories", async () => {
  assert.equal(await discountAmountCents(order, code({ category: "apparel" }), catalog), 150);
});

test("category percentage with no matching SKUs is zero", async () => {
  assert.equal(await discountAmountCents(order, code({ category: "apparel" }), {
    ...catalog, async skusInCategory() { return new Set(); },
  }), 0);
});

test("empty order and zero percent produce zero discount", async () => {
  assert.equal(await discountAmountCents(createOrder(db, "empty"), code(), catalog), 0);
  assert.equal(await discountAmountCents(order, code({ value: 0 }), catalog), 0);
});

test("fixed discount below subtotal is exact and requires no category lookup", async () => {
  assert.equal(await discountAmountCents(order, code({ kind: "fixed", value: 500 }), {
    ...catalog, async skusInCategory() { throw new Error("Unexpected category lookup"); },
  }), 500);
});

for (const [label, patch, status] of [
  ["inactive", { active: 0 }, 422],
  ["expired", { expires_at: "2000-01-01T00:00:00.000Z" }, 422],
  ["exhausted", { max_redemptions: 2, times_redeemed: 2 }, 409],
  ["over limit", { max_redemptions: 2, times_redeemed: 3 }, 409],
  ["zero allowance", { max_redemptions: 0 }, 409],
] as const) {
  test(`rejects ${label} code without changing order or redemption count`, async () => {
    const fixture = code(patch);
    db.prepare(`INSERT INTO discount_codes
      (code, kind, value, active, expires_at, max_redemptions, times_redeemed)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(fixture.code, fixture.kind, fixture.value,
        fixture.active, fixture.expires_at, fixture.max_redemptions, fixture.times_redeemed);
    await assert.rejects(applyDiscountCode(db, order, "TEST", catalog), { status });
    assert.deepEqual(getOrder(db, order.id), order);
    assert.equal(redeemed("TEST"), fixture.times_redeemed);
  });
}

test("unknown code leaves persistent state unchanged", async () => {
  await assert.rejects(applyDiscountCode(db, order, "MISSING", catalog), { status: 404 });
  assert.deepEqual(getOrder(db, order.id), order);
  assert.equal(redeemed(), 0);
});

test("future expiry and last available redemption are accepted", async () => {
  db.prepare("UPDATE discount_codes SET expires_at = ?, max_redemptions = 2, times_redeemed = 1 WHERE code = ?")
    .run("2999-01-01T00:00:00.000Z", "WELCOME10");
  await applyDiscountCode(db, order, "WELCOME10", catalog);
  assert.equal(redeemed(), 2);
  const next = createOrder(db, "other");
  await assert.rejects(applyDiscountCode(db, next, "WELCOME10", catalog), { status: 409 });
  assert.deepEqual(getOrder(db, next.id), next);
});

test("catalog failure does not consume a redemption or change the order", async () => {
  await assert.rejects(applyDiscountCode(db, order, "APPAREL15", {
    ...catalog, async skusInCategory() { throw new Error("Catalog offline"); },
  }), /Catalog offline/);
  assert.equal(redeemed("APPAREL15"), 0);
  assert.deepEqual(getOrder(db, order.id), order);
});

// These assertions preserve the public order invariants documented before this PR.
test("discount is applied once at order level and preserves physical lines", async () => {
  const result = await applyDiscountCode(db, order, "WELCOME10", catalog);
  assert.deepEqual(result.lines, order.lines);
  assert.deepEqual(result.totals, { subtotalCents: 1501, discountCents: 150, netCents: 1351 });
  assert.equal(redeemed(), 1);
  assert.deepEqual(getOrder(db, order.id), result);
});

test("fixed discount cannot exceed subtotal or make net negative", async () => {
  const result = await applyDiscountCode(db, order, "SAVE20", catalog);
  assert.equal(result.totals.subtotalCents, 1501);
  assert.equal(result.totals.discountCents, 1501);
  assert.equal(result.totals.netCents, 0);
});

test("failed order write rolls back redemption count", async () => {
  db.exec(`CREATE TRIGGER reject_discount BEFORE UPDATE OF discount_cents ON orders
    WHEN NEW.discount_cents <> OLD.discount_cents BEGIN SELECT RAISE(ABORT, 'write failed'); END`);
  await assert.rejects(applyDiscountCode(db, order, "WELCOME10", catalog), /write failed/);
  assert.equal(redeemed(), 0);
  assert.deepEqual(getOrder(db, order.id), order);
});
