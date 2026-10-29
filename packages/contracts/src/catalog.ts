/** Catalog service contract (services/catalog). */

export type Category = "apparel" | "drinkware" | "accessories";

export interface Product {
  sku: string;
  name: string;
  category: Category;
  priceCents: number;
  stock: number;
}

export interface ReservationLine {
  sku: string;
  quantity: number;
}
