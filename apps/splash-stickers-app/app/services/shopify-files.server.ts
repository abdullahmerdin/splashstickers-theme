import { normalizeDesignManifest, type DesignManifest } from "@splash-stickers/design-contract";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export function artworkRefs(input: unknown) {
  const manifest: DesignManifest = normalizeDesignManifest(input);
  return Array.from(new Set(
    manifest.items
      .filter((item) => item.kind === "image")
      .map((item) => item.assetRef || "")
      .filter(Boolean),
  ));
}

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

export async function getImageFileStatuses(admin: AdminGraphql, ids: string[]) {
  const response = await admin.graphql(
    `#graphql
      query SplashFileStatuses($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on MediaImage { id status: fileStatus image { width height } }
        }
      }
    `,
    { variables: { ids } },
  );
  const payload = await response.json() as {
    data?: { nodes?: Array<{ id?: string; status?: string; image?: { width?: number; height?: number } | null } | null> };
  };
  return (payload.data?.nodes || []).filter((node): node is NonNullable<typeof node> => Boolean(node?.id));
}

export async function resolveArtworkUrls(admin: AdminGraphql, assetRefs: string[]) {
  const ids = Array.from(new Set(assetRefs.filter((value) => value.startsWith("gid://shopify/"))));
  if (!ids.length) return new Map<string, string>();
  const response = await admin.graphql(
    `#graphql
      query SplashArtworkUrls($ids: [ID!]!) {
        nodes(ids: $ids) {
          id
          ... on MediaImage { image { url } }
        }
      }
    `,
    { variables: { ids } },
  );
  const payload = await response.json() as {
    errors?: Array<{ message?: string }>;
    data?: { nodes?: Array<{ id?: string; image?: { url?: string } | null } | null> };
  };
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || "Shopify artwork lookup failed.");
  }
  const urls = new Map<string, string>();
  payload.data?.nodes?.forEach((node) => {
    if (node?.id && node.image?.url) urls.set(node.id, node.image.url);
  });
  return urls;
}
