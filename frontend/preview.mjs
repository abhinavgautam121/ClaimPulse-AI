// Adapt the managed preview runner's Vite-style flags to Next.js.
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
const portAt = args.indexOf("--port");
const port = portAt >= 0 ? args[portAt + 1] : process.env.PORT || "3000";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    port,
  ],
  { stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } },
);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code || 0));
