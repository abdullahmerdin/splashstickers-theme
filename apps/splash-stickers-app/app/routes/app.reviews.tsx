import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation } from "react-router";

import { AdminEmptyState, AdminStatusBadge, formatAdminDateTime, resourceId } from "../components/admin/AdminUi";
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
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const activeReviewId = String(navigation.formData?.get("id") || "");
  const activeIntent = String(navigation.formData?.get("intent") || "");

  return (
    <s-page heading="Reviews">
      <s-section>
        {!reviews.length ? (
          <AdminEmptyState>No customer review has been submitted yet.</AdminEmptyState>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Review</s-table-header>
              <s-table-header listSlot="secondary" format="numeric">Rating</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Product</s-table-header>
              <s-table-header listSlot="labeled">Submitted</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {reviews.map((review) => (
                <s-table-row key={review.publicId}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">{review.title || "Untitled review"}</s-text>
                      <s-paragraph color="subdued" lineClamp={2}>{review.body}</s-paragraph>
                      {review.authorName && <s-text color="subdued">{review.authorName}</s-text>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><s-text fontVariantNumeric="tabular-nums">{review.rating} / 5</s-text></s-table-cell>
                  <s-table-cell><AdminStatusBadge kind="review" status={review.status} /></s-table-cell>
                  <s-table-cell>{resourceId(review.productId)}</s-table-cell>
                  <s-table-cell>{formatAdminDateTime(review.createdAt)}</s-table-cell>
                  <s-table-cell>
                    {review.status === "PENDING" ? (
                      <s-stack direction="inline" gap="small-200">
                        <ModerationForm
                          id={review.publicId}
                          intent="approve"
                          label="Approve"
                          variant="primary"
                          disabled={busy}
                          loading={activeReviewId === review.publicId && activeIntent === "approve"}
                        />
                        <ModerationForm
                          id={review.publicId}
                          intent="reject"
                          label="Reject"
                          tone="critical"
                          disabled={busy}
                          loading={activeReviewId === review.publicId && activeIntent === "reject"}
                        />
                      </s-stack>
                    ) : (
                      <s-text color="subdued">Moderated</s-text>
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

function ModerationForm({
  id,
  intent,
  label,
  variant = "secondary",
  tone = "neutral",
  disabled = false,
  loading = false,
}: {
  id: string;
  intent: "approve" | "reject";
  label: string;
  variant?: "primary" | "secondary";
  tone?: "neutral" | "critical";
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Form method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <s-button type="submit" variant={variant} tone={tone} disabled={disabled} loading={loading}>{label}</s-button>
    </Form>
  );
}
