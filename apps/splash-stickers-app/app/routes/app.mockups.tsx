import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const mockups = await db.mockup.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      publicId: true,
      status: true,
      outputUrl: true,
      errorCode: true,
      createdAt: true,
      design: { select: { publicId: true } },
    },
  });
  return { mockups };
}

export default function Mockups() {
  const { mockups } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Mockups">
      <s-section>
        {!mockups.length ? <s-paragraph>No mockup has been requested yet.</s-paragraph> : (
          <s-stack direction="block" gap="base">
            {mockups.map((mockup) => (
              <s-box key={mockup.publicId} padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{mockup.publicId}</s-heading>
                <s-paragraph>Design: {mockup.design.publicId} · Status: {mockup.status}</s-paragraph>
                {mockup.outputUrl && <s-link href={mockup.outputUrl} target="_blank">Open generated mockup</s-link>}
                {mockup.errorCode && <s-paragraph>Error: {mockup.errorCode}</s-paragraph>}
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
