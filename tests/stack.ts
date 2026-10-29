import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openCatalogDb } from "../services/catalog/src/db.ts";
import { createCatalogApp } from "../services/catalog/src/app.ts";
import { openOrdersDb } from "../services/orders/src/db.ts";
import { createOrdersApp } from "../services/orders/src/app.ts";
import { createCatalogClient } from "../services/orders/src/catalogClient.ts";
import { createGateway } from "../services/gateway/src/app.ts";

const auth = { gatewayToken: "test-gateway-token", serviceToken: "test-service-token" };

function listen(app: { listen(port: number): Server }): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0);
    server.on("listening", () => {
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

/** Boot catalog, orders, and gateway on ephemeral ports with in-memory databases. */
export async function startStack() {
  const catalogDb = openCatalogDb(":memory:");
  const ordersDb = openOrdersDb(":memory:");
  const catalog = await listen(createCatalogApp(catalogDb, auth));
  const orders = await listen(
    createOrdersApp({
      db: ordersDb,
      catalog: createCatalogClient({ baseUrl: catalog.url, serviceToken: auth.serviceToken }),
      auth,
    }),
  );
  const gateway = await listen(
    createGateway({
      upstreams: { catalog: catalog.url, orders: orders.url },
      gatewayToken: auth.gatewayToken,
    }),
  );

  async function call(token: string | null, method: string, path: string, body?: unknown) {
    const res = await fetch(`${gateway.url}/api${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  }

  return {
    catalogDb,
    ordersDb,
    ordersUrl: orders.url,
    serviceToken: auth.serviceToken,
    call,
    async stop() {
      for (const { server } of [gateway, orders, catalog]) {
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}

export type Stack = Awaited<ReturnType<typeof startStack>>;
export const ADA = "demo-ada";
export const GRACE = "demo-grace";
