import { openCatalogDb } from "./db.ts";
import { createCatalogApp } from "./app.ts";

const port = Number(process.env.CATALOG_PORT ?? 4001);
const app = createCatalogApp(openCatalogDb(), {
  gatewayToken: process.env.GATEWAY_TOKEN ?? "dev-gateway-token",
  serviceToken: process.env.SERVICE_TOKEN ?? "dev-service-token",
});
app.listen(port, () => console.log(`catalog listening on :${port}`));
