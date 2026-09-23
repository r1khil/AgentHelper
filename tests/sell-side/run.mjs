import { spawn } from "node:child_process";
const server = spawn(process.execPath, ["tests/sell-side/server.mjs"], {
  stdio: ["ignore", "pipe", "inherit"],
});
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Local integration server did not start")), 60000);
    server.once("exit", (code) => reject(new Error(`Local integration server exited: ${code}`)));
    server.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (String(chunk).includes("integration app:")) resolve();
    });
  });
  clearTimeout(timer);
  const browser = spawn(process.execPath, ["tests/sell-side/browser.mjs"], {
    stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve) => browser.once("exit", (code) => resolve(code ?? 1)));
} finally {
  clearTimeout(timer);
  server.kill();
}
