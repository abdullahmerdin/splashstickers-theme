import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { WorkbenchShell } from "../components/workbench/WorkbenchShell";
import { requireAppProxy } from "../services/app-proxy.server";
import { resolveBuilderProduct, type BuilderProduct } from "../services/products.server";
import stylesheet from "../styles/gangsheet-builder.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];
export const meta: MetaFunction = () => [{ title: "Splash Gangsheet Builder" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  const variantId = new URL(request.url).searchParams.get("variant") || "";
  if (!admin) return { shop, product: null, error: "Splash Gangsheet Builder is not available for this shop." };
  try {
    return { shop, product: await resolveBuilderProduct(admin, variantId), error: null };
  } catch (error) {
    return { shop, product: null, error: error instanceof Error ? error.message : "The gangsheet product could not be loaded." };
  }
}

type UploadState = "uploading" | "ready" | "error";
type BuilderItem = {
  id: string;
  name: string;
  previewUrl: string;
  assetRef?: string;
  uploadState: UploadState;
  uploadError?: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
};
type ProposalOperation = {
  id: string;
  kind: "arrange" | "gap" | "background" | "remove";
  label: string;
  before: string;
  after: string;
  value?: string | number;
  accepted: boolean;
};

const PROXY_BASE = "/apps/splash-stickers/";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function GangsheetBuilderRoute() {
  const { product, error } = useLoaderData<typeof loader>();
  if (!product) return <BuilderUnavailable message={error || "Choose a gangsheet product to continue."} />;
  return <GangsheetBuilder product={product} />;
}

function BuilderUnavailable({ message }: { message: string }) {
  return <main className="gb-unavailable"><div><h1>Splash Gangsheet Builder</h1><p>{message}</p><a href="/">Return to store</a></div></main>;
}

export function GangsheetBuilder({ product, previewItems = [], previewMode = false }: { product: BuilderProduct; previewItems?: BuilderItem[]; previewMode?: boolean }) {
  const [items, setItems] = useState<BuilderItem[]>(previewItems);
  const [selectedId, setSelectedId] = useState<string | null>(previewItems[0]?.id || null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState({ widthMm: 600, heightMm: 400, gapMm: 3, background: "#ffffff" });
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(product.selectedVariantId);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "error" | "success">("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<ProposalOperation[]>([]);
  const [rightTab, setRightTab] = useState<"preview" | "diff">("preview");
  const [mode, setMode] = useState<"light" | "dark">(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const itemsRef = useRef<BuilderItem[]>([]);

  const selected = items.find((item) => item.id === selectedId) || null;
  const variant = product.variants.find((entry) => entry.legacyResourceId === variantId) || product.variants[0];
  const totalCents = (variant?.priceCents || 0) * quantity;
  const contextUsage = Math.min(100, Math.round((items.length / 500) * 100));
  const allUploadsReady = items.length > 0 && items.every((item) => item.uploadState === "ready" && item.assetRef);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => { itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)); }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem("splash-color-mode", next); } catch { /* Current page still updates. */ }
  }

  function announce(message: string, kind: "" | "error" | "success" = "") {
    setStatus(message); setStatusKind(kind);
  }

  async function addFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      if (!ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
        announce(`${file.name}: use a PNG, JPG or WebP file up to 25 MB.`, "error");
        continue;
      }
      const dimensions = await readImageDimensions(file);
      const widthMm = Math.min(150, Math.max(20, dimensions.width / 300 * 25.4));
      const heightMm = Math.min(150, Math.max(20, widthMm * dimensions.height / dimensions.width));
      const id = crypto.randomUUID();
      const item: BuilderItem = {
        id, name: file.name, previewUrl: URL.createObjectURL(file), uploadState: "uploading",
        xMm: sheet.gapMm, yMm: sheet.gapMm, widthMm: round(widthMm), heightMm: round(heightMm), rotation: 0,
      };
      setItems((current) => [...current, item]);
      setSelectedId(id);
      addHistory(`Added ${file.name}`);
      uploadArtwork(id, file);
    }
  }

  async function uploadArtwork(itemId: string, file: File) {
    try {
      announce(`Uploading ${file.name}…`);
      const stage = await postJson("uploads/stage", { filename: file.name, mimeType: file.type, fileSize: file.size });
      const form = new FormData();
      for (const parameter of stage.target.parameters as Array<{ name: string; value: string }>) form.append(parameter.name, parameter.value);
      form.append("file", file);
      const uploadResponse = await fetch(stage.target.url, { method: "POST", body: form });
      if (!uploadResponse.ok) throw new Error("Shopify did not accept the artwork upload.");
      const completed = await postJson("uploads/complete", {
        resourceUrl: stage.target.resourceUrl, filename: stage.filename, alt: file.name, uploadToken: stage.uploadToken,
      });
      await waitForFileReady(completed.file.id);
      setItems((current) => current.map((item) => item.id === itemId ? { ...item, assetRef: completed.file.id, uploadState: "ready", uploadError: undefined } : item));
      announce(`${file.name} is ready.`, "success");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Artwork upload failed.";
      setItems((current) => current.map((item) => item.id === itemId ? { ...item, uploadState: "error", uploadError: message } : item));
      announce(message, "error");
    }
  }

  async function waitForFileReady(id: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(`${PROXY_BASE}uploads/status?id=${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      const file = payload.files?.[0];
      if (file?.status === "READY") return;
      if (file?.status === "FAILED") throw new Error("Shopify could not process this artwork file.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Artwork processing took too long. Try the upload again.");
  }

  function addHistory(entry: string) { setHistory((current) => [entry, ...current].slice(0, 12)); }

  function updateSelected(patch: Partial<BuilderItem>) {
    if (!selectedId) return;
    setItems((current) => current.map((item) => item.id === selectedId ? constrainItem({ ...item, ...patch }, sheet) : item));
  }

  function removeItem(id: string) {
    const item = items.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setItems((current) => current.filter((entry) => entry.id !== id));
    setPinnedIds((current) => current.filter((entry) => entry !== id));
    if (selectedId === id) setSelectedId(null);
    addHistory(`Removed ${item?.name || "artwork"}`);
  }

  function arrange() {
    setItems((current) => autoArrange(current, sheet));
    addHistory("Auto-arranged artwork");
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>, item: BuilderItem) {
    if ((event.target as Element).closest("button")) return;
    setSelectedId(item.id);
    const canvas = event.currentTarget.parentElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { xMm: item.xMm, yMm: item.yMm };
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? constrainItem({
        ...candidate,
        xMm: initial.xMm + (move.clientX - startX) / rect.width * sheet.widthMm,
        yMm: initial.yMm + (move.clientY - startY) / rect.height * sheet.heightMm,
      }, sheet) : candidate));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      addHistory(`Moved ${item.name}`);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function createProposal() {
    const value = prompt.trim();
    if (!value) return;
    const operations: ProposalOperation[] = [];
    if (/arrange|yerleştir|düzenle/i.test(value)) operations.push(operation("arrange", "Auto-arrange artwork", "Current positions", "Packed with current gap"));
    const gapAfterLabel = value.match(/(?:gap|boşluk)[^0-9]*(\d+(?:\.\d+)?)/i);
    const gapBeforeLabel = value.match(/(\d+(?:\.\d+)?)\s*(?:mm\s*)?(?:gap|boşluk)/i);
    const gapValue = Number(gapAfterLabel?.[1] || gapBeforeLabel?.[1]);
    if (gapValue >= 0) operations.push(operation("gap", "Change artwork gap", `${sheet.gapMm} mm`, `${Math.min(50, gapValue)} mm`, Math.min(50, gapValue)));
    const color = value.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i);
    if (color && /background|zemin|arka plan/i.test(value)) operations.push(operation("background", "Change sheet background", sheet.background, color[0], color[0]));
    if (/remove selected|delete selected|seçileni sil/i.test(value) && selected) operations.push(operation("remove", `Remove ${selected.name}`, "On sheet", "Removed", selected.id));
    if (!operations.length) {
      announce("Try “arrange”, “set gap to 5”, “background #ffffff”, or “remove selected”.", "error");
      return;
    }
    setProposal(operations);
    setRightTab("diff");
    addHistory(value);
    announce("Change proposal is ready for review.");
  }

  function applyProposal() {
    const accepted = proposal.filter((entry) => entry.accepted);
    const nextSheet = { ...sheet };
    for (const entry of accepted) {
      if (entry.kind === "gap") nextSheet.gapMm = Number(entry.value);
      if (entry.kind === "background") nextSheet.background = String(entry.value);
    }
    const removedIds = new Set(accepted.filter((entry) => entry.kind === "remove").map((entry) => String(entry.value)));
    let nextItems = items.filter((item) => !removedIds.has(item.id));
    items.filter((item) => removedIds.has(item.id)).forEach((item) => URL.revokeObjectURL(item.previewUrl));
    if (accepted.some((entry) => entry.kind === "arrange")) nextItems = autoArrange(nextItems, nextSheet);
    setSheet(nextSheet);
    setItems(nextItems);
    setPinnedIds((current) => current.filter((id) => !removedIds.has(id)));
    if (selectedId && removedIds.has(selectedId)) setSelectedId(null);
    addHistory(`Applied ${accepted.length} proposed change${accepted.length === 1 ? "" : "s"}`);
    setProposal([]);
    setPrompt("");
    setRightTab("preview");
    announce("Selected changes applied.", "success");
  }

  async function addToCart() {
    if (!allUploadsReady || busy || !variant?.available) return;
    setBusy(true);
    try {
      announce("Saving design…");
      const manifest = {
        schemaVersion: "1.0",
        sheet: { widthMm: sheet.widthMm, heightMm: sheet.heightMm, unit: "mm", gapMm: sheet.gapMm, background: sheet.background },
        quantity: 1,
        items: items.map((item, index) => ({
          id: item.id, kind: "image", assetRef: item.assetRef,
          placement: { xMm: round(item.xMm), yMm: round(item.yMm), widthMm: round(item.widthMm), heightMm: round(item.heightMm),
            rotation: round(item.rotation), flipX: false, flipY: false, zIndex: index },
        })),
      };
      const saved = await postJson("designs", { manifest, productId: product.id, variantId: variant.id });
      announce("Preparing Shopify cart…");
      const finalized = await postJson("purchase-intents", { designId: saved.design.publicId, digest: saved.design.digest, variantId: variant.legacyResourceId });
      const cartResponse = await fetch("/cart/add.js", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{
          id: Number(variant.legacyResourceId), quantity,
          properties: {
            "Design ID": saved.design.publicId,
            "Artwork count": String(items.length),
            "Sheet size": `${sheet.widthMm} × ${sheet.heightMm} mm`,
            "_splash_gangsheet": "1",
            "_splash_handoff": finalized.handoff.reference,
            "_splash_claim": finalized.handoff.claim,
            "_design_manifest_version": "1.0",
            "_design_digest": saved.design.digest.slice(0, 24),
          },
        }] }),
      });
      const cartPayload = await cartResponse.json().catch(() => ({}));
      if (!cartResponse.ok) throw new Error(cartPayload.description || "Shopify could not add the gangsheet to cart.");
      announce("Added to cart.", "success");
      window.location.assign("/cart");
    } catch (purchaseError) {
      announce(purchaseError instanceof Error ? purchaseError.message : "The gangsheet could not be added to cart.", "error");
      setBusy(false);
    }
  }

  const contextPanel = <>
    <section className="wb-section"><div className="wb-section__heading"><h2>Artwork</h2><label className="gb-upload">Add files<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} /></label></div>
      {items.length ? <ul className="gb-file-tree">{items.map((item) => <li key={item.id} data-selected={item.id === selectedId || undefined}>
        <button className="gb-file" type="button" onClick={() => setSelectedId(item.id)}><span aria-hidden="true">▧</span><span><strong>{item.name}</strong><small data-state={item.uploadState}>{uploadLabel(item)}</small></span></button>
        <button className="wb-icon-button" type="button" aria-label={`${pinnedIds.includes(item.id) ? "Unpin" : "Pin"} ${item.name}`} aria-pressed={pinnedIds.includes(item.id)} onClick={() => setPinnedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>⌖</button>
      </li>)}</ul> : <p className="wb-empty">Add print-ready artwork to begin.</p>}
    </section>
    <section className="wb-section"><h2>Context</h2><div className="gb-context-meter"><span>Builder context</span><strong>{items.length}/500</strong><progress max="100" value={contextUsage}>{contextUsage}%</progress></div>
      {pinnedIds.length ? <p className="wb-meta">{pinnedIds.length} pinned asset{pinnedIds.length === 1 ? "" : "s"}</p> : null}
    </section>
    <section className="wb-section"><h2>History</h2>{history.length ? <ol className="gb-history">{history.map((entry, index) => <li key={`${entry}-${index}`}><span>{entry}</span><button type="button" onClick={() => { setPrompt(entry); textareaRef.current?.focus(); }}>Edit</button></li>)}</ol> : <p className="wb-empty">Changes appear here.</p>}</section>
  </>;

  const previewPanel = <>
    <div className="wb-tabs" role="tablist" aria-label="Preview panels">
      <button type="button" role="tab" aria-selected={rightTab === "preview"} onClick={() => setRightTab("preview")}>Live preview</button>
      <button type="button" role="tab" aria-selected={rightTab === "diff"} onClick={() => setRightTab("diff")}>Diff{proposal.length ? ` (${proposal.length})` : ""}</button>
    </div>
    {rightTab === "preview" ? <div role="tabpanel" className="wb-section"><Preview sheet={sheet} items={items} /><Inspector selected={selected} sheet={sheet} onChange={updateSelected} onRemove={() => selected && removeItem(selected.id)} /></div> :
      <div role="tabpanel" className="wb-section"><ChangeReview proposal={proposal} setProposal={setProposal} onApply={applyProposal} onReject={() => { setProposal([]); announce("Proposal discarded."); }} /></div>}
    <PurchasePanel product={product} variantId={variantId} setVariantId={setVariantId} quantity={quantity} setQuantity={setQuantity}
      total={formatMoney(totalCents, product.currency)} disabled={previewMode || !allUploadsReady || busy || !variant?.available} busy={busy} onBuy={addToCart} />
  </>;

  return <WorkbenchShell title="Splash Gangsheet Builder" subtitle={product.title} context={contextPanel} preview={previewPanel}
    actions={<button suppressHydrationWarning className="wb-mode" type="button" onClick={toggleMode} aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} aria-pressed={mode === "dark"}>{mode === "dark" ? "Light" : "Dark"}</button>}>
    <div className="gb-stage-toolbar">
      <label>W <input type="number" min="100" max="2000" value={sheet.widthMm} onChange={(event) => setSheet({ ...sheet, widthMm: clamp(Number(event.target.value), 100, 2000) })} /> mm</label>
      <label>H <input type="number" min="100" max="2000" value={sheet.heightMm} onChange={(event) => setSheet({ ...sheet, heightMm: clamp(Number(event.target.value), 100, 2000) })} /> mm</label>
      <label>Gap <input type="number" min="0" max="50" value={sheet.gapMm} onChange={(event) => setSheet({ ...sheet, gapMm: clamp(Number(event.target.value), 0, 50) })} /> mm</label>
      <button type="button" onClick={arrange} disabled={!items.length}>Auto-arrange</button>
    </div>
    <div className="gb-canvas-wrap">
      <div className="gb-canvas" style={{ aspectRatio: `${sheet.widthMm} / ${sheet.heightMm}`, backgroundColor: sheet.background }} role="region" aria-label={`${sheet.widthMm} by ${sheet.heightMm} millimetre gangsheet`}>
        {items.map((item) => <div key={item.id} className="gb-canvas-item" data-selected={item.id === selectedId || undefined}
          style={{ left: `${item.xMm / sheet.widthMm * 100}%`, top: `${item.yMm / sheet.heightMm * 100}%`, width: `${item.widthMm / sheet.widthMm * 100}%`, height: `${item.heightMm / sheet.heightMm * 100}%`, transform: `rotate(${item.rotation}deg)` }}
          role="button" tabIndex={0} aria-label={`${item.name}. Select to edit.`} onPointerDown={(event) => onCanvasPointerDown(event, item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}>
          <img src={item.previewUrl} alt="" draggable={false} />
        </div>)}
        {!items.length ? <label className="gb-canvas-empty">Add artwork<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} /><span>PNG, JPG or WebP · 25 MB max</span></label> : null}
      </div>
    </div>
    <div className="gb-composer">
      <textarea ref={textareaRef} rows={1} value={prompt} aria-label="Describe a builder change" placeholder="Describe a change, for example: arrange with a 5 mm gap"
        onChange={(event) => setPrompt(event.target.value)} onInput={(event) => autoGrow(event.currentTarget)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") createProposal(); }} />
      <button type="button" onClick={createProposal} disabled={!prompt.trim()}>Review change</button>
    </div>
    <p className="gb-status" data-kind={statusKind || undefined} role="status" aria-live="polite">{status}</p>
    <div className="gb-mobile-buy wb-mobile-only"><span>{formatMoney(totalCents, product.currency)}</span><button type="button" disabled={previewMode || !allUploadsReady || busy || !variant?.available} onClick={addToCart}>{busy ? "Adding…" : "Add to cart"}</button></div>
  </WorkbenchShell>;
}

function Inspector({ selected, sheet, onChange, onRemove }: { selected: BuilderItem | null; sheet: { widthMm: number; heightMm: number }; onChange: (patch: Partial<BuilderItem>) => void; onRemove: () => void }) {
  if (!selected) return <p className="wb-empty">Select artwork to edit its placement.</p>;
  return <div className="gb-inspector"><div className="wb-section__heading"><h2>Selection</h2><button className="wb-danger-link" type="button" onClick={onRemove}>Remove</button></div>
    <p className="wb-meta">{selected.name}</p><div className="gb-field-grid">
      <NumberField label="X" value={selected.xMm} max={sheet.widthMm} onChange={(value) => onChange({ xMm: value })} />
      <NumberField label="Y" value={selected.yMm} max={sheet.heightMm} onChange={(value) => onChange({ yMm: value })} />
      <NumberField label="Width" value={selected.widthMm} max={sheet.widthMm} onChange={(value) => onChange({ widthMm: value })} />
      <NumberField label="Height" value={selected.heightMm} max={sheet.heightMm} onChange={(value) => onChange({ heightMm: value })} />
      <NumberField label="Rotation" value={selected.rotation} max={360} onChange={(value) => onChange({ rotation: value })} unit="°" />
    </div></div>;
}

function NumberField({ label, value, max, onChange, unit = "mm" }: { label: string; value: number; max: number; onChange: (value: number) => void; unit?: string }) {
  return <label><span>{label}</span><span><input type="number" min="0" max={max} step="1" value={round(value)} onChange={(event) => onChange(clamp(Number(event.target.value), 0, max))} /> {unit}</span></label>;
}

function PurchasePanel({ product, variantId, setVariantId, quantity, setQuantity, total, disabled, busy, onBuy }: {
  product: BuilderProduct; variantId: string; setVariantId: (value: string) => void; quantity: number; setQuantity: (value: number) => void;
  total: string; disabled: boolean; busy: boolean; onBuy: () => void;
}) {
  return <section className="gb-purchase"><h2>Order</h2><label><span>Sheet option</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
    {product.variants.map((variant) => <option key={variant.id} value={variant.legacyResourceId} disabled={!variant.available}>{variant.title} · {formatMoney(variant.priceCents, product.currency)}</option>)}</select></label>
    <label><span>Quantity</span><input type="number" min="1" max="999" value={quantity} onChange={(event) => setQuantity(clamp(Number(event.target.value), 1, 999))} /></label>
    <div className="gb-purchase__total"><span>Total</span><strong>{total}</strong></div>
    <button className="gb-buy" type="button" disabled={disabled} onClick={onBuy}>{busy ? "Adding…" : "Add to Shopify cart"}</button>
  </section>;
}

function Preview({ sheet, items }: { sheet: { widthMm: number; heightMm: number; background: string }; items: BuilderItem[] }) {
  return <svg className="gb-preview" viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} role="img" aria-label="Live gangsheet preview" style={{ background: sheet.background }}>
    {items.map((item) => <image key={item.id} href={item.previewUrl} x={item.xMm} y={item.yMm} width={item.widthMm} height={item.heightMm}
      preserveAspectRatio="xMidYMid meet" transform={`rotate(${item.rotation} ${item.xMm + item.widthMm / 2} ${item.yMm + item.heightMm / 2})`} />)}
  </svg>;
}

function ChangeReview({ proposal, setProposal, onApply, onReject }: { proposal: ProposalOperation[]; setProposal: (value: ProposalOperation[]) => void; onApply: () => void; onReject: () => void }) {
  if (!proposal.length) return <p className="wb-empty">Proposed changes appear here before they affect the sheet.</p>;
  return <div className="gb-diff"><h2>Proposed changes</h2><ul>{proposal.map((entry) => <li key={entry.id} data-accepted={entry.accepted || undefined}>
    <label><input type="checkbox" checked={entry.accepted} onChange={(event) => setProposal(proposal.map((candidate) => candidate.id === entry.id ? { ...candidate, accepted: event.target.checked } : candidate))} /><strong>{entry.label}</strong></label>
    <p className="gb-diff__before"><span aria-hidden="true">−</span>{entry.before}</p><p className="gb-diff__after"><span aria-hidden="true">+</span>{entry.after}</p>
  </li>)}</ul><div className="gb-diff__actions"><button type="button" onClick={onReject}>Reject all</button><button type="button" onClick={onApply} disabled={!proposal.some((entry) => entry.accepted)}>Apply selected</button></div></div>;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${PROXY_BASE}${path}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "The request failed.");
  return payload;
}
function operation(kind: ProposalOperation["kind"], label: string, before: string, after: string, value?: string | number): ProposalOperation {
  return { id: crypto.randomUUID(), kind, label, before, after, value, accepted: true };
}
function autoArrange(items: BuilderItem[], sheet: { widthMm: number; heightMm: number; gapMm: number }) {
  let x = sheet.gapMm; let y = sheet.gapMm; let rowHeight = 0;
  return items.map((item) => {
    if (x + item.widthMm + sheet.gapMm > sheet.widthMm) { x = sheet.gapMm; y += rowHeight + sheet.gapMm; rowHeight = 0; }
    const placed = constrainItem({ ...item, xMm: x, yMm: y }, sheet);
    x += item.widthMm + sheet.gapMm; rowHeight = Math.max(rowHeight, item.heightMm); return placed;
  });
}
function constrainItem(item: BuilderItem, sheet: { widthMm: number; heightMm: number }) {
  const widthMm = clamp(item.widthMm, 10, sheet.widthMm); const heightMm = clamp(item.heightMm, 10, sheet.heightMm);
  return { ...item, widthMm, heightMm, xMm: clamp(item.xMm, 0, Math.max(0, sheet.widthMm - widthMm)), yMm: clamp(item.yMm, 0, Math.max(0, sheet.heightMm - heightMm)) };
}
function uploadLabel(item: BuilderItem) { return item.uploadState === "uploading" ? "Uploading…" : item.uploadState === "ready" ? "Ready" : item.uploadError || "Upload failed"; }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)); }
function round(value: number) { return Math.round(value * 100) / 100; }
function autoGrow(textarea: HTMLTextAreaElement) { const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 22; textarea.style.height = "auto"; textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * 5 + 20)}px`; }
function readImageDimensions(file: File) { return new Promise<{ width: number; height: number }>((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.onload = () => { resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 }); URL.revokeObjectURL(url); }; image.onerror = () => { reject(new Error(`${file.name} could not be read.`)); URL.revokeObjectURL(url); }; image.src = url; }); }
