import { spawn } from "node:child_process";
const server = spawn(process.execPath, ["tests/charts/server.mjs"], {
  stdio: ["ignore", "pipe", "inherit"],
});
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Chart fixture server did not start")),
      60000,
    );
    server.once("exit", (code) =>
      reject(new Error(`Chart fixture server exited: ${code}`)),
    );
    server.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      if (String(chunk).includes("Chart integration app:")) resolve();
    });
  });
  clearTimeout(timer);
  const checks = spawn(process.execPath, ["tests/charts/browser.mjs"], {
    stdio: "inherit",
  });
  process.exitCode = await new Promise((resolve) =>
    checks.once("exit", (code) => resolve(code ?? 1)),
  );
} finally {
  clearTimeout(timer);
  server.kill();
}
