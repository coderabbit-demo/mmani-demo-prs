// Start every service locally: catalog :4001, orders :4002, gateway :8080,
// and (unless --no-vite) the Vite storefront on :5173 with /api proxied.
import { spawn, type ChildProcess } from "node:child_process";

const node = process.execPath;
const flags = ["--no-warnings=ExperimentalWarning"];
const processes: Array<[string, string, string[]]> = [
  ["catalog", node, [...flags, "services/catalog/src/server.ts"]],
  ["orders", node, [...flags, "services/orders/src/server.ts"]],
  ["gateway", node, [...flags, "services/gateway/src/server.ts"]],
];
if (!process.argv.includes("--no-vite")) {
  processes.push(["web", "npx", ["vite"]]);
}

const children: ChildProcess[] = processes.map(([name, command, args]) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  child.on("exit", (code) => {
    console.error(`[${name}] exited with ${code}`);
    shutdown(code ?? 1);
  });
  return child;
});

function shutdown(code: number) {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
