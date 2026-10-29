import { fileURLToPath } from "node:url";
import { createGateway } from "./app.ts";

const port = Number(process.env.PORT ?? 8080);
const app = createGateway({
  upstreams: {
    catalog: process.env.CATALOG_URL ?? "http://localhost:4001",
    orders: process.env.ORDERS_URL ?? "http://localhost:4002",
  },
  gatewayToken: process.env.GATEWAY_TOKEN ?? "dev-gateway-token",
  webDist: fileURLToPath(new URL("../../../web/dist", import.meta.url)),
});
app.listen(port, () => console.log(`gateway listening on :${port}`));
