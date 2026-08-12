import assert from "node:assert/strict";
import test from "node:test";

import {
  autoArrange,
  constrainItemToSheet,
  findOpenPlacement,
  isLayoutValid,
  isPlacementValid,
  itemsOverlap,
  rotatedBounds,
} from "./gangsheet-editor.ts";

const sheet = { widthMm: 200, heightMm: 120, gapMm: 3 };
const item = (id, xMm, yMm, widthMm = 40, heightMm = 30, rotation = 0) => ({
  id, xMm, yMm, widthMm, heightMm, rotation,
});

test("rotated bounds are centered and account for rotation", () => {
  const bounds = rotatedBounds(item("a", 20, 30, 40, 20, 90));
  assert.equal(Math.round(bounds.width), 20);
  assert.equal(Math.round(bounds.height), 40);
  assert.equal(Math.round(bounds.x), 30);
  assert.equal(Math.round(bounds.y), 20);
});

test("collision checks include the configured print gap", () => {
  const first = item("a", 0, 0, 40, 30);
  assert.equal(itemsOverlap(first, item("b", 42, 0), 3), true);
  assert.equal(itemsOverlap(first, item("b", 43, 0), 3), false);
});

test("placement validation rejects overlap and out-of-sheet transforms", () => {
  const first = item("a", 10, 10);
  assert.equal(isPlacementValid(item("b", 53, 10), [first], sheet), true);
  assert.equal(isPlacementValid(item("b", 50, 10), [first], sheet), false);
  assert.equal(isPlacementValid(item("b", 180, 10), [first], sheet), false);
});

test("new artwork receives the first open non-overlapping placement", () => {
  const placed = [item("a", 3, 3), item("b", 46, 3)];
  const next = findOpenPlacement(item("c", 0, 0), placed, sheet);
  assert.ok(next);
  assert.equal(isPlacementValid(next, placed, sheet), true);
});

test("auto arrange never accepts a partially overlapping result", () => {
  const source = [item("a", 10, 10, 55, 35), item("b", 20, 20, 40, 30), item("c", 30, 25, 35, 25)];
  const result = autoArrange(source, sheet);
  assert.deepEqual(result.unplacedIds, []);
  assert.equal(isLayoutValid(result.items, sheet), true);
});

test("legacy auto arrange fills exposed edges and grows the sheet vertically", () => {
  const compactSheet = { widthMm: 110, heightMm: 60, gapMm: 3 };
  const source = [
    item("a", 0, 0, 60, 50),
    item("b", 0, 0, 40, 20),
    item("c", 0, 0, 40, 27),
    item("d", 0, 0, 60, 30),
  ];
  const result = autoArrange(source, compactSheet, true);
  assert.deepEqual(result.unplacedIds, []);
  assert.ok(result.requiredHeightMm > compactSheet.heightMm);
  assert.equal(isLayoutValid(result.items, { ...compactSheet, heightMm: result.requiredHeightMm }), true);
  assert.equal(result.items.find((entry) => entry.id === "b").xMm, 63);
  assert.equal(result.items.find((entry) => entry.id === "c").xMm, 63);
});

test("constraining a rotated item keeps its visual bounds on the sheet", () => {
  const constrained = constrainItemToSheet(item("a", -30, -20, 80, 45, 35), sheet);
  assert.equal(isPlacementValid(constrained, [], sheet), true);
});
