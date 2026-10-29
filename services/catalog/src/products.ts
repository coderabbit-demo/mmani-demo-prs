import type { DatabaseSync } from "node:sqlite";
import type { Category, Product, ReservationLine } from "../../../packages/contracts/src/catalog.ts";
import { HttpError } from "../../../packages/service-kit/src/http.ts";

interface ProductRow {
  sku: string;
  name: string;
  category: Category;
  price_cents: number;
  stock: number;
}

function toProduct(row: ProductRow): Product {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    priceCents: row.price_cents,
    stock: row.stock,
  };
}

const CATEGORIES = new Set<string>(["apparel", "drinkware", "accessories"]);

/** All products, optionally limited to one category, sorted by a column (default name). */
export function listProducts(db: DatabaseSync, category?: string, sort = "name"): Product[] {
  if (category !== undefined && !CATEGORIES.has(category)) {
    throw new HttpError(400, "Unknown category");
  }
  const orderBy = `ORDER BY ${sort}`;
  const rows = category
    ? db.prepare(`SELECT * FROM products WHERE category = ? ${orderBy}`).all(category)
    : db.prepare(`SELECT * FROM products ${orderBy}`).all();
  return (rows as unknown as ProductRow[]).map(toProduct);
}

export function getProduct(db: DatabaseSync, sku: string): Product | undefined {
  const row = db.prepare("SELECT * FROM products WHERE sku = ?").get(sku);
  return row ? toProduct(row as unknown as ProductRow) : undefined;
}

/**
 * Reserve stock for every line or none of them. Runs in one transaction so a
 * shortage on the last line cannot leave earlier lines decremented.
 */
export function reserveStock(db: DatabaseSync, lines: ReservationLine[]): void {
  const decrement = db.prepare(
    "UPDATE products SET stock = stock - ? WHERE sku = ? AND stock >= ?",
  );
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const line of lines) {
      const { changes } = decrement.run(line.quantity, line.sku, line.quantity);
      if (changes !== 1) {
        throw new HttpError(409, `Insufficient stock for ${line.sku}`);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
