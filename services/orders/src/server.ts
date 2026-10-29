import { openOrdersDb } from "./db.ts";
import { createOrdersApp } from "./app.ts";
import { createCatalogClient } from "./catalogClient.ts";

const port = Number(process.env.ORDERS_PORT ?? 4002);
const serviceToken = process.env.SERVICE_TOKEN ?? "dev-service-token";
const app = createOrdersApp({
  db: openOrdersDb(),
  catalog: createCatalogClient({
    baseUrl: process.env.CATALOG_URL ?? "http://localhost:4001",
    serviceToken,
  }),
  auth: { gatewayToken: process.env.GATEWAY_TOKEN ?? "dev-gateway-token", serviceToken },
  fulfillmentUrl: process.env.FULFILLMENT_URL,
});
app.listen(port, () => console.log(`orders listening on :${port}`));
