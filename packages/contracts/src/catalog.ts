/** Catalog service contract (services/catalog). */

export type Category = "apparel" | "drinkware" | "accessories";

export interface Product {
  sku: string;
  name: string;
  category: Category;
  priceCents: number;
  stock: number;
  /** True when stock is running out and the storefront should show a badge. */
  lowStock: boolean;
}

export interface ReservationLine {
  sku: string;
  quantity: number;
}
