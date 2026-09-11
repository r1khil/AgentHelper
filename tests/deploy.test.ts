import { afterEach, expect, test } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function deploy(state: string, failDeployment = false) {
  const directory = mkdtempSync(join(tmpdir(), "agenthelper-deploy-test-"));
  directories.push(directory);
  const config = {
    DATABASE_URL: "postgres://fixture",
    AUTH_SECRET: "fixture",
    ENTRA_TENANT_ID: "fixture",
    ENTRA_SUBDOMAIN: "fixture",
    ENTRA_CLIENT_ID: "fixture",
    ENTRA_CLIENT_SECRET: "fixture",
    GHCR_USER: "fixture",
    GHCR_TOKEN: "fixture",
    CONTAINER_IMAGE: "ghcr.io/fixture/image@sha256:fixture",
    AZURE_SUBSCRIPTION_ID: "fixture",
    AZURE_APP_NAME: "recovery-app",
    AZURE_ENVIRONMENT_NAME: "validated-env",
    AZURE_LOCATION: "eastus",
  };
  writeFileSync(
    join(directory, ".env.azure"),
    Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  writeFileSync(
    join(directory, "az"),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
if (args[0] === 'containerapp') { console.log(process.env.PROBE_STATE); process.exit(0); }
if (args[0] === 'deployment') {
  const p = JSON.parse(fs.readFileSync('.artifacts/deployment.parameters.json')).parameters;
  fs.writeFileSync('target.json', JSON.stringify({appName:p.appName.value, environmentName:p.environmentName.value, location:p.location.value}));
  process.exit(process.env.FAIL_DEPLOYMENT === 'yes' ? 1 : 0);
}
`,
    { mode: 0o700 },
  );
  const result = spawnSync(process.execPath, [resolve("scripts/deploy.mjs")], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      ...config,
      PATH: `${directory}:${process.env.PATH}`,
      PROBE_STATE: state,
      FAIL_DEPLOYMENT: failDeployment ? "yes" : "no",
    },
  });
  return {
    directory,
    result,
    calls: readFileSync(join(directory, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  };
}

test.each(["Waiting", "InProgress", "Failed"])(
  "refuses workloads when environment is %s",
  (state) => {
    const { directory, result, calls } = deploy(state);
    expect(result.status).not.toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual(["containerapp", "env", "show"]);
    expect(
      existsSync(join(directory, ".artifacts/deployment.parameters.json")),
    ).toBe(false);
  },
);

test.each([false, true])(
  "uses explicit recovery target and cleans parameters, failure=%s",
  (failure) => {
    const { directory, result } = deploy("Succeeded", failure);
    expect(result.status).toBe(failure ? 1 : 0);
    expect(
      JSON.parse(readFileSync(join(directory, "target.json"), "utf8")),
    ).toEqual({
      appName: "recovery-app",
      environmentName: "validated-env",
      location: "eastus",
    });
    expect(
      existsSync(join(directory, ".artifacts/deployment.parameters.json")),
    ).toBe(false);
  },
);
