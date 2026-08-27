import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionEnvironment,
  getProductionEnvironmentErrors,
} from "./env-validation.js";

const databaseName = ["DATABASE", "URL"].join("_");
const directName = ["DIRECT", "URL"].join("_");
const apiKeyName = ["SHOPIFY", "API", "KEY"].join("_");
const apiSecretName = ["SHOPIFY", "API", "SECRET"].join("_");
const databaseProtocol = ["postgres", "ql"].join("");

function databaseUrl(user: string, password: string, host: string) {
  return databaseProtocol + "://" + [user, password].join(":") + "@" + host + ":5432/app";
}

function productionEnvironment() {
  const environment: Record<string, string> = {
    NODE_ENV: "production",
    [apiKeyName]: ["runtime", "client", "id"].join("-"),
    [apiSecretName]: ["runtime", "client", "secret"].join("-"),
    SHOPIFY_APP_URL: "https://app.splash-stickers.test",
    SCOPES: ["read_products", "write_files"].join(","),
    [databaseName]: databaseUrl("runtime-user", "runtime-password", "db.splash-stickers.test"),
    [directName]: databaseUrl("runtime-user", "runtime-password", "direct.splash-stickers.test"),
  };
  return environment;
}

test("valid production configuration passes", () => {
  assert.equal(assertProductionEnvironment(productionEnvironment()), true);
  assert.deepEqual(getProductionEnvironmentErrors(productionEnvironment()), []);
});

test("missing production configuration fails closed with names but no values", () => {
  const environment = productionEnvironment();
  delete environment[apiSecretName];
  delete environment[databaseName];

  const errors = getProductionEnvironmentErrors(environment);

  assert.ok(errors.some((error) => error.startsWith(apiSecretName)));
  assert.ok(errors.some((error) => error.startsWith(databaseName)));
  assert.throws(
    () => assertProductionEnvironment(environment),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "PRODUCTION_ENV_INVALID");
      assert.match((error as Error).message, /Production environment validation failed/);
      assert.doesNotMatch((error as Error).message, /runtime-client-secret|runtime-password/);
      return true;
    }
  );
});

test("placeholder, local, and insecure production values are rejected", () => {
  const environment = productionEnvironment();
  environment[apiKeyName] = "build-placeholder";
  environment[apiSecretName] = "local-development-only";
  environment.SHOPIFY_APP_URL = "http://localhost:3000";
  environment[databaseName] = databaseUrl("user", "password", "127.0.0.1");
  environment[directName] = databaseUrl("user", "password", "db.example.test");

  const errors = getProductionEnvironmentErrors(environment);

  assert.ok(errors.length >= 6);
  assert.ok(errors.every((error) => !error.includes("build-placeholder")));
  assert.ok(errors.every((error) => !error.includes("local-development-only")));
});

test("non-production environments keep local development behavior", () => {
  assert.deepEqual(
    getProductionEnvironmentErrors({ NODE_ENV: "development" }),
    []
  );
});
