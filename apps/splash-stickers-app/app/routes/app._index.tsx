import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminMetricStrip } from "../components/admin/AdminUi";
import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [designs, readyDesigns, queuedMockups, pendingReviews, production, failedProduction] = await db.$transaction([
    db.design.count({ where: { shop } }),
    db.design.count({ where: { shop, status: "READY" } }),
    db.mockup.count({ where: { shop, status: { in: ["QUEUED", "PROCESSING"] } } }),
    db.review.count({ where: { shop, status: "PENDING" } }),
    db.orderDesign.count({ where: { shop, status: { in: ["PENDING", "IN_PRODUCTION"] } } }),
    db.orderDesign.count({ where: { shop, productionFileStatus: "FAILED", status: { in: ["PENDING", "IN_PRODUCTION"] } } }),
  ]);

  return { shop, designs, readyDesigns, queuedMockups, pendingReviews, production, failedProduction };
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  return (
    <s-page heading="Operations">
      {data.failedProduction > 0 && (
        <s-banner tone="critical" heading={`${data.failedProduction} production file${data.failedProduction === 1 ? "" : "s"} failed`}>
          Open the <s-link href="/app/production">production queue</s-link> to review and retry.
        </s-banner>
      )}

      <s-section heading="Current activity">
        <s-stack direction="block" gap="base">
          <s-text color="subdued">{data.shop}</s-text>
          <AdminMetricStrip
            metrics={[
              { label: "Production queue", value: data.production, href: "/app/production" },
              { label: "Mockups running", value: data.queuedMockups, href: "/app/mockups" },
              { label: "Reviews pending", value: data.pendingReviews, href: "/app/reviews" },
              { label: "Designs", value: data.designs, href: "/app/designs", detail: `${data.readyDesigns} ready` },
            ]}
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
