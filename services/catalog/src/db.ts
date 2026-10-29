import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    sku         TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK (category IN ('apparel', 'drinkware', 'accessories')),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0)
  );
`;

const SEED: Array<[string, string, string, number, number]> = [
  ["TSHIRT-BLK-M", "Logo tee, black (M)", "apparel", 2500, 40],
  ["TSHIRT-WHT-M", "Logo tee, white (M)", "apparel", 2500, 25],
  ["HOODIE-GRY-L", "Burrow hoodie, grey (L)", "apparel", 6000, 12],
  ["MUG-CERAMIC", "Ceramic carrot mug", "drinkware", 1500, 60],
  ["BOTTLE-STEEL", "Steel water bottle", "drinkware", 2800, 30],
  ["STICKER-PACK", "Sticker pack", "accessories", 500, 200],
];

/** Open the catalog database, creating and seeding it on first use. */
export function openCatalogDb(path = process.env.CATALOG_DB ?? ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
  if (n === 0) {
    const insert = db.prepare(
      "INSERT INTO products (sku, name, category, price_cents, stock) VALUES (?, ?, ?, ?, ?)",
    );
    for (const row of SEED) insert.run(...row);
  }
  return db;
}
