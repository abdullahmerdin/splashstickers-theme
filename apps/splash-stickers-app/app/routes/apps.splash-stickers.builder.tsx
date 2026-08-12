import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { WorkbenchShell } from "../components/workbench/WorkbenchShell";
import {
  autoArrange,
  clamp,
  constrainItemToSheet,
  isLayoutValid,
  isPlacementValid,
  itemsInSelection,
  round,
  type Bounds,
  type LayoutItem,
} from "../lib/gangsheet-editor";
import { requireAppProxy } from "../services/app-proxy.server";
import { resolveBuilderProduct, type BuilderProduct } from "../services/products.server";
import stylesheet from "../styles/gangsheet-builder.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: stylesheet }];
export const meta: MetaFunction = () => [{ title: "Splash Gangsheet Builder" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const { context, shop } = await requireAppProxy(request);
  const admin = "admin" in context ? context.admin : undefined;
  const searchParams = new URL(request.url).searchParams;
  const variantId = searchParams.get("variant") || "";
  const embedded = searchParams.get("embedded") === "1";
  if (!admin) return { shop, product: null, embedded, error: "Splash Gangsheet Builder is not available for this shop." };
  try {
    return { shop, product: await resolveBuilderProduct(admin, variantId), embedded, error: null };
  } catch (error) {
    return { shop, product: null, embedded, error: error instanceof Error ? error.message : "The gangsheet product could not be loaded." };
  }
}

type UploadState = "uploading" | "ready" | "error";
type TextStyle = {
  fontSizePt: number;
  color: string;
  background?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
};
type BuilderItem = LayoutItem & {
  name: string;
  kind?: "image" | "text";
  previewUrl?: string;
  assetRef?: string;
  uploadState: UploadState;
  uploadError?: string;
  text?: string;
  style?: TextStyle;
  flipX?: boolean;
  flipY?: boolean;
  locked?: boolean;
};
type SheetState = {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  background: string;
};
type EditorSnapshot = { items: BuilderItem[]; sheet: SheetState };
type DesignDraft = {
  file: File;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  widthMm: number;
  heightMm: number;
  copies: number;
};
type TransformKind = "move" | "resize" | "rotate";

const PROXY_BASE = "/apps/splash-stickers/";
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_HISTORY = 50;
const MAX_ITEMS = 500;

export default function GangsheetBuilderRoute() {
  const { product, embedded, error } = useLoaderData<typeof loader>();
  if (!product) return <BuilderUnavailable message={error || "Choose a gangsheet product to continue."} />;
  return <GangsheetBuilder product={product} embedded={embedded} />;
}

function BuilderUnavailable({ message }: { message: string }) {
  return <main className="gb-unavailable"><div><h1>Splash Gangsheet Builder</h1><p>{message}</p><a href="/">Return to store</a></div></main>;
}

export function GangsheetBuilder({
  product,
  previewItems = [],
  previewMode = false,
  embedded = false,
}: {
  product: BuilderProduct;
  previewItems?: BuilderItem[];
  previewMode?: boolean;
  embedded?: boolean;
}) {
  const initialItems = previewItems.map((item) => ({ ...item, kind: item.kind || "image", flipX: Boolean(item.flipX), flipY: Boolean(item.flipY) }));
  const initialSheet = { widthMm: 600, heightMm: 400, gapMm: 3, background: "#ffffff" };
  const [items, setItems] = useState<BuilderItem[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialItems[0] ? [initialItems[0].id] : []);
  const [sheet, setSheet] = useState<SheetState>(initialSheet);
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState(product.selectedVariantId);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"" | "error" | "success">("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">(() => readThemeMode(embedded));
  const [zoom, setZoom] = useState(1);
  const [canvasBase, setCanvasBase] = useState({ width: 900, height: 600 });
  const [invalidIds, setInvalidIds] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<Bounds | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [textDialogOpen, setTextDialogOpen] = useState(false);
  const [designDialogOpen, setDesignDialogOpen] = useState(false);
  const [designDraft, setDesignDraft] = useState<DesignDraft | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const [sheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const [exporting, setExporting] = useState(false);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<BuilderItem[]>(initialItems);
  const sheetRef = useRef<SheetState>(initialSheet);
  const invalidRef = useRef<string[]>([]);
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const objectUrlsRef = useRef(new Set<string>());
  const uploadCacheRef = useRef(new Map<string, Pick<BuilderItem, "assetRef" | "uploadState" | "uploadError">>());
  const zoomRef = useRef(1);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number } | null>(null);
  const touchPanRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const cancelTransformRef = useRef<(() => void) | null>(null);
  const designDraftRef = useRef<DesignDraft | null>(null);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));
  const selected = selectedItems.length === 1 ? selectedItems[0] : null;
  const variant = product.variants.find((entry) => entry.legacyResourceId === variantId) || product.variants[0];
  const totalCents = (variant?.priceCents || 0) * quantity;
  const allUploadsReady = items.length > 0 && items.every((item) => item.kind === "text" || (item.uploadState === "ready" && item.assetRef));
  const canUndo = historyState.undo > 0;
  const canRedo = historyState.redo > 0;
  const useDarkCanvasSurface = mode === "dark" && sheet.background.toLowerCase() === "#ffffff";

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { designDraftRef.current = designDraft; }, [designDraft]);
  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const draftUrl = designDraftRef.current?.previewUrl;
    if (draftUrl && !objectUrlsRef.current.has(draftUrl)) URL.revokeObjectURL(draftUrl);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.embedded = embedded ? "true" : "false";
    document.documentElement.style.colorScheme = mode;
  }, [embedded, mode]);
  useEffect(() => {
    let hostRoot = document.documentElement;
    if (embedded && window.parent !== window) {
      try { hostRoot = window.parent.document.documentElement; } catch { /* Fall back to this document. */ }
    }
    const syncMode = () => setMode(readThemeModeFromRoot(hostRoot));
    const observer = new MutationObserver(syncMode);
    observer.observe(hostRoot, { attributes: true, attributeFilter: ["class", "data-theme", "data-color-scheme"] });
    const hostDocument = hostRoot.ownerDocument;
    hostDocument.addEventListener("theme:change", syncMode);
    syncMode();
    return () => {
      observer.disconnect();
      hostDocument.removeEventListener("theme:change", syncMode);
    };
  }, [embedded]);
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      setCanvasZoom(zoomRef.current * Math.exp(-event.deltaY * 0.002), { x: event.clientX, y: event.clientY });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    const resize = () => {
      const styles = getComputedStyle(viewport);
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(240, viewport.clientWidth - horizontalPadding);
      const availableHeight = Math.max(220, viewport.clientHeight - verticalPadding);
      const ratio = sheetRef.current.widthMm / sheetRef.current.heightMm;
      const width = Math.min(992, availableWidth, availableHeight * ratio);
      setCanvasBase({ width, height: width / ratio });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, [sheet.widthMm, sheet.heightMm]);

  function replaceItems(next: BuilderItem[] | ((current: BuilderItem[]) => BuilderItem[])) {
    setItems((current) => {
      const value = typeof next === "function" ? next(current) : next;
      itemsRef.current = value;
      return value;
    });
  }

  function replaceSheet(next: SheetState) {
    sheetRef.current = next;
    setSheet(next);
  }

  function snapshot(snapshotItems = itemsRef.current, snapshotSheet = sheetRef.current): EditorSnapshot {
    return { items: snapshotItems.map((item) => ({ ...item, style: item.style ? { ...item.style } : undefined })), sheet: { ...snapshotSheet } };
  }

  function recordUndo(before: EditorSnapshot) {
    undoStackRef.current.push(before);
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryState({ undo: undoStackRef.current.length, redo: 0 });
  }

  function restoreSnapshot(value: EditorSnapshot) {
    const restored = value.items.map((item) => ({ ...item, ...(uploadCacheRef.current.get(item.id) || {}) }));
    replaceItems(restored);
    replaceSheet({ ...value.sheet });
    setSelectedIds((current) => current.filter((id) => restored.some((item) => item.id === id)));
    setInvalid([]);
  }

  function undo() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(snapshot());
    restoreSnapshot(previous);
    setHistoryState({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }

  function redo() {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(snapshot());
    restoreSnapshot(next);
    setHistoryState({ undo: undoStackRef.current.length, redo: redoStackRef.current.length });
  }

  function setInvalid(ids: string[]) {
    invalidRef.current = ids;
    setInvalidIds(ids);
  }

  function announce(message: string, kind: "" | "error" | "success" = "") {
    setStatus(message);
    setStatusKind(kind);
  }

  function exceedsItemLimit(additions: number) {
    if (itemsRef.current.length + additions <= MAX_ITEMS) return false;
    setLimitDialogOpen(true);
    return true;
  }

  function openDesignDialog() {
    setDesignDialogOpen(true);
  }

  async function chooseDesign(fileList: FileList | File[] | null) {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      announce(`${file.name}: use a PNG, JPG or WebP file up to 25 MB.`, "error");
      return;
    }
    try {
      const dimensions = await readImageDimensions(file);
      const naturalWidthMm = dimensions.width / 300 * 25.4;
      const naturalHeightMm = dimensions.height / 300 * 25.4;
      const scale = Math.min(1, sheetRef.current.widthMm / naturalWidthMm, sheetRef.current.heightMm / naturalHeightMm);
      const previewUrl = URL.createObjectURL(file);
      const previousUrl = designDraftRef.current?.previewUrl;
      if (previousUrl && !objectUrlsRef.current.has(previousUrl)) URL.revokeObjectURL(previousUrl);
      setDesignDraft({
        file,
        previewUrl,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
        widthMm: round(Math.max(10, naturalWidthMm * scale)),
        heightMm: round(Math.max(10, naturalHeightMm * scale)),
        copies: 3,
      });
      setDesignDialogOpen(true);
      announce("");
    } catch {
      announce(`${file.name} could not be read.`, "error");
    }
  }

  function closeDesignDialog() {
    const previewUrl = designDraftRef.current?.previewUrl;
    if (previewUrl && !objectUrlsRef.current.has(previewUrl)) URL.revokeObjectURL(previewUrl);
    setDesignDraft(null);
    setDesignDialogOpen(false);
  }

  function addDraftDesign() {
    const draft = designDraftRef.current;
    if (!draft) return;
    const copies = clamp(Math.round(draft.copies), 1, 50);
    if (exceedsItemLimit(copies)) return;
    const widthMm = clamp(draft.widthMm, 10, sheetRef.current.widthMm);
    const heightMm = clamp(draft.heightMm, 10, 2000);
    const additions: BuilderItem[] = Array.from({ length: copies }, (_, index) => ({
      id: crypto.randomUUID(),
      kind: "image",
      name: copies === 1 ? draft.file.name : `${draft.file.name} ${index + 1}`,
      previewUrl: draft.previewUrl,
      uploadState: "uploading",
      xMm: 0,
      yMm: 0,
      widthMm: round(widthMm),
      heightMm: round(heightMm),
      rotation: 0,
      flipX: false,
      flipY: false,
    }));
    const before = snapshot();
    const result = autoArrange([...itemsRef.current, ...additions], sheetRef.current, true);
    if (result.unplacedIds.length) {
      announce("The design is wider than the current sheet.", "error");
      return;
    }
    const nextSheet = { ...sheetRef.current, heightMm: result.requiredHeightMm };
    objectUrlsRef.current.add(draft.previewUrl);
    replaceSheet(nextSheet);
    replaceItems(result.items);
    setSelectedIds(additions.map((item) => item.id));
    recordUndo(before);
    setDesignDraft(null);
    setDesignDialogOpen(false);
    void uploadArtwork(additions.map((item) => item.id), draft.file);
  }

  async function uploadArtwork(itemIds: string[], file: File) {
    try {
      announce(`Uploading ${file.name}…`);
      const stage = await postJson("uploads/stage", { filename: file.name, mimeType: file.type, fileSize: file.size });
      const form = new FormData();
      for (const parameter of stage.target.parameters as Array<{ name: string; value: string }>) form.append(parameter.name, parameter.value);
      form.append("file", file);
      const uploadResponse = await fetch(stage.target.url, { method: "POST", body: form });
      if (!uploadResponse.ok) throw new Error("Shopify did not accept the artwork upload.");
      const completed = await postJson("uploads/complete", {
        resourceUrl: stage.target.resourceUrl,
        filename: stage.filename,
        alt: file.name,
        uploadToken: stage.uploadToken,
      });
      await waitForFileReady(completed.file.id);
      const result = { assetRef: completed.file.id as string, uploadState: "ready" as const, uploadError: undefined };
      itemIds.forEach((itemId) => uploadCacheRef.current.set(itemId, result));
      replaceItems((current) => current.map((item) => itemIds.includes(item.id) ? { ...item, ...result } : item));
      announce(`${file.name} is ready.`, "success");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Artwork upload failed.";
      const result = { uploadState: "error" as const, uploadError: message };
      itemIds.forEach((itemId) => uploadCacheRef.current.set(itemId, result));
      replaceItems((current) => current.map((item) => itemIds.includes(item.id) ? { ...item, ...result } : item));
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

  function selectItem(id: string, additive = false) {
    setSelectedIds((current) => {
      if (!additive) return current.includes(id) ? current : [id];
      return current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id];
    });
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    const before = snapshot();
    replaceItems(itemsRef.current.filter((item) => !selectedIds.includes(item.id)));
    recordUndo(before);
    setSelectedIds([]);
  }

  function duplicateSelected() {
    if (!selectedIds.length) return;
    if (exceedsItemLimit(selectedIds.length)) return;
    const before = snapshot();
    const copies = itemsRef.current.filter((item) => selectedIds.includes(item.id)).map((source) => ({
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} copy`,
      locked: false,
      xMm: 0,
      yMm: 0,
    }));
    const result = autoArrange([...itemsRef.current, ...copies], sheetRef.current, true);
    if (result.unplacedIds.length) return announce("A selected design is wider than the sheet.", "error");
    replaceSheet({ ...sheetRef.current, heightMm: result.requiredHeightMm });
    replaceItems(result.items);
    setSelectedIds(copies.map((item) => item.id));
    recordUndo(before);
  }

  function flipSelected(axis: "x" | "y") {
    if (!selectedIds.length) return;
    const before = snapshot();
    replaceItems(itemsRef.current.map((item) => selectedIds.includes(item.id)
      ? { ...item, [axis === "x" ? "flipX" : "flipY"]: !item[axis === "x" ? "flipX" : "flipY"] }
      : item));
    recordUndo(before);
  }

  function toggleLock() {
    if (!selectedIds.length) return;
    const before = snapshot();
    const shouldLock = selectedItems.some((item) => !item.locked);
    replaceItems(itemsRef.current.map((item) => selectedIds.includes(item.id) ? { ...item, locked: shouldLock } : item));
    recordUndo(before);
  }

  function updateSelected(patch: Partial<BuilderItem>) {
    if (!selected) return;
    const before = snapshot();
    const candidate = constrainItemToSheet({ ...selected, ...patch }, sheetRef.current);
    if (!isPlacementValid(candidate, itemsRef.current, sheetRef.current, [selected.id])) {
      announce("That change would overlap another design.", "error");
      return;
    }
    replaceItems(itemsRef.current.map((item) => item.id === selected.id ? candidate : item));
    recordUndo(before);
  }

  function arrange() {
    if (!itemsRef.current.length) return;
    const before = snapshot();
    const result = autoArrange(itemsRef.current, sheetRef.current, true);
    if (result.unplacedIds.length) {
      announce("The current artwork cannot fit on this sheet without overlapping.", "error");
      return;
    }
    replaceSheet({ ...sheetRef.current, heightMm: result.requiredHeightMm });
    replaceItems(result.items);
    recordUndo(before);
    announce("Artwork arranged with the current gap.", "success");
  }

  function updateSheetGeometry(patch: Partial<SheetState>) {
    const before = snapshot();
    const nextSheet = { ...sheetRef.current, ...patch };
    const constrained = itemsRef.current.map((item) => constrainItemToSheet(item, nextSheet));
    let nextItems = constrained;
    if (!isLayoutValid(constrained, nextSheet)) {
      const result = autoArrange(constrained, nextSheet, patch.gapMm !== undefined);
      if (result.unplacedIds.length) {
        announce("The sheet is too small for the current artwork and gap.", "error");
        return;
      }
      nextItems = result.items;
      nextSheet.heightMm = result.requiredHeightMm;
    }
    replaceSheet(nextSheet);
    replaceItems(nextItems);
    recordUndo(before);
  }

  function addText(text: string, style: TextStyle) {
    const value = text.trim();
    if (!value) return;
    if (exceedsItemLimit(1)) return;
    const candidate: BuilderItem = {
      id: crypto.randomUUID(),
      kind: "text",
      name: value.slice(0, 32),
      text: value,
      style,
      uploadState: "ready",
      xMm: sheetRef.current.gapMm,
      yMm: sheetRef.current.gapMm,
      widthMm: Math.min(100, Math.max(40, value.length * 4)),
      heightMm: Math.max(18, style.fontSizePt * 0.55),
      rotation: 0,
      flipX: false,
      flipY: false,
    };
    const before = snapshot();
    const result = autoArrange([...itemsRef.current, candidate], sheetRef.current, true);
    if (result.unplacedIds.length) return announce("The text is wider than the sheet.", "error");
    replaceSheet({ ...sheetRef.current, heightMm: result.requiredHeightMm });
    replaceItems(result.items);
    setSelectedIds([candidate.id]);
    recordUndo(before);
    setTextDialogOpen(false);
  }

  function onItemPointerDown(event: ReactPointerEvent<HTMLElement>, item: BuilderItem, kind: TransformKind = "move") {
    if (event.button !== 0 || item.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const activeIds = kind === "move" && selectedIds.includes(item.id) ? selectedIds : [item.id];
    if (additive && kind === "move") {
      selectItem(item.id, true);
      return;
    }
    setSelectedIds(activeIds);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const before = snapshot();
    const startItems = before.items;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const startItem = startItems.find((entry) => entry.id === item.id);
    if (!startItem) return;
    const centerX = rect.left + (startItem.xMm + startItem.widthMm / 2) / sheetRef.current.widthMm * rect.width;
    const centerY = rect.top + (startItem.yMm + startItem.heightMm / 2) / sheetRef.current.heightMm * rect.height;
    const pointerAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
    let moved = false;

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== pointerId) return;
      const deltaX = (move.clientX - startX) / rect.width * sheetRef.current.widthMm;
      const deltaY = (move.clientY - startY) / rect.height * sheetRef.current.heightMm;
      moved ||= Math.abs(move.clientX - startX) > 2 || Math.abs(move.clientY - startY) > 2;
      const next = startItems.map((entry) => {
        if (!activeIds.includes(entry.id)) return entry;
        if (kind === "move") return { ...entry, xMm: round(entry.xMm + deltaX), yMm: round(entry.yMm + deltaY) };
        if (entry.id !== item.id) return entry;
        if (kind === "resize") {
          const scale = Math.max(0.1, 1 + Math.max(deltaX / Math.max(1, entry.widthMm), deltaY / Math.max(1, entry.heightMm)));
          return { ...entry, widthMm: round(Math.max(10, entry.widthMm * scale)), heightMm: round(Math.max(10, entry.heightMm * scale)) };
        }
        const angle = Math.atan2(move.clientY - centerY, move.clientX - centerX) * 180 / Math.PI;
        return { ...entry, rotation: round(entry.rotation + angle - pointerAngle) };
      });
      const invalid = isLayoutValid(next, sheetRef.current) ? [] : activeIds;
      setInvalid(invalid);
      replaceItems(next);
    };

    const finish = (cancelled = false) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      cancelTransformRef.current = null;
      if (cancelled) {
        replaceItems(startItems);
        setInvalid([]);
        return;
      }
      if (!moved) {
        setInvalid([]);
        return;
      }
      if (invalidRef.current.length || !isLayoutValid(itemsRef.current, sheetRef.current)) {
        replaceItems(startItems);
        setInvalid([]);
        announce("Designs cannot overlap or leave the sheet. The last valid layout was restored.", "error");
        return;
      }
      recordUndo(before);
      setInvalid([]);
    };
    const onUp = (up: PointerEvent) => { if (up.pointerId === pointerId) finish(); };
    const onCancel = (cancel: PointerEvent) => { if (cancel.pointerId === pointerId) finish(true); };
    cancelTransformRef.current = () => finish(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function onCanvasBackgroundPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch" || event.button !== 0 || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = clamp((event.clientX - rect.left) / rect.width * sheetRef.current.widthMm, 0, sheetRef.current.widthMm);
    const startY = clamp((event.clientY - rect.top) / rect.height * sheetRef.current.heightMm, 0, sheetRef.current.heightMm);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const onMove = (move: PointerEvent) => {
      const endX = clamp((move.clientX - rect.left) / rect.width * sheetRef.current.widthMm, 0, sheetRef.current.widthMm);
      const endY = clamp((move.clientY - rect.top) / rect.height * sheetRef.current.heightMm, 0, sheetRef.current.heightMm);
      setSelectionBox({ x: Math.min(startX, endX), y: Math.min(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY) });
    };
    const onUp = (up: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const endX = clamp((up.clientX - rect.left) / rect.width * sheetRef.current.widthMm, 0, sheetRef.current.widthMm);
      const endY = clamp((up.clientY - rect.top) / rect.height * sheetRef.current.heightMm, 0, sheetRef.current.heightMm);
      const selection = { x: Math.min(startX, endX), y: Math.min(startY, endY), width: Math.abs(endX - startX), height: Math.abs(endY - startY) };
      if (selection.width < 1 && selection.height < 1) setSelectedIds(additive ? selectedIds : []);
      else {
        const ids = itemsInSelection(itemsRef.current, selection);
        setSelectedIds(additive ? Array.from(new Set([...selectedIds, ...ids])) : ids);
      }
      setSelectionBox(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function onViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { viewport.setPointerCapture(event.pointerId); } catch { /* Pointer capture is best-effort. */ }
      if (touchPointersRef.current.size >= 2) {
        event.preventDefault();
        event.stopPropagation();
        cancelTransformRef.current?.();
        touchPanRef.current = null;
        const [first, second] = Array.from(touchPointersRef.current.values());
        pinchRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y) || 1 };
      } else if (event.target === canvasRef.current) {
        touchPanRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          scrollLeft: viewport.scrollLeft,
          scrollTop: viewport.scrollTop,
          moved: false,
        };
      }
      return;
    }
    if (!(event.button === 1 || (event.button === 0 && spacePressed))) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const scrollLeft = viewport.scrollLeft;
    const scrollTop = viewport.scrollTop;
    viewport.dataset.panning = "true";
    const onMove = (move: PointerEvent) => {
      viewport.scrollLeft = scrollLeft - (move.clientX - startX);
      viewport.scrollTop = scrollTop - (move.clientY - startY);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      delete viewport.dataset.panning;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function onViewportPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || !touchPointersRef.current.has(event.pointerId)) return;
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = Array.from(touchPointersRef.current.values());
    if (pointers.length >= 2) {
      event.preventDefault();
      event.stopPropagation();
      const distance = Math.hypot(pointers[1].x - pointers[0].x, pointers[1].y - pointers[0].y) || 1;
      const center = { x: (pointers[0].x + pointers[1].x) / 2, y: (pointers[0].y + pointers[1].y) / 2 };
      const previousDistance = pinchRef.current?.distance || distance;
      setCanvasZoom(zoomRef.current * distance / previousDistance, center);
      pinchRef.current = { distance };
      return;
    }
    const pan = touchPanRef.current;
    const viewport = canvasViewportRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !viewport) return;
    const deltaX = event.clientX - pan.x;
    const deltaY = event.clientY - pan.y;
    if (!pan.moved && Math.hypot(deltaX, deltaY) < 7) return;
    pan.moved = true;
    event.preventDefault();
    viewport.dataset.panning = "true";
    viewport.scrollLeft = pan.scrollLeft - deltaX;
    viewport.scrollTop = pan.scrollTop - deltaY;
  }

  function onViewportPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    touchPointersRef.current.delete(event.pointerId);
    if (touchPointersRef.current.size < 2) pinchRef.current = null;
    const pan = touchPanRef.current;
    if (pan?.pointerId === event.pointerId) {
      if (!pan.moved) setSelectedIds([]);
      touchPanRef.current = null;
      const viewport = canvasViewportRef.current;
      if (viewport) delete viewport.dataset.panning;
    }
  }

  function setCanvasZoom(nextValue: number, clientPoint?: { x: number; y: number }) {
    const viewport = canvasViewportRef.current;
    const current = zoomRef.current;
    const next = clamp(Math.round(nextValue * 100) / 100, 0.5, 4);
    if (!viewport || next === current) return;
    const rect = viewport.getBoundingClientRect();
    const pointX = clientPoint ? clientPoint.x - rect.left : rect.width / 2;
    const pointY = clientPoint ? clientPoint.y - rect.top : rect.height / 2;
    const contentX = viewport.scrollLeft + pointX;
    const contentY = viewport.scrollTop + pointY;
    const ratio = next / current;
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => {
      viewport.scrollLeft = contentX * ratio - pointX;
      viewport.scrollTop = contentY * ratio - pointY;
    });
  }

  function fitCanvas() {
    zoomRef.current = 1;
    setZoom(1);
    requestAnimationFrame(() => {
      if (!canvasViewportRef.current) return;
      canvasViewportRef.current.scrollLeft = 0;
      canvasViewportRef.current.scrollTop = 0;
    });
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.code === "Space" && !editing) {
        event.preventDefault();
        setSpacePressed(true);
      }
      if (editing) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      } else if (command && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedIds(itemsRef.current.map((item) => item.id));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setCanvasZoom(zoom + 0.1);
      } else if (event.key === "-") {
        event.preventDefault();
        setCanvasZoom(zoom - 0.1);
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setTextDialogOpen(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") setSpacePressed(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // Event bindings intentionally refresh with the current selection, zoom and history state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyState, selectedIds, zoom]);

  async function downloadPreview() {
    if (!itemsRef.current.length || exporting) return;
    setExporting(true);
    try {
      const maxDimension = 4096;
      const scale = Math.min(maxDimension / sheetRef.current.widthMm, maxDimension / sheetRef.current.heightMm, 8);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sheetRef.current.widthMm * scale));
      canvas.height = Math.max(1, Math.round(sheetRef.current.heightMm * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Preview canvas is not available.");
      context.fillStyle = sheetRef.current.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (const item of itemsRef.current) {
        context.save();
        const centerX = (item.xMm + item.widthMm / 2) * scale;
        const centerY = (item.yMm + item.heightMm / 2) * scale;
        context.translate(centerX, centerY);
        context.rotate(item.rotation * Math.PI / 180);
        context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
        if (item.kind === "text") {
          context.fillStyle = item.style?.background || "transparent";
          if (item.style?.background) context.fillRect(-item.widthMm * scale / 2, -item.heightMm * scale / 2, item.widthMm * scale, item.heightMm * scale);
          context.fillStyle = item.style?.color || "#2d3436";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.font = `${item.style?.fontStyle || "normal"} ${item.style?.fontWeight || "400"} ${Math.max(12, (item.style?.fontSizePt || 24) * scale / 2.835)}px Inter, sans-serif`;
          context.fillText(item.text || "", 0, 0, item.widthMm * scale);
        } else if (item.previewUrl) {
          const image = await loadImage(item.previewUrl);
          context.drawImage(image, -item.widthMm * scale / 2, -item.heightMm * scale / 2, item.widthMm * scale, item.heightMm * scale);
        }
        context.restore();
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The preview could not be exported.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "gangsheet-preview.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      announce("Preview downloaded.", "success");
    } catch (error) {
      announce(error instanceof Error ? error.message : "The preview could not be exported.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function addToCart() {
    if (!allUploadsReady || busy || !variant?.available || !isLayoutValid(itemsRef.current, sheetRef.current)) return;
    setBusy(true);
    try {
      announce("Saving design…");
      const manifest = {
        schemaVersion: "1.0",
        sheet: { widthMm: sheet.widthMm, heightMm: sheet.heightMm, unit: "mm", gapMm: sheet.gapMm, background: sheet.background },
        quantity: 1,
        items: items.map((item, index) => ({
          id: item.id,
          kind: item.kind || "image",
          assetRef: item.kind === "text" ? undefined : item.assetRef,
          text: item.kind === "text" ? item.text : undefined,
          style: item.kind === "text" ? item.style : undefined,
          placement: {
            xMm: round(item.xMm),
            yMm: round(item.yMm),
            widthMm: round(item.widthMm),
            heightMm: round(item.heightMm),
            rotation: round(item.rotation),
            flipX: Boolean(item.flipX),
            flipY: Boolean(item.flipY),
            zIndex: index,
          },
        })),
      };
      const saved = await postJson("designs", { manifest, productId: product.id, variantId: variant.id });
      announce("Preparing Shopify cart…");
      const finalized = await postJson("purchase-intents", { designId: saved.design.publicId, digest: saved.design.digest, variantId: variant.legacyResourceId });
      const cartResponse = await fetch("/cart/add.js", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{
          id: Number(variant.legacyResourceId),
          quantity,
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
      if (window.top && window.top !== window) window.top.location.assign("/cart");
      else window.location.assign("/cart");
    } catch (purchaseError) {
      announce(purchaseError instanceof Error ? purchaseError.message : "The gangsheet could not be added to cart.", "error");
      setBusy(false);
    }
  }

  const previewPanel = <>
    <section className="wb-section"><h2>Live preview</h2><Preview sheet={sheet} items={items} /><Inspector selected={selected} selectedCount={selectedItems.length} sheet={sheet} onChange={updateSelected} onRemove={removeSelected} /></section>
    <PurchasePanel product={product} variantId={variantId} setVariantId={setVariantId} quantity={quantity} setQuantity={setQuantity}
      total={formatMoney(totalCents, product.currency)} disabled={previewMode || !allUploadsReady || busy || !variant?.available || !isLayoutValid(items, sheet)} busy={busy} onBuy={addToCart} />
  </>;

  return <WorkbenchShell title={product.title} subtitle="Gang sheet builder" preview={previewPanel}>
    <div className="gb-stage-toolbar" role="toolbar" aria-label="Design tools">
      <button className="gb-add-design" type="button" onClick={openDesignDialog}><span aria-hidden="true">+</span> Add design</button>
      <ToolbarButton label="Auto-arrange" symbol="▦" onClick={arrange} disabled={!items.length} />
      <ToolbarButton label="Undo" symbol="↶" onClick={undo} disabled={!canUndo} />
      <ToolbarButton label="Redo" symbol="↷" onClick={redo} disabled={!canRedo} />
      <button className="gb-more-toggle" type="button" aria-expanded={moreToolsOpen} aria-controls="gb-more-tools" onClick={() => setMoreToolsOpen((open) => !open)}>More</button>
      <div id="gb-more-tools" className="gb-more-tools" data-open={moreToolsOpen || undefined}>
        <span className="gb-toolbar-divider" />
        <ToolbarButton label="Delete selected" symbol="⌫" onClick={removeSelected} disabled={!selectedIds.length} />
        <ToolbarButton label="Duplicate selected" symbol="⧉" onClick={duplicateSelected} disabled={!selectedIds.length} />
        <ToolbarButton label="Flip horizontally" symbol="↔" onClick={() => flipSelected("x")} disabled={!selectedIds.length} />
        <ToolbarButton label="Flip vertically" symbol="↕" onClick={() => flipSelected("y")} disabled={!selectedIds.length} />
        <ToolbarButton label={selectedItems.some((item) => !item.locked) ? "Lock selected" : "Unlock selected"} symbol="▣" onClick={toggleLock} disabled={!selectedIds.length} pressed={selectedItems.length > 0 && selectedItems.every((item) => item.locked)} />
        <ToolbarButton label="Add text" symbol="T" onClick={() => setTextDialogOpen(true)} />
        <ToolbarButton label="Download preview" symbol="↓" onClick={() => { void downloadPreview(); }} disabled={!items.length || exporting} />
        <span className="gb-toolbar-divider" />
        <ToolbarButton label="Zoom out" symbol="−" onClick={() => setCanvasZoom(zoomRef.current - 0.1)} disabled={zoom <= 0.5} />
        <button className="gb-zoom-value" type="button" onClick={fitCanvas} title="Zoom to fit">{Math.round(zoom * 100)}%</button>
        <ToolbarButton label="Zoom in" symbol="+" onClick={() => setCanvasZoom(zoomRef.current + 0.1)} disabled={zoom >= 4} />
      </div>
    </div>
    <div className="gb-info-bar"><span>{items.length} item{items.length === 1 ? "" : "s"}{selectedIds.length ? ` · ${selectedIds.length} selected` : ""}</span><span>Ctrl-scroll to zoom · Space or middle-drag to pan</span></div>
    <div className="gb-sheet-settings">
      <button className="gb-sheet-toggle" type="button" aria-expanded={sheetSettingsOpen} aria-controls="gb-sheet-controls" onClick={() => setSheetSettingsOpen((open) => !open)}>Sheet · {sheet.widthMm} × {sheet.heightMm} mm</button>
      <div id="gb-sheet-controls" className="gb-sheet-controls" data-open={sheetSettingsOpen || undefined}>
        <label>W <input type="number" min="100" max="2000" value={sheet.widthMm} onChange={(event) => updateSheetGeometry({ widthMm: clamp(Number(event.target.value), 100, 2000) })} /> mm</label>
        <label>H <input type="number" min="100" max="2000" value={sheet.heightMm} onChange={(event) => updateSheetGeometry({ heightMm: clamp(Number(event.target.value), 100, 2000) })} /> mm</label>
        <label>Gap <input type="number" min="0" max="50" value={sheet.gapMm} onChange={(event) => updateSheetGeometry({ gapMm: clamp(Number(event.target.value), 0, 50) })} /> mm</label>
        <label>Sheet <input type="color" value={sheet.background} aria-label="Sheet background" onChange={(event) => updateSheetGeometry({ background: event.target.value })} /></label>
      </div>
    </div>
    <div ref={canvasViewportRef} className="gb-canvas-wrap" data-space-pressed={spacePressed || undefined} onPointerDownCapture={onViewportPointerDown} onPointerMoveCapture={onViewportPointerMove} onPointerUpCapture={onViewportPointerEnd} onPointerCancelCapture={onViewportPointerEnd}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); void chooseDesign(event.dataTransfer.files); }}>
      <div className="gb-canvas-stage" style={{ width: canvasBase.width * zoom, height: canvasBase.height * zoom }}>
        <div ref={canvasRef} className="gb-canvas" data-dark-surface={useDarkCanvasSurface || undefined} style={{ width: canvasBase.width, height: canvasBase.height, backgroundColor: useDarkCanvasSurface ? "var(--wb-edit-sheet)" : sheet.background, transform: `scale(${zoom})` }}
          role="region" aria-label={`${sheet.widthMm} by ${sheet.heightMm} millimetre gangsheet`} onPointerDown={onCanvasBackgroundPointerDown}>
          {items.map((item) => <CanvasItem key={item.id} item={item} sheet={sheet} selected={selectedIds.includes(item.id)} invalid={invalidIds.includes(item.id)} onSelect={() => setSelectedIds([item.id])} onPointerDown={onItemPointerDown} />)}
          {selectionBox ? <div className="gb-selection-box" style={{ left: `${selectionBox.x / sheet.widthMm * 100}%`, top: `${selectionBox.y / sheet.heightMm * 100}%`, width: `${selectionBox.width / sheet.widthMm * 100}%`, height: `${selectionBox.height / sheet.heightMm * 100}%` }} /> : null}
          {!items.length ? <button className="gb-canvas-empty" type="button" onClick={openDesignDialog}>Add design<span>PNG, JPG or WebP · 25 MB max</span></button> : null}
        </div>
      </div>
    </div>
    <p className="gb-status" data-kind={statusKind || undefined} role="status" aria-live="polite">{status}</p>
    <div className="gb-mobile-buy wb-mobile-only"><span>{formatMoney(totalCents, product.currency)}</span><button type="button" disabled={previewMode || !allUploadsReady || busy || !variant?.available} onClick={addToCart}>{busy ? "Adding…" : "Add to cart"}</button></div>
    {textDialogOpen ? <TextDialog onAdd={addText} onClose={() => setTextDialogOpen(false)} /> : null}
    {designDialogOpen ? <DesignDialog draft={designDraft} onChoose={chooseDesign} onDraftChange={(patch) => setDesignDraft((current) => current ? { ...current, ...patch } : current)} onAdd={addDraftDesign} onClose={closeDesignDialog} /> : null}
    {limitDialogOpen ? <LimitDialog currentCount={items.length} onClose={() => setLimitDialogOpen(false)} /> : null}
  </WorkbenchShell>;
}

function ToolbarButton({ label, symbol, onClick, disabled = false, pressed }: { label: string; symbol: string; onClick: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button className="gb-tool" type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}><span aria-hidden="true">{symbol}</span></button>;
}

function CanvasItem({ item, sheet, selected, invalid, onSelect, onPointerDown }: {
  item: BuilderItem;
  sheet: SheetState;
  selected: boolean;
  invalid: boolean;
  onSelect: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, item: BuilderItem, kind?: TransformKind) => void;
}) {
  return <div className="gb-canvas-item" data-selected={selected || undefined} data-invalid={invalid || undefined} data-locked={item.locked || undefined}
    style={{
      left: `${item.xMm / sheet.widthMm * 100}%`,
      top: `${item.yMm / sheet.heightMm * 100}%`,
      width: `${item.widthMm / sheet.widthMm * 100}%`,
      height: `${item.heightMm / sheet.heightMm * 100}%`,
      transform: `rotate(${item.rotation}deg) scale(${item.flipX ? -1 : 1}, ${item.flipY ? -1 : 1})`,
    }}
    >
    <button className="gb-item-select" type="button" aria-label={`${item.name}. Select to edit.`} onFocus={onSelect} onPointerDown={(event) => onPointerDown(event, item)} />
    {item.kind === "text" ? <span className="gb-text-item" style={{ color: item.style?.color, background: item.style?.background || "transparent", fontSize: `${item.style?.fontSizePt || 24}pt`, fontWeight: item.style?.fontWeight, fontStyle: item.style?.fontStyle, textAlign: (item.style?.textAlign as "left" | "center" | "right") || "center" }}>{item.text}</span>
      : item.previewUrl ? <img src={item.previewUrl} alt="" draggable={false} /> : null}
    {selected && !item.locked ? <>
      <button className="gb-item-handle gb-item-handle--rotate" type="button" aria-label={`Rotate ${item.name}`} onPointerDown={(event) => onPointerDown(event, item, "rotate")}>↻</button>
      <button className="gb-item-handle gb-item-handle--resize" type="button" aria-label={`Resize ${item.name}`} onPointerDown={(event) => onPointerDown(event, item, "resize")}>↘</button>
    </> : null}
    {item.locked ? <span className="gb-item-lock" aria-label="Locked">•</span> : null}
  </div>;
}

function Inspector({ selected, selectedCount, sheet, onChange, onRemove }: { selected: BuilderItem | null; selectedCount: number; sheet: SheetState; onChange: (patch: Partial<BuilderItem>) => void; onRemove: () => void }) {
  if (selectedCount > 1) return <div className="gb-inspector"><div className="wb-section__heading"><h2>Selection</h2><button className="wb-danger-link" type="button" onClick={onRemove}>Remove</button></div><p className="wb-meta">{selectedCount} designs selected</p></div>;
  if (!selected) return null;
  return <div className="gb-inspector"><div className="wb-section__heading"><h2>Selection</h2><button className="wb-danger-link" type="button" onClick={onRemove}>Remove</button></div>
    <p className="wb-meta">{selected.name}</p><div className="gb-field-grid">
      <NumberField label="X" value={selected.xMm} max={sheet.widthMm} onChange={(value) => onChange({ xMm: value })} />
      <NumberField label="Y" value={selected.yMm} max={sheet.heightMm} onChange={(value) => onChange({ yMm: value })} />
      <NumberField label="Width" value={selected.widthMm} max={sheet.widthMm} min={10} onChange={(value) => onChange({ widthMm: value })} />
      <NumberField label="Height" value={selected.heightMm} max={sheet.heightMm} min={10} onChange={(value) => onChange({ heightMm: value })} />
      <NumberField label="Rotation" value={selected.rotation} max={360} min={-360} onChange={(value) => onChange({ rotation: value })} unit="°" />
    </div></div>;
}

function NumberField({ label, value, max, min = 0, onChange, unit = "mm" }: { label: string; value: number; max: number; min?: number; onChange: (value: number) => void; unit?: string }) {
  return <label><span>{label}</span><span><input type="number" min={min} max={max} step="0.01" value={round(value)} onChange={(event) => onChange(clamp(Number(event.target.value), min, max))} /> {unit}</span></label>;
}

function PurchasePanel({ product, variantId, setVariantId, quantity, setQuantity, total, disabled, busy, onBuy }: {
  product: BuilderProduct;
  variantId: string;
  setVariantId: (value: string) => void;
  quantity: number;
  setQuantity: (value: number) => void;
  total: string;
  disabled: boolean;
  busy: boolean;
  onBuy: () => void;
}) {
  return <section className="gb-purchase"><h2>Order</h2><label><span>Sheet option</span><select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
    {product.variants.map((variant) => <option key={variant.id} value={variant.legacyResourceId} disabled={!variant.available}>{variant.title} · {formatMoney(variant.priceCents, product.currency)}</option>)}</select></label>
    <label><span>Quantity</span><input type="number" min="1" max="999" value={quantity} onChange={(event) => setQuantity(clamp(Number(event.target.value), 1, 999))} /></label>
    <div className="gb-purchase__total"><span>Total</span><strong>{total}</strong></div>
    <button className="gb-buy" type="button" disabled={disabled} onClick={onBuy}>{busy ? "Adding…" : "Add to Shopify cart"}</button>
  </section>;
}

function Preview({ sheet, items }: { sheet: SheetState; items: BuilderItem[] }) {
  return <svg className="gb-preview" viewBox={`0 0 ${sheet.widthMm} ${sheet.heightMm}`} role="img" aria-label="Live gangsheet preview" style={{ background: sheet.background }}>
    {items.map((item) => {
      const centerX = item.xMm + item.widthMm / 2;
      const centerY = item.yMm + item.heightMm / 2;
      const transform = `translate(${centerX} ${centerY}) rotate(${item.rotation}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1}) translate(${-centerX} ${-centerY})`;
      return item.kind === "text" ? <text key={item.id} x={centerX} y={centerY} transform={transform} textAnchor="middle" dominantBaseline="middle" fill={item.style?.color || "#2d3436"} fontSize={Math.max(8, item.heightMm * 0.6)}>{item.text}</text>
        : item.previewUrl ? <image key={item.id} href={item.previewUrl} x={item.xMm} y={item.yMm} width={item.widthMm} height={item.heightMm} preserveAspectRatio="xMidYMid meet" transform={transform} /> : null;
    })}
  </svg>;
}

function TextDialog({ onAdd, onClose }: { onAdd: (text: string, style: TextStyle) => void; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [fontSizePt, setFontSizePt] = useState(24);
  const [color, setColor] = useState("#2d3436");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    textareaRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} className="gb-dialog" aria-labelledby="gb-text-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form method="dialog" onSubmit={(event) => { event.preventDefault(); onAdd(text, { fontSizePt, color, fontWeight: "600", textAlign: "center" }); }}>
      <div className="wb-section__heading"><h2 id="gb-text-title">Add text</h2><button className="wb-icon-button" type="button" aria-label="Close text dialog" onClick={onClose}>×</button></div>
      <label><span>Text</span><textarea ref={textareaRef} rows={3} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} /></label>
      <div className="gb-dialog__fields"><label><span>Size</span><input type="number" min="8" max="180" value={fontSizePt} onChange={(event) => setFontSizePt(clamp(Number(event.target.value), 8, 180))} /></label><label><span>Color</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div>
      <div className="gb-dialog__actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!text.trim()}>Add text</button></div>
    </form>
  </dialog>;
}

function DesignDialog({ draft, onChoose, onDraftChange, onAdd, onClose }: {
  draft: DesignDraft | null;
  onChoose: (files: FileList | File[] | null) => Promise<void>;
  onDraftChange: (patch: Partial<DesignDraft>) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} className="gb-dialog gb-design-dialog" aria-labelledby="gb-design-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form method="dialog" onSubmit={(event) => { event.preventDefault(); onAdd(); }}>
      <div className="wb-section__heading"><h2 id="gb-design-title">Add design</h2><button className="wb-icon-button" type="button" aria-label="Close design dialog" onClick={onClose}>×</button></div>
      <label className="gb-design-picker" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); void onChoose(event.dataTransfer.files); }}>
        {draft ? <><img src={draft.previewUrl} alt="Selected design preview" /><span className="gb-design-picker__copy"><strong>{draft.file.name}</strong><small>{draft.naturalWidth} × {draft.naturalHeight} px</small></span></> : <span className="gb-design-picker__copy"><strong>Choose artwork</strong><small>or drop a PNG, JPG or WebP here</small></span>}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void onChoose(event.target.files); event.target.value = ""; }} />
      </label>
      {draft ? <div className="gb-dialog__fields gb-design-fields">
        <label><span>Width</span><span><input type="number" min="10" max="2000" step="0.01" value={round(draft.widthMm)} onChange={(event) => onDraftChange({ widthMm: clamp(Number(event.target.value), 10, 2000) })} /> mm</span></label>
        <label><span>Height</span><span><input type="number" min="10" max="2000" step="0.01" value={round(draft.heightMm)} onChange={(event) => onDraftChange({ heightMm: clamp(Number(event.target.value), 10, 2000) })} /> mm</span></label>
        <label><span>Copies</span><input type="number" min="1" max="50" step="1" value={draft.copies} onChange={(event) => onDraftChange({ copies: clamp(Math.round(Number(event.target.value)), 1, 50) })} /></label>
      </div> : null}
      <div className="gb-dialog__actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!draft}>Add to sheet</button></div>
    </form>
  </dialog>;
}

function LimitDialog({ currentCount, onClose }: { currentCount: number; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    buttonRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={dialogRef} className="gb-dialog gb-limit-dialog" aria-labelledby="gb-limit-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="gb-limit-dialog__body">
      <h2 id="gb-limit-title">Maximum 500 designs</h2>
      <p>This sheet currently has {currentCount} design{currentCount === 1 ? "" : "s"}. Remove designs or lower the copy count to continue.</p>
      <div className="gb-dialog__actions"><button ref={buttonRef} type="button" onClick={onClose}>Got it</button></div>
    </div>
  </dialog>;
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${PROXY_BASE}${path}`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "The request failed.");
  return payload;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function readThemeMode(embedded: boolean): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  if (embedded && typeof window !== "undefined" && window.parent !== window) {
    try { return readThemeModeFromRoot(window.parent.document.documentElement); } catch { /* Fall through. */ }
  }
  return readThemeModeFromRoot(document.documentElement);
}

function readThemeModeFromRoot(root: HTMLElement): "light" | "dark" {
  if (root.dataset.theme === "dark" || root.dataset.colorScheme === "dark" || root.classList.contains("dark")) return "dark";
  if (root.dataset.theme === "light" || root.dataset.colorScheme === "light") return "light";
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 }); URL.revokeObjectURL(url); };
    image.onerror = () => { reject(new Error(`${file.name} could not be read.`)); URL.revokeObjectURL(url); };
    image.src = url;
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An artwork preview could not be loaded for export."));
    image.src = src;
  });
}
