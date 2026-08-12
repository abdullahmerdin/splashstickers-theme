export type SheetGeometry = {
  widthMm: number;
  heightMm: number;
  gapMm: number;
};

export type LayoutItem = {
  id: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const MIN_ITEM_MM = 10;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function rotatedBounds(item: LayoutItem): Bounds {
  const radians = (Number(item.rotation) || 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = item.widthMm * cos + item.heightMm * sin;
  const height = item.widthMm * sin + item.heightMm * cos;
  const centerX = item.xMm + item.widthMm / 2;
  const centerY = item.yMm + item.heightMm / 2;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

export function boundsOverlap(first: Bounds, second: Bounds, gapMm = 0) {
  return first.x < second.x + second.width + gapMm
    && first.x + first.width + gapMm > second.x
    && first.y < second.y + second.height + gapMm
    && first.y + first.height + gapMm > second.y;
}

export function itemsOverlap(first: LayoutItem, second: LayoutItem, gapMm = 0) {
  return boundsOverlap(rotatedBounds(first), rotatedBounds(second), Math.max(0, gapMm));
}

export function isInsideSheet(item: LayoutItem, sheet: SheetGeometry) {
  const bounds = rotatedBounds(item);
  const epsilon = 0.01;
  return bounds.x >= -epsilon
    && bounds.y >= -epsilon
    && bounds.x + bounds.width <= sheet.widthMm + epsilon
    && bounds.y + bounds.height <= sheet.heightMm + epsilon;
}

export function isPlacementValid(
  candidate: LayoutItem,
  items: LayoutItem[],
  sheet: SheetGeometry,
  excludedIds: Iterable<string> = [candidate.id],
) {
  if (!isInsideSheet(candidate, sheet)) return false;
  const excluded = new Set(excludedIds);
  return items.every((other) => excluded.has(other.id) || !itemsOverlap(candidate, other, sheet.gapMm));
}

export function isLayoutValid(items: LayoutItem[], sheet: SheetGeometry) {
  for (let index = 0; index < items.length; index += 1) {
    if (!isInsideSheet(items[index], sheet)) return false;
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      if (itemsOverlap(items[index], items[otherIndex], sheet.gapMm)) return false;
    }
  }
  return true;
}

export function constrainItemToSheet<T extends LayoutItem>(item: T, sheet: SheetGeometry): T {
  let next = {
    ...item,
    widthMm: clamp(item.widthMm, MIN_ITEM_MM, sheet.widthMm),
    heightMm: clamp(item.heightMm, MIN_ITEM_MM, sheet.heightMm),
  };
  let bounds = rotatedBounds(next);
  const scale = Math.min(1, sheet.widthMm / bounds.width, sheet.heightMm / bounds.height);
  if (scale < 1) {
    next = {
      ...next,
      widthMm: Math.max(MIN_ITEM_MM, next.widthMm * scale),
      heightMm: Math.max(MIN_ITEM_MM, next.heightMm * scale),
    };
    bounds = rotatedBounds(next);
  }
  if (bounds.x < 0) next.xMm -= bounds.x;
  if (bounds.y < 0) next.yMm -= bounds.y;
  bounds = rotatedBounds(next);
  if (bounds.x + bounds.width > sheet.widthMm) next.xMm -= bounds.x + bounds.width - sheet.widthMm;
  if (bounds.y + bounds.height > sheet.heightMm) next.yMm -= bounds.y + bounds.height - sheet.heightMm;
  return {
    ...next,
    xMm: round(next.xMm),
    yMm: round(next.yMm),
    widthMm: round(next.widthMm),
    heightMm: round(next.heightMm),
  };
}

function atBoundsOrigin<T extends LayoutItem>(item: T, x: number, y: number): T {
  const bounds = rotatedBounds(item);
  return {
    ...item,
    xMm: round(x - (bounds.x - item.xMm)),
    yMm: round(y - (bounds.y - item.yMm)),
  };
}

export function findOpenPlacement<T extends LayoutItem>(item: T, placed: T[], sheet: SheetGeometry): T | null {
  const gap = Math.max(0, sheet.gapMm);
  const candidates: Array<{ x: number; y: number }> = [{ x: gap, y: gap }];
  for (const other of placed) {
    const bounds = rotatedBounds(other);
    candidates.push(
      { x: bounds.x + bounds.width + gap, y: bounds.y },
      { x: gap, y: bounds.y + bounds.height + gap },
      { x: bounds.x, y: bounds.y + bounds.height + gap },
    );
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const position of candidates) {
    const candidate = atBoundsOrigin(item, position.x, position.y);
    if (isPlacementValid(candidate, placed, sheet)) return candidate;
  }

  const itemBounds = rotatedBounds(item);
  const step = Math.max(2, gap || 2);
  for (let y = gap; y + itemBounds.height <= sheet.heightMm; y += step) {
    for (let x = gap; x + itemBounds.width <= sheet.widthMm; x += step) {
      const candidate = atBoundsOrigin(item, x, y);
      if (isPlacementValid(candidate, placed, sheet)) return candidate;
    }
  }
  return null;
}

export function autoArrange<T extends LayoutItem>(items: T[], sheet: SheetGeometry, growVertically = false) {
  const gap = Math.max(0, sheet.gapMm);
  const entries = items.map((item, index) => {
    const bounds = rotatedBounds(item);
    return {
      item,
      index,
      bounds,
      offsetX: bounds.x - item.xMm,
      offsetY: bounds.y - item.yMm,
    };
  }).sort((first, second) => (
    second.bounds.width * second.bounds.height - first.bounds.width * first.bounds.height
    || second.bounds.height - first.bounds.height
    || first.index - second.index
  ));
  const placedBounds: Bounds[] = [];
  const arranged = new Map<string, T>();
  const unplacedIds: string[] = [];
  let requiredHeightMm = 0;

  for (const entry of entries) {
    if (entry.bounds.width > sheet.widthMm + 0.01) {
      unplacedIds.push(entry.item.id);
      continue;
    }
    const xCandidates = [0];
    const yCandidates = [0];
    for (const bounds of placedBounds) {
      xCandidates.push(bounds.x + bounds.width + gap);
      yCandidates.push(bounds.y + bounds.height + gap);
    }
    xCandidates.sort((a, b) => a - b);
    yCandidates.sort((a, b) => a - b);
    let slot: Bounds | null = null;
    for (const y of yCandidates) {
      for (const x of xCandidates) {
        const candidate = { x, y, width: entry.bounds.width, height: entry.bounds.height };
        if (candidate.x + candidate.width > sheet.widthMm + 0.01) continue;
        if (!growVertically && candidate.y + candidate.height > sheet.heightMm + 0.01) continue;
        if (!placedBounds.some((bounds) => boundsOverlap(candidate, bounds, gap))) {
          slot = candidate;
          break;
        }
      }
      if (slot) break;
    }
    if (!slot && growVertically) {
      const bottom = placedBounds.reduce((value, bounds) => Math.max(value, bounds.y + bounds.height), 0);
      slot = { x: 0, y: bottom > 0 ? bottom + gap : 0, width: entry.bounds.width, height: entry.bounds.height };
    }
    if (!slot) {
      unplacedIds.push(entry.item.id);
      continue;
    }
    const next = {
      ...entry.item,
      xMm: round(slot.x - entry.offsetX),
      yMm: round(slot.y - entry.offsetY),
    };
    arranged.set(entry.item.id, next);
    placedBounds.push(slot);
    requiredHeightMm = Math.max(requiredHeightMm, slot.y + slot.height);
  }

  if (unplacedIds.length) return { items, unplacedIds, requiredHeightMm: sheet.heightMm };
  return {
    items: items.map((item) => arranged.get(item.id) || item),
    unplacedIds,
    requiredHeightMm: growVertically ? Math.max(sheet.heightMm, Math.ceil(requiredHeightMm)) : sheet.heightMm,
  };
}

export function itemsInSelection(items: LayoutItem[], selection: Bounds) {
  return items.filter((item) => boundsOverlap(rotatedBounds(item), selection)).map((item) => item.id);
}
