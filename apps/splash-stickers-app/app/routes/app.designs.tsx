import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

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
      productId: true,
      variantId: true,
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
        <RecordTable
          empty="No storefront design has been saved yet."
          headings={["Design", "Status", "Assets", "Mockups", "Orders", "Updated"]}
          rows={designs.map((design) => [
            design.publicId,
            design.status,
            String(design._count.assets),
            String(design._count.mockups),
            String(design._count.orders),
            new Date(design.updatedAt).toLocaleString(),
          ])}
        />
      </s-section>
    </s-page>
  );
}

function RecordTable({ headings, rows, empty }: { headings: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <s-paragraph>{empty}</s-paragraph>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead><tr>{headings.map((heading) => <th key={heading} style={{ padding: 10 }}>{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((value, index) => <td key={`${row[0]}-${headings[index]}`} style={{ borderTop: "1px solid #ddd", padding: 10 }}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
