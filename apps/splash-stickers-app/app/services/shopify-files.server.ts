type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

type UserError = { field?: string[] | null; message: string };
type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

export async function stageImageUpload(
  admin: AdminGraphql,
  input: { filename: string; mimeType: string; fileSize: number },
) {
  const response = await admin.graphql(
    `#graphql
      mutation SplashStageUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        input: [{
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: String(input.fileSize),
          httpMethod: "POST",
          resource: "IMAGE",
        }],
      },
    },
  );
  const payload = await response.json() as {
    data?: { stagedUploadsCreate?: { stagedTargets?: StagedTarget[]; userErrors?: UserError[] } };
  };
  const result = payload.data?.stagedUploadsCreate;
  if (result?.userErrors?.length || !result?.stagedTargets?.[0]) {
    throw new Error(result?.userErrors?.[0]?.message || "Shopify did not create an upload target.");
  }
  return result.stagedTargets[0];
}

export async function completeImageUpload(
  admin: AdminGraphql,
  input: { resourceUrl: string; filename: string; alt?: string },
) {
  const response = await admin.graphql(
    `#graphql
      mutation SplashCompleteUpload($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
            alt
          }
          userErrors { field message }
        }
      }
    `,
    {
      variables: {
        files: [{
          originalSource: input.resourceUrl,
          filename: input.filename,
          alt: input.alt,
          contentType: "IMAGE",
          duplicateResolutionMode: "APPEND_UUID",
        }],
      },
    },
  );
  const payload = await response.json() as {
    data?: { fileCreate?: { files?: Array<{ id: string; fileStatus: string; alt?: string | null }>; userErrors?: UserError[] } };
  };
  const result = payload.data?.fileCreate;
  if (result?.userErrors?.length || !result?.files?.[0]) {
    throw new Error(result?.userErrors?.[0]?.message || "Shopify did not create the artwork file.");
  }
  return result.files[0];
}
