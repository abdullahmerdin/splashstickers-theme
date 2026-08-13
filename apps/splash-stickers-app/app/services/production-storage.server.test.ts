import assert from "node:assert/strict";
import test from "node:test";

import { uploadProductionPdf } from "./production-storage.server";

const filename = "splash-production-123-456-abcdef123456.pdf";
const readyFile = {
  id: "gid://shopify/GenericFile/1",
  alt: "Production PDF",
  fileStatus: "READY",
  fileErrors: [],
  url: "https://cdn.shopify.com/files/production.pdf",
  mimeType: "application/pdf",
  originalFileSize: 3,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("production upload reuses the deterministic generic file", async () => {
  const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
  const admin = {
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      calls.push({ query, variables: options?.variables });
      return jsonResponse({ data: { files: { nodes: [{ ...readyFile, id: "gid://shopify/GenericFile/other", alt: "Other file" }, readyFile] } } });
    },
  };

  const result = await uploadProductionPdf(admin, {
    filename,
    bytes: new Uint8Array([1, 2, 3]),
    alt: "Production PDF",
  });

  assert.equal(result.id, readyFile.id);
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /SplashFindProductionFile/);
  assert.doesNotMatch(calls[0].query, /\n\s+filename\s*\n/);
  assert.deepEqual(calls[0].variables, { query: `filename:"${filename}" media_type:GENERIC_FILE` });
});

test("production upload uses a supported generic-file duplicate mode", async (context) => {
  const calls: Array<{ query: string; variables?: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 201 });
  context.after(() => { globalThis.fetch = originalFetch; });

  const admin = {
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      calls.push({ query, variables: options?.variables });
      if (query.includes("SplashFindProductionFile")) {
        return jsonResponse({ data: { files: { nodes: [] } } });
      }
      if (query.includes("SplashStageProductionFile")) {
        return jsonResponse({
          data: {
            stagedUploadsCreate: {
              stagedTargets: [{
                url: "https://uploads.example.com/",
                resourceUrl: "https://uploads.example.com/staged/production.pdf",
                parameters: [{ name: "key", value: "production" }],
              }],
              userErrors: [],
            },
          },
        });
      }
      return jsonResponse({ data: { fileCreate: { files: [readyFile], userErrors: [] } } });
    },
  };

  const result = await uploadProductionPdf(admin, {
    filename,
    bytes: new Uint8Array([1, 2, 3]),
    alt: "Production PDF",
  });

  assert.equal(result.id, readyFile.id);
  const createCall = calls.find((call) => call.query.includes("SplashCreateProductionFile"));
  assert.ok(createCall);
  assert.deepEqual(createCall.variables, {
    files: [{
      originalSource: "https://uploads.example.com/staged/production.pdf",
      filename,
      alt: "Production PDF",
      contentType: "FILE",
      duplicateResolutionMode: "APPEND_UUID",
    }],
  });
});
