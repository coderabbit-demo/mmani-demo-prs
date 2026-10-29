import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS discount_codes (
    code            TEXT PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
    value           INTEGER NOT NULL CHECK (value > 0),
    category        TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    expires_at      TEXT,
    max_redemptions INTEGER CHECK (max_redemptions > 0),
    times_redeemed  INTEGER NOT NULL DEFAULT 0 CHECK (times_redeemed >= 0),
    CHECK (kind = 'fixed' OR value <= 100)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    customer_id    TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'cart' CHECK (status IN ('cart', 'placed', 'cancelled')),
    discount_code  TEXT REFERENCES discount_codes (code),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    created_at     TEXT NOT NULL,
    placed_at      TEXT
  );

  CREATE TABLE IF NOT EXISTS order_lines (
    order_id         TEXT NOT NULL REFERENCES orders (id),
    sku              TEXT NOT NULL,
    name             TEXT NOT NULL,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    PRIMARY KEY (order_id, sku)
  );

  -- One code per order. Fixed-amount codes are also limited to one redemption per customer.
  CREATE TABLE IF NOT EXISTS discount_redemptions (
    order_id    TEXT PRIMARY KEY REFERENCES orders (id),
    code        TEXT NOT NULL REFERENCES discount_codes (code),
    customer_id TEXT NOT NULL,
    redeemed_at TEXT NOT NULL
  );
`;

const DISCOUNT_CODES: Array<[string, string, number, string | null, string | null, number | null]> = [
  ["WELCOME10", "percent", 10, null, null, null],
  ["SAVE20", "fixed", 2000, null, null, null],
  ["APPAREL15", "percent", 15, "apparel", null, null],
  ["VIP50", "fixed", 5000, null, null, 1],
  ["SUMMER25", "percent", 25, null, "2026-09-01T00:00:00.000Z", null],
];

/** Open the orders database and apply the schema. */
export function openOrdersDb(path = process.env.ORDERS_DB ?? ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO discount_codes (code, kind, value, category, expires_at, max_redemptions)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of DISCOUNT_CODES) insert.run(...row);
  return db;
}
