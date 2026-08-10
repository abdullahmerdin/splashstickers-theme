import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData } from "react-router";

import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const reviews = await db.review.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return { reviews };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const publicId = String(form.get("id") || "").slice(0, 128);
  const intent = form.get("intent");
  if (!publicId || (intent !== "approve" && intent !== "reject")) return null;

  await db.review.updateMany({
    where: { shop: session.shop, publicId },
    data: { status: intent === "approve" ? "APPROVED" : "REJECTED" },
  });
  return null;
}

export default function Reviews() {
  const { reviews } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Reviews">
      <s-section>
        {!reviews.length ? <s-paragraph>No customer review has been submitted yet.</s-paragraph> : (
          <s-stack direction="block" gap="base">
            {reviews.map((review) => (
              <s-box key={review.publicId} padding="base" borderWidth="base" borderRadius="base">
                <s-heading>{review.rating}/5 {review.title || "Review"}</s-heading>
                <s-paragraph>{review.body}</s-paragraph>
                <s-paragraph>Status: {review.status} · Product: {review.productId}</s-paragraph>
                {review.status === "PENDING" && (
                  <s-stack direction="inline" gap="base">
                    <ModerationForm id={review.publicId} intent="approve" label="Approve" />
                    <ModerationForm id={review.publicId} intent="reject" label="Reject" />
                  </s-stack>
                )}
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

function ModerationForm({ id, intent, label }: { id: string; intent: string; label: string }) {
  return (
    <Form method="post">
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="intent" value={intent}>{label}</button>
    </Form>
  );
}
