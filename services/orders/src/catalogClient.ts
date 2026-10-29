import type { Product, ReservationLine } from "../../../packages/contracts/src/catalog.ts";
import { HttpError } from "../../../packages/service-kit/src/http.ts";

export interface CatalogClientOptions {
  baseUrl: string;
  serviceToken: string;
  timeoutMs?: number;
}

/** Client for the catalog service. Every call is bounded by a timeout. */
export function createCatalogClient(options: CatalogClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 2000;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-service-token": options.serviceToken,
          ...init.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new HttpError(503, "Catalog service unavailable");
    }
  }

  return {
    async getProduct(sku: string): Promise<Product | undefined> {
      const res = await call(`/products/${encodeURIComponent(sku)}`);
      if (res.status === 404) return undefined;
      if (!res.ok) throw new HttpError(502, `Catalog returned ${res.status}`);
      return (await res.json()) as Product;
    },

    async skusInCategory(category: string): Promise<Set<string>> {
      const res = await fetch(`${baseUrl}/products?category=${category}`, {
        headers: { "x-service-token": options.serviceToken },
      });
      const products = (await res.json()) as Product[];
      return new Set(products.map((product) => product.sku));
    },

    async reserve(lines: ReservationLine[]): Promise<void> {
      const res = await call("/reservations", { method: "POST", body: JSON.stringify({ lines }) });
      if (res.status === 409) {
        const body = (await res.json()) as { error?: string };
        throw new HttpError(409, body.error ?? "Insufficient stock");
      }
      if (!res.ok) throw new HttpError(502, `Catalog returned ${res.status}`);
    },
  };
}

export type CatalogClient = ReturnType<typeof createCatalogClient>;
