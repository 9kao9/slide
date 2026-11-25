import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSummary,
  normalizePoints,
  pointsToSegments,
  addSplitPoint,
  getHandleGradient,
  calculateAllocations,
  getDynamicRangeMax,
  sanitizeLayout,
  encodeState,
  decodeState,
} from "./calculator.js";

test("calculateSummary returns monthly revenue and gross profit", () => {
  assert.deepEqual(calculateSummary(65, 35, 3000), {
    revenue: 195000,
    profit: 90000,
    margin: 46.15,
  });
});

test("calculateSummary clamps invalid negative values to zero", () => {
  assert.deepEqual(calculateSummary(-10, 5, -3), {
    revenue: 0,
    profit: 0,
    margin: 0,
  });
});

test("pointsToSegments converts split points to percentages totaling 100", () => {
  assert.deepEqual(pointsToSegments([25, 70]), [25, 45, 30]);
});

test("normalizePoints sorts, rounds, and keeps points apart", () => {
  assert.deepEqual(normalizePoints([90.2, 10.7, 10.9, -4, 140]), [1, 11, 90, 99]);
});

test("addSplitPoint divides the widest segment at its midpoint", () => {
  assert.deepEqual(addSplitPoint([20, 40]), [20, 40, 70]);
});

test("split handle uses the colors of the segments on both sides", () => {
  assert.equal(
    getHandleGradient(1, ["#blue", "#orange", "#green"]),
    "linear-gradient(90deg, #orange 0 50%, #green 50% 100%)",
  );
});

test("calculateAllocations converts each percentage into money from a 100% total", () => {
  assert.deepEqual(calculateAllocations(1200, [20, 59]), [
    { percent: 20, amount: 240 },
    { percent: 39, amount: 468 },
    { percent: 41, amount: 492 },
  ]);
});

test("calculateAllocations treats invalid totals as zero", () => {
  assert.deepEqual(calculateAllocations(-100, [50]), [
    { percent: 50, amount: 0 },
    { percent: 50, amount: 0 },
  ]);
});

test("getDynamicRangeMax expands a slider when a typed value exceeds its original range", () => {
  assert.equal(getDynamicRangeMax(750, 500), 1000);
  assert.equal(getDynamicRangeMax(23000, 10000), 30000);
  assert.equal(getDynamicRangeMax(65, 500), 500);
});

test("sanitizeLayout accepts supported grid sizes and falls back safely", () => {
  assert.equal(sanitizeLayout("full"), "full");
  assert.equal(sanitizeLayout("halves"), "halves");
  assert.equal(sanitizeLayout("thirds"), "thirds");
  assert.equal(sanitizeLayout("quarters"), "thirds");
  assert.equal(sanitizeLayout("unknown"), "thirds");
});

test("state can be encoded into and decoded from a share link", () => {
  const state = { title: "Snack Box", groups: [{ price: 65, points: [40] }] };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("decodeState safely rejects malformed data", () => {
  assert.equal(decodeState("not-valid"), null);
});
