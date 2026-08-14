import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Form, useActionData, useLoaderData, useNavigation } from "react-router";

import { AdminEmptyState, formatAdminDateTime } from "../components/admin/AdminUi";
import { parseBasePriceCents, parseUnitPricingTiers, type PricingMethodValue } from "../lib/pricing-policy";
import { listPricingPolicies, savePricingPolicy } from "../services/pricing-policies.server";
import { listAdminProducts, resolveAdminProduct, type AdminProduct } from "../services/products.server";
import { authenticate } from "../shopify.server";

type TierDraft = { key: string; threshold: string; price: string };
type PolicyDraft = {
  productId: string;
  productTitle: string;
  method: PricingMethodValue;
  currency: string;
  basePrice: string;
  tiers: TierDraft[];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const [{ currency, products }, policies] = await Promise.all([
    listAdminProducts(admin),
    listPricingPolicies(session.shop),
  ]);
  const policyByProduct = new Map(policies.map((policy) => [policy.productId, policy]));
  return {
    currency,
    products: products.map((product) => {
      const policy = policyByProduct.get(product.id);
      return {
        ...product,
        policy: policy ? {
          method: policy.method,
          currency: policy.currency,
          baseWidthMm: policy.baseWidthMm,
          baseLengthMm: policy.baseLengthMm,
          basePriceCents: policy.basePriceCents,
          updatedAt: policy.updatedAt,
          tiers: policy.tiers.map((tier) => ({ threshold: tier.threshold, priceCents: tier.priceCents })),
        } : null,
      };
    }),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const productId = String(form.get("productId") || "").slice(0, 128);
  const method = String(form.get("method") || "") as PricingMethodValue;
  if (method !== "AREA" && method !== "UNIT") {
    return data({ ok: false, productId, message: "Choose area or quantity pricing." }, { status: 422 });
  }

  try {
    const product = await resolveAdminProduct(admin, productId);
    const basePriceCents = method === "AREA" ? parseBasePriceCents(form.get("basePrice")) : null;
    const rawTiers = JSON.parse(String(form.get("tiers") || "[]")) as unknown;
    const tiers = method === "UNIT" ? parseUnitPricingTiers(rawTiers) : [];
    await savePricingPolicy({
      shop: session.shop,
      productId: product.id,
      method,
      currency: product.currency,
      basePriceCents,
      tiers,
    });
    return { ok: true, productId, message: "Pricing policy saved." };
  } catch (error) {
    return data({
      ok: false,
      productId,
      message: error instanceof Error ? error.message : "The pricing policy could not be saved.",
    }, { status: 422 });
  }
}

export default function Pricing() {
  const { products, currency } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const modalRef = useRef<HTMLElementTagNameMap["s-modal"]>(null);
  const [draft, setDraft] = useState<PolicyDraft | null>(null);
  const busy = navigation.state !== "idle";
  const draftProductId = draft?.productId;

  useEffect(() => {
    if (draftProductId) modalRef.current?.showOverlay();
  }, [draftProductId]);

  useEffect(() => {
    if (!actionData?.ok) return undefined;
    modalRef.current?.hideOverlay();
    const timeout = window.setTimeout(() => setDraft(null), 0);
    return () => window.clearTimeout(timeout);
  }, [actionData]);

  function openPolicy(product: (typeof products)[number]) {
    const policy = product.policy;
    setDraft({
      productId: product.id,
      productTitle: product.title,
      method: policy?.method || "AREA",
      currency: policy?.currency || currency,
      basePrice: policy?.basePriceCents ? centsToInput(policy.basePriceCents) : "2.00",
      tiers: policy?.method === "UNIT" && policy.tiers.length
        ? policy.tiers.map((tier) => ({ key: tierKey(), threshold: String(tier.threshold), price: centsToInput(tier.priceCents) }))
        : [{ key: tierKey(), threshold: "1", price: "" }],
    });
  }

  return (
    <s-page heading="Pricing">
      {actionData?.ok && (
        <s-banner tone="success" heading="Saved">
          {actionData.message}
        </s-banner>
      )}
      <s-section>
        {!products.length ? (
          <AdminEmptyState>No Shopify products were found.</AdminEmptyState>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Product</s-table-header>
              <s-table-header listSlot="secondary">Status</s-table-header>
              <s-table-header listSlot="labeled">Policy</s-table-header>
              <s-table-header listSlot="labeled">Tiers</s-table-header>
              <s-table-header>Action</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {products.map((product) => (
                <s-table-row key={product.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">{product.title}</s-text>
                      {product.productType && <s-text color="subdued">{product.productType}</s-text>}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell><ProductStatus status={product.status} /></s-table-cell>
                  <s-table-cell>
                    {product.policy ? (
                      <s-stack direction="block" gap="small-100">
                        <s-text>{product.policy.method === "AREA" ? "By area / 60 x 100 cm base" : "By quantity"}</s-text>
                        <s-text color="subdued">Updated {formatAdminDateTime(product.policy.updatedAt)}</s-text>
                      </s-stack>
                    ) : <s-text color="subdued">Not configured</s-text>}
                  </s-table-cell>
                  <s-table-cell>{product.policy?.tiers.length || 0}</s-table-cell>
                  <s-table-cell>
                    <s-button variant="secondary" onClick={() => openPolicy(product)}>
                      {product.policy ? "Edit" : "Configure"}
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {draft && (
        <Form method="post">
          <input type="hidden" name="productId" value={draft.productId} />
          <input type="hidden" name="method" value={draft.method} />
          <input type="hidden" name="basePrice" value={draft.basePrice} />
          <input type="hidden" name="tiers" value={JSON.stringify(draft.tiers.map((tier) => ({ threshold: tier.threshold, price: tier.price })))} />
          <s-modal
            ref={modalRef}
            heading={draft.productTitle}
            accessibilityLabel={`Pricing policy for ${draft.productTitle}`}
            size="large"
            onHide={() => { if (!busy) setDraft(null); }}
          >
            <s-stack direction="block" gap="base">
              {actionData && !actionData.ok && actionData.productId === draft.productId && (
                <s-banner tone="critical" heading="Check the pricing tiers">{actionData.message}</s-banner>
              )}
              <s-select
                label="Pricing method"
                value={draft.method}
                disabled={busy}
                onChange={(event) => changeMethod(event.currentTarget.value as PricingMethodValue)}
              >
                <s-option value="AREA">By area</s-option>
                <s-option value="UNIT">By quantity</s-option>
              </s-select>
              {draft.method === "AREA" ? (
                <s-stack direction="block" gap="small-200">
                  <s-money-field
                    label={`Price for 60 x 100 cm (${draft.currency})`}
                    value={draft.basePrice}
                    min={0.01}
                    disabled={busy}
                    onInput={(event) => setDraft((current) => current ? { ...current, basePrice: event.currentTarget.value } : current)}
                  />
                  <s-text color="subdued">Smaller sheets keep this minimum price. Larger sheets scale proportionally by area.</s-text>
                </s-stack>
              ) : (
                <>
                  <s-stack direction="block" gap="small-300">
                    {draft.tiers.map((tier, index) => (
                      <s-box key={tier.key} padding="base" borderWidth="base" borderRadius="base">
                        <s-stack direction="inline" gap="base">
                          <s-number-field
                            label="Minimum quantity"
                            value={tier.threshold}
                            min={1}
                            step={1}
                            inputMode="numeric"
                            disabled={busy}
                            onInput={(event) => updateTier(index, { threshold: event.currentTarget.value })}
                          />
                          <s-money-field
                            label={`Unit price (${draft.currency})`}
                            value={tier.price}
                            min={0.01}
                            disabled={busy}
                            onInput={(event) => updateTier(index, { price: event.currentTarget.value })}
                          />
                          <s-button
                            variant="secondary"
                            tone="critical"
                            type="button"
                            disabled={busy || draft.tiers.length === 1}
                            accessibilityLabel={`Remove tier ${index + 1}`}
                            onClick={() => removeTier(index)}
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      </s-box>
                    ))}
                  </s-stack>
                  <s-button type="button" variant="secondary" disabled={busy || draft.tiers.length >= 100} onClick={addTier}>Add tier</s-button>
                </>
              )}
            </s-stack>
            <s-button slot="secondary-actions" type="button" variant="secondary" disabled={busy} onClick={() => modalRef.current?.hideOverlay()}>Cancel</s-button>
            <s-button slot="primary-action" variant="primary" type="submit" loading={busy}>Save</s-button>
          </s-modal>
        </Form>
      )}
    </s-page>
  );

  function changeMethod(method: PricingMethodValue) {
    setDraft((current) => current ? {
      ...current,
      method,
      basePrice: method === "AREA" && !current.basePrice ? "2.00" : current.basePrice,
      tiers: method === "UNIT" && !current.tiers.length
        ? [{ key: tierKey(), threshold: "1", price: "" }]
        : current.tiers,
    } : current);
  }

  function updateTier(index: number, patch: Partial<Pick<TierDraft, "threshold" | "price">>) {
    setDraft((current) => current ? {
      ...current,
      tiers: current.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier),
    } : current);
  }

  function addTier() {
    setDraft((current) => current ? {
      ...current,
      tiers: [...current.tiers, { key: tierKey(), threshold: "", price: "" }],
    } : current);
  }

  function removeTier(index: number) {
    setDraft((current) => current && current.tiers.length > 1 ? {
      ...current,
      tiers: current.tiers.filter((_, tierIndex) => tierIndex !== index),
    } : current);
  }
}

function ProductStatus({ status }: { status: AdminProduct["status"] }) {
  const tone = status === "ACTIVE" ? "success" : status === "UNLISTED" ? "info" : status === "DRAFT" ? "caution" : "neutral";
  const label = status[0] + status.slice(1).toLowerCase();
  return <s-badge tone={tone}>{label}</s-badge>;
}

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

function tierKey() {
  return globalThis.crypto?.randomUUID?.() || `tier-${Date.now()}-${Math.random()}`;
}
