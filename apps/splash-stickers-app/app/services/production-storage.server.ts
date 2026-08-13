type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type UserError = { field?: string[] | null; message: string; code?: string | null };

export type ShopifyProductionFile = {
  id: string;
  alt?: string | null;
  fileStatus: string;
  url: string | null;
  mimeType: string | null;
  originalFileSize: number | null;
  fileErrors: Array<{ code?: string | null; message: string }>;
};

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

function graphQlError(payload: { errors?: Array<{ message?: string }> }, fallback: string) {
  return payload.errors?.map((error) => error.message).filter(Boolean).join(" ") || fallback;
}

function filenameQuery(filename: string) {
  const escaped = filename.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `filename:"${escaped}" media_type:GENERIC_FILE`;
}

export async function findProductionFileByFilename(admin: AdminGraphql, filename: string, alt: string) {
  const response = await admin.graphql(
    `#graphql
      query SplashFindProductionFile($query: String!) {
        files(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            alt
            fileStatus
            fileErrors { code message }
            ... on GenericFile { url mimeType originalFileSize }
          }
        }
      }
    `,
    { variables: { query: filenameQuery(filename) } },
  );
  const payload = await response.json() as {
    errors?: Array<{ message?: string }>;
    data?: { files?: { nodes?: ShopifyProductionFile[] } };
  };
  if (!response.ok || payload.errors?.length) {
    throw new Error(graphQlError(payload, "Shopify production file lookup failed."));
  }
  return payload.data?.files?.nodes?.find((file) => file.alt === alt && file.fileStatus !== "FAILED") || null;
}

export async function uploadProductionPdf(
  admin: AdminGraphql,
  input: { filename: string; bytes: Uint8Array; alt: string },
) {
  const existing = await findProductionFileByFilename(admin, input.filename, input.alt);
  if (existing) return existing;

  const stagedResponse = await admin.graphql(
    `#graphql
      mutation SplashStageProductionFile($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        input: [{
          filename: input.filename,
          mimeType: "application/pdf",
          fileSize: String(input.bytes.byteLength),
          httpMethod: "POST",
          resource: "FILE",
        }],
      },
    },
  );
  const stagedPayload = await stagedResponse.json() as {
    errors?: Array<{ message?: string }>;
    data?: { stagedUploadsCreate?: { stagedTargets?: StagedTarget[]; userErrors?: UserError[] } };
  };
  const staged = stagedPayload.data?.stagedUploadsCreate;
  if (!stagedResponse.ok || staged?.userErrors?.length || !staged?.stagedTargets?.[0]) {
    throw new Error(staged?.userErrors?.[0]?.message || graphQlError(stagedPayload, "Shopify did not create a production upload target."));
  }

  const target = staged.stagedTargets[0];
  const form = new FormData();
  target.parameters.forEach((parameter) => form.append(parameter.name, parameter.value));
  const pdfBuffer = new ArrayBuffer(input.bytes.byteLength);
  new Uint8Array(pdfBuffer).set(input.bytes);
  form.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), input.filename);
  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  if (!uploadResponse.ok) throw new Error(`Shopify production upload failed (${uploadResponse.status}).`);

  const createResponse = await admin.graphql(
    `#graphql
      mutation SplashCreateProductionFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            fileErrors { code message }
            ... on GenericFile { url mimeType originalFileSize }
          }
          userErrors { field message code }
        }
      }
    `,
    {
      variables: {
        files: [{
          originalSource: target.resourceUrl,
          filename: input.filename,
          alt: input.alt,
          contentType: "FILE",
          duplicateResolutionMode: "APPEND_UUID",
        }],
      },
    },
  );
  const createPayload = await createResponse.json() as {
    errors?: Array<{ message?: string }>;
    data?: { fileCreate?: { files?: ShopifyProductionFile[]; userErrors?: UserError[] } };
  };
  const created = createPayload.data?.fileCreate;
  if (!createResponse.ok || created?.userErrors?.length || !created?.files?.[0]) {
    throw new Error(created?.userErrors?.[0]?.message || graphQlError(createPayload, "Shopify did not create the production file."));
  }
  return created.files[0];
}

export async function getProductionFile(admin: AdminGraphql, id: string) {
  const response = await admin.graphql(
    `#graphql
      query SplashProductionFile($id: ID!) {
        node(id: $id) {
          ... on GenericFile {
            id
            fileStatus
            fileErrors { code message }
            url
            mimeType
            originalFileSize
          }
        }
      }
    `,
    { variables: { id } },
  );
  const payload = await response.json() as {
    errors?: Array<{ message?: string }>;
    data?: { node?: ShopifyProductionFile | null };
  };
  if (!response.ok || payload.errors?.length) {
    throw new Error(graphQlError(payload, "Shopify production file lookup failed."));
  }
  return payload.data?.node || null;
}

export async function waitForProductionFile(admin: AdminGraphql, initial: ShopifyProductionFile) {
  let file: ShopifyProductionFile | null = initial;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (file?.fileStatus === "READY" && file.url) return file;
    if (file?.fileStatus === "FAILED") {
      throw new Error(file.fileErrors[0]?.message || "Shopify could not process the production PDF.");
    }
    if (attempt < 23) await new Promise((resolve) => setTimeout(resolve, 750));
    file = await getProductionFile(admin, initial.id);
    if (!file) throw new Error("The Shopify production file no longer exists.");
  }
  throw new Error("Shopify is still processing the production PDF. Retry after a short wait.");
}
