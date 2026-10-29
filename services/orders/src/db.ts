import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    customer_id    TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'cart' CHECK (status IN ('cart', 'placed', 'cancelled')),
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
`;

/** Open the orders database and apply the schema. */
export function openOrdersDb(path = process.env.ORDERS_DB ?? ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
