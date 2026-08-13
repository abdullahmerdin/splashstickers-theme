import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [designs, readyDesigns, queuedMockups, pendingReviews, production] = await db.$transaction([
    db.design.count({ where: { shop } }),
    db.design.count({ where: { shop, status: "READY" } }),
    db.mockup.count({ where: { shop, status: { in: ["QUEUED", "PROCESSING"] } } }),
    db.review.count({ where: { shop, status: "PENDING" } }),
    db.orderDesign.count({ where: { shop, status: { in: ["PENDING", "IN_PRODUCTION"] } } }),
  ]);

  return { shop, designs, readyDesigns, queuedMockups, pendingReviews, production };
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  return (
    <s-page heading="Splash Gangsheet Builder">
      <s-section heading={data.shop}>
        <s-stack direction="inline" gap="base">
          <Metric label="Designs" value={data.designs} href="/app/designs" />
          <Metric label="Ready" value={data.readyDesigns} href="/app/designs" />
          <Metric label="Mockup queue" value={data.queuedMockups} href="/app/mockups" />
          <Metric label="Reviews pending" value={data.pendingReviews} href="/app/reviews" />
          <Metric label="Production queue" value={data.production} href="/app/production" />
        </s-stack>
      </s-section>

      <s-section heading="Deployment gates">
        <s-unordered-list>
          <s-list-item>Set the hosted app URL and app proxy URL before production deploy.</s-list-item>
          <s-list-item>Add the Reviews app block to the product template.</s-list-item>
          <s-list-item>Add the Mockup Studio app block to its dedicated page template.</s-list-item>
          <s-list-item>Apply database migrations before deploying this release.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function Metric({ label, value, href }: { label: string; value: number; href?: string }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-heading>{value.toLocaleString()}</s-heading>
      {href ? <s-link href={href}>{label}</s-link> : <s-text>{label}</s-text>}
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
