import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

import { AdminEmptyState, AdminStatusBadge, formatAdminDateTime } from "../components/admin/AdminUi";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const designs = await db.design.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      publicId: true,
      status: true,
      schemaVersion: true,
      updatedAt: true,
      _count: { select: { assets: true, mockups: true, orders: true } },
    },
  });
  return { designs };
}

export default function Designs() {
  const { designs } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Designs">
      <s-section>
        {!designs.length ? (
          <AdminEmptyState>No storefront design has been saved yet.</AdminEmptyState>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Design</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="inline" format="numeric">Assets</s-table-header>
              <s-table-header listSlot="inline" format="numeric">Mockups</s-table-header>
              <s-table-header listSlot="inline" format="numeric">Orders</s-table-header>
              <s-table-header listSlot="labeled">Updated</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {designs.map((design) => (
                <s-table-row key={design.publicId}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">{design.publicId}</s-text>
                      <s-text color="subdued">Schema {design.schemaVersion}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><AdminStatusBadge kind="design" status={design.status} /></s-table-cell>
                  <s-table-cell><s-text fontVariantNumeric="tabular-nums">{design._count.assets}</s-text></s-table-cell>
                  <s-table-cell><s-text fontVariantNumeric="tabular-nums">{design._count.mockups}</s-text></s-table-cell>
                  <s-table-cell><s-text fontVariantNumeric="tabular-nums">{design._count.orders}</s-text></s-table-cell>
                  <s-table-cell>{formatAdminDateTime(design.updatedAt)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
