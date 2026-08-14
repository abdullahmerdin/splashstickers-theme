import type { ReactNode } from "react";

type StatusTone = "neutral" | "info" | "success" | "caution" | "critical";
type StatusKind = "design" | "mockup" | "review" | "production" | "productionFile";

type StatusPresentation = {
  label: string;
  tone: StatusTone;
};

const STATUS_PRESENTATIONS: Record<StatusKind, Record<string, StatusPresentation>> = {
  design: {
    DRAFT: { label: "Draft", tone: "neutral" },
    READY: { label: "Ready", tone: "success" },
    ARCHIVED: { label: "Archived", tone: "neutral" },
  },
  mockup: {
    QUEUED: { label: "Queued", tone: "neutral" },
    PROCESSING: { label: "Processing", tone: "info" },
    READY: { label: "Ready", tone: "success" },
    FAILED: { label: "Failed", tone: "critical" },
  },
  review: {
    PENDING: { label: "Pending", tone: "caution" },
    APPROVED: { label: "Approved", tone: "success" },
    REJECTED: { label: "Rejected", tone: "critical" },
  },
  production: {
    PENDING: { label: "Queued", tone: "neutral" },
    IN_PRODUCTION: { label: "In production", tone: "info" },
    FULFILLED: { label: "Complete", tone: "success" },
    CANCELLED: { label: "Cancelled", tone: "critical" },
  },
  productionFile: {
    PENDING: { label: "Pending", tone: "neutral" },
    PROCESSING: { label: "Processing", tone: "info" },
    READY: { label: "Ready", tone: "success" },
    FAILED: { label: "Failed", tone: "critical" },
  },
};

type Metric = {
  label: string;
  value: number;
  href?: string;
  detail?: string;
};

export function AdminMetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <s-stack direction="inline" gap="large-100">
        {metrics.map((metric) => (
          <s-stack key={metric.label} direction="block" gap="small-100" minInlineSize="120px">
            <s-text type="strong" fontVariantNumeric="tabular-nums">{metric.value.toLocaleString()}</s-text>
            {metric.href ? <s-link href={metric.href}>{metric.label}</s-link> : <s-text>{metric.label}</s-text>}
            {metric.detail && <s-text color="subdued">{metric.detail}</s-text>}
          </s-stack>
        ))}
      </s-stack>
    </s-box>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return (
    <s-box padding="large" borderWidth="base" borderRadius="base" background="subdued">
      <s-paragraph color="subdued">{children}</s-paragraph>
    </s-box>
  );
}

export function AdminStatusBadge({ kind, status }: { kind: StatusKind; status: string }) {
  const presentation = getAdminStatusPresentation(kind, status);
  return <s-badge tone={presentation.tone}>{presentation.label}</s-badge>;
}

export function getAdminStatusPresentation(kind: StatusKind, status: string): StatusPresentation {
  return STATUS_PRESENTATIONS[kind][status] ?? {
    label: formatAdminLabel(status),
    tone: "neutral",
  };
}

export function formatAdminDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function resourceId(value: string) {
  return value.split("/").pop() || value;
}

export function formatAdminLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}
