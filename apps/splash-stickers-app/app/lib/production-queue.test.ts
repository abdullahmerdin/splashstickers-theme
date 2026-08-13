import assert from "node:assert/strict";
import test from "node:test";

import { groupProductionOrdersByDay, hasActiveProductionFiles, productionDayKey } from "./production-queue";

test("production queue detects work that needs live polling", () => {
  assert.equal(hasActiveProductionFiles([{ productionFileStatus: "READY" }]), false);
  assert.equal(hasActiveProductionFiles([{ productionFileStatus: "FAILED" }, { productionFileStatus: "PENDING" }]), true);
  assert.equal(hasActiveProductionFiles([{ productionFileStatus: "PROCESSING" }]), true);
});

test("production queue groups newest order days first without reordering rows", () => {
  const today = new Date("2026-08-13T14:30:00Z");
  const todayEarlier = new Date("2026-08-12T21:15:00Z");
  const yesterday = new Date("2026-08-12T18:00:00Z");
  const groups = groupProductionOrdersByDay([
    { id: "new", createdAt: today, productionFileStatus: "READY" },
    { id: "new-earlier", createdAt: todayEarlier, productionFileStatus: "FAILED" },
    { id: "old", createdAt: yesterday, productionFileStatus: "READY" },
  ]);

  assert.deepEqual(groups.map((group) => group.key), [productionDayKey(today), productionDayKey(yesterday)]);
  assert.equal(groups[0].key, "2026-08-13");
  assert.deepEqual(groups[0].orders.map((order) => order.id), ["new", "new-earlier"]);
});
