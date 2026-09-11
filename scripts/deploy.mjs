import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
const config = {
  ...parseEnv(readFileSync(".env.azure", "utf8")),
  ...process.env,
};
const required = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "ENTRA_TENANT_ID",
  "ENTRA_SUBDOMAIN",
  "ENTRA_CLIENT_ID",
  "ENTRA_CLIENT_SECRET",
  "GHCR_USER",
  "GHCR_TOKEN",
  "CONTAINER_IMAGE",
  "AZURE_SUBSCRIPTION_ID",
];
for (const key of required)
  if (!config[key])
    throw Error(`Missing ${key} in private deployment configuration`);
if (!config.CONTAINER_IMAGE.startsWith("ghcr.io/"))
  throw Error("Expected private GHCR image");
const run = (args) => {
  const r = spawnSync("az", args, { stdio: "inherit" });
  if (r.status !== 0)
    throw Error(`Azure command failed: ${args.slice(0, 2).join(" ")}`);
};
const group = "agenthelper-dev";
const appName = config.AZURE_APP_NAME || "agenthelper-dev";
const environmentName = config.AZURE_ENVIRONMENT_NAME || `${appName}-env`;
const location = config.AZURE_LOCATION || "eastus";
// Do not turn a failed environment write into an apparent successful workload deployment.
// Environment creation and its public-image acceptance probe are separate operations.
const environment = spawnSync(
  "az",
  [
    "containerapp",
    "env",
    "show",
    "--resource-group",
    group,
    "--name",
    environmentName,
    "--subscription",
    config.AZURE_SUBSCRIPTION_ID,
    "--query",
    "properties.provisioningState",
    "--output",
    "tsv",
  ],
  { encoding: "utf8" },
);
if (environment.status !== 0 || environment.stdout.trim() !== "Succeeded")
  throw Error(
    `Environment ${environmentName} must be provisioned and validated before deployment`,
  );
mkdirSync(".artifacts", { recursive: true });
const path = ".artifacts/deployment.parameters.json";
const values = {
  appName,
  environmentName,
  location,
  image: config.CONTAINER_IMAGE,
  registryUser: config.GHCR_USER,
  registryPassword: config.GHCR_TOKEN,
  databaseUrl: config.DATABASE_URL,
  authSecret: config.AUTH_SECRET,
  entraTenantId: config.ENTRA_TENANT_ID,
  entraSubdomain: config.ENTRA_SUBDOMAIN,
  entraClientId: config.ENTRA_CLIENT_ID,
  entraClientSecret: config.ENTRA_CLIENT_SECRET,
};
writeFileSync(
  path,
  JSON.stringify({
    parameters: Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, { value: v }]),
    ),
  }),
  { mode: 0o600 },
);
try {
  run(["account", "set", "--subscription", config.AZURE_SUBSCRIPTION_ID]);
  run([
    "group",
    "create",
    "--name",
    group,
    "--location",
    location,
    "--tags",
    "project=agenthelper",
    "environment=development",
    "--output",
    "none",
  ]);
  run([
    "deployment",
    "group",
    process.argv.includes("--what-if") ? "what-if" : "create",
    "--resource-group",
    group,
    "--template-file",
    "infra/main.bicep",
    "--parameters",
    "@" + path,
    ...(process.argv.includes("--what-if")
      ? []
      : ["--query", "properties.outputs.url.value", "--output", "tsv"]),
  ]);
} finally {
  unlinkSync(path);
}
