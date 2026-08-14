import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { AdminEmptyState, AdminStatusBadge, formatAdminDateTime, formatAdminLabel } from "../components/admin/AdminUi";
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
      scene: true,
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
        {!mockups.length ? (
          <AdminEmptyState>No mockup has been requested yet.</AdminEmptyState>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Mockup</s-table-header>
              <s-table-header listSlot="secondary">Scene</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Created</s-table-header>
              <s-table-header>Output</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {mockups.map((mockup) => (
                <s-table-row key={mockup.publicId}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">{mockup.publicId}</s-text>
                      <s-text color="subdued">Design {mockup.design.publicId}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{formatAdminLabel(mockup.scene)}</s-table-cell>
                  <s-table-cell><AdminStatusBadge kind="mockup" status={mockup.status} /></s-table-cell>
                  <s-table-cell>{formatAdminDateTime(mockup.createdAt)}</s-table-cell>
                  <s-table-cell>
                    {mockup.outputUrl ? (
                      <s-link href={mockup.outputUrl} target="_blank">Open output</s-link>
                    ) : mockup.errorCode ? (
                      <s-text tone="critical">{mockup.errorCode}</s-text>
                    ) : (
                      <s-text color="subdued">Not ready</s-text>
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
