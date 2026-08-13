import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";

import db from "../db.server";
import { safeProductionError } from "../services/production-file-identity";
import { queueProductionWork } from "../services/production-worker.server";
import { authenticate } from "../shopify.server";

const FILE_STATUS_LABELS = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  READY: "Ready",
  FAILED: "Failed",
} as const;

const FILE_STATUS_TONES = {
  PENDING: "neutral",
  PROCESSING: "info",
  READY: "success",
  FAILED: "critical",
} as const;

const PRODUCTION_STATUS_LABELS = {
  PENDING: "Queued",
  IN_PRODUCTION: "In production",
  FULFILLED: "Complete",
  CANCELLED: "Cancelled",
} as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [orders, pending, processing, ready, failed] = await db.$transaction([
    db.orderDesign.findMany({
      where: { shop, status: { in: ["PENDING", "IN_PRODUCTION"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        orderId: true,
        lineItemId: true,
        quantity: true,
        sheetWidthMm: true,
        sheetHeightMm: true,
        artworkCount: true,
        productionFileStatus: true,
        productionFileUrl: true,
        productionFileName: true,
        productionFileByteSize: true,
        productionFileSha256: true,
        productionFileMinDpi: true,
        productionFileAttempts: true,
        productionFileError: true,
        productionFileLastAttemptAt: true,
        productionFileReadyAt: true,
        status: true,
        createdAt: true,
        design: { select: { publicId: true } },
      },
    }),
    db.orderDesign.count({ where: { shop, productionFileStatus: "PENDING" } }),
    db.orderDesign.count({ where: { shop, productionFileStatus: "PROCESSING" } }),
    db.orderDesign.count({ where: { shop, productionFileStatus: "READY", status: { in: ["PENDING", "IN_PRODUCTION"] } } }),
    db.orderDesign.count({ where: { shop, productionFileStatus: "FAILED" } }),
  ]);

  return {
    shop,
    counts: { pending, processing, ready, failed },
    orders: orders.map((order) => ({
      ...order,
      sheetWidthMm: order.sheetWidthMm === null ? null : Number(order.sheetWidthMm),
      sheetHeightMm: order.sheetHeightMm === null ? null : Number(order.sheetHeightMm),
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") || "").slice(0, 128);
  const intent = String(form.get("intent") || "");
  if (!id) return data({ ok: false, message: "Production queue item is required." }, { status: 400 });

  try {
    if (intent === "retry") {
      const changed = await db.orderDesign.updateMany({
        where: { id, shop: session.shop, productionFileStatus: { in: ["PENDING", "FAILED"] } },
        data: { productionFileStatus: "PENDING", productionFileError: null, productionFileLockedAt: null },
      });
      if (!changed.count) return data({ ok: false, message: "The production file is already being processed or ready." }, { status: 409 });
      queueProductionWork();
      return { ok: true, message: "Production file queued." };
    }
    if (intent === "start") {
      const changed = await db.orderDesign.updateMany({
        where: { id, shop: session.shop, productionFileStatus: "READY", status: "PENDING" },
        data: { status: "IN_PRODUCTION" },
      });
      if (!changed.count) return data({ ok: false, message: "Only ready queue items can enter production." }, { status: 409 });
      return { ok: true, message: "Order line moved to production." };
    }
    if (intent === "complete") {
      const changed = await db.orderDesign.updateMany({
        where: { id, shop: session.shop, productionFileStatus: "READY", status: "IN_PRODUCTION" },
        data: { status: "FULFILLED" },
      });
      if (!changed.count) return data({ ok: false, message: "Only active production items can be completed." }, { status: 409 });
      return { ok: true, message: "Order line marked complete." };
    }
    return data({ ok: false, message: "Unknown production action." }, { status: 400 });
  } catch (error) {
    return data({ ok: false, message: safeProductionError(error) }, { status: 502 });
  }
}

export default function ProductionQueue() {
  const { shop, counts, orders } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <s-page heading="Production queue">
      {actionData && (
        <s-banner tone={actionData.ok ? "success" : "critical"} heading={actionData.ok ? "Updated" : "Action failed"}>
          {actionData.message}
        </s-banner>
      )}
      {counts.failed > 0 && (
        <s-banner tone="critical" heading={`${counts.failed} production file${counts.failed === 1 ? "" : "s"} failed`}>
          Review the error in the queue and retry after correcting the cause.
        </s-banner>
      )}

      <s-section>
        <s-stack direction="inline" gap="base">
          <QueueCount label="Ready" value={counts.ready} />
          <QueueCount label="Pending" value={counts.pending} />
          <QueueCount label="Processing" value={counts.processing} />
          <QueueCount label="Failed" value={counts.failed} />
        </s-stack>
      </s-section>

      <s-section>
        {!orders.length ? <s-paragraph>No paid configurator orders are waiting for production.</s-paragraph> : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header listSlot="secondary">Sheet</s-table-header>
              <s-table-header listSlot="labeled">File</s-table-header>
              <s-table-header listSlot="labeled">Production</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((order) => {
                const orderNumber = resourceId(order.orderId);
                const lineNumber = resourceId(order.lineItemId);
                const dimensions = order.sheetWidthMm && order.sheetHeightMm
                  ? `${formatMm(order.sheetWidthMm)} × ${formatMm(order.sheetHeightMm)} mm`
                  : "Not recorded";
                return (
                  <s-table-row key={order.id}>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <s-link href={`https://${shop}/admin/orders/${orderNumber}`} target="_top">Order {orderNumber}</s-link>
                        <s-text color="subdued">Line {lineNumber} · {order.quantity} copies · {order.design.publicId}</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <s-text>{dimensions}</s-text>
                        <s-text color="subdued">{order.artworkCount ?? 0} artworks</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <s-badge tone={FILE_STATUS_TONES[order.productionFileStatus]}>{FILE_STATUS_LABELS[order.productionFileStatus]}</s-badge>
                        {order.productionFileUrl && <s-link href={order.productionFileUrl} target="_blank">Open PDF</s-link>}
                        {order.productionFileMinDpi && (
                          <s-text tone={order.productionFileMinDpi < 300 ? "caution" : "neutral"}>
                            Minimum {order.productionFileMinDpi} DPI
                          </s-text>
                        )}
                        {order.productionFileError && <s-text tone="critical">{order.productionFileError}</s-text>}
                        <s-text color="subdued">{order.productionFileAttempts} attempt{order.productionFileAttempts === 1 ? "" : "s"}</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={order.status === "FULFILLED" ? "success" : order.status === "IN_PRODUCTION" ? "info" : "neutral"}>
                        {PRODUCTION_STATUS_LABELS[order.status]}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        {order.productionFileStatus === "FAILED" && <QueueAction id={order.id} intent="retry" label="Retry" busy={busy} />}
                        {order.productionFileStatus === "PENDING" && <QueueAction id={order.id} intent="retry" label="Generate" busy={busy} />}
                        {order.productionFileStatus === "READY" && order.status === "PENDING" && <QueueAction id={order.id} intent="start" label="Start" busy={busy} />}
                        {order.productionFileStatus === "READY" && order.status === "IN_PRODUCTION" && <QueueAction id={order.id} intent="complete" label="Complete" busy={busy} />}
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

function resourceId(value: string) {
  return value.split("/").pop() || value;
}

function formatMm(value: number) {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function QueueCount({ label, value }: { label: string; value: number }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-heading>{value.toLocaleString()}</s-heading>
      <s-text color="subdued">{label}</s-text>
    </s-box>
  );
}

function QueueAction({ id, intent, label, busy }: { id: string; intent: string; label: string; busy: boolean }) {
  return (
    <Form method="post">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
      <s-button type="submit" variant="secondary" disabled={busy}>{label}</s-button>
    </Form>
  );
}
