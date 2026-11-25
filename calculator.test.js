import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateSummary,
  calculateCostSummary,
  calculateVariableBreakdown,
  sanitizeCostItems,
  normalizePoints,
  pointsToSegments,
  addSplitPoint,
  getHandleGradient,
  calculateAllocations,
  getDynamicRangeMax,
  sanitizeLayout,
  setSegmentAmount,
  movePointWithLocks,
  moveGroupBoundary,
  snapGroupBoundaryIndex,
  parseRoomHash,
  buildRoomHash,
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

test("calculateSummary subtracts product packaging and shipping costs", () => {
  assert.deepEqual(calculateSummary(100, 40, 20, 5, 10), {
    revenue: 2000,
    profit: 900,
    margin: 45,
  });
});

test("calculateCostSummary subtracts every flexible cost item", () => {
  assert.deepEqual(calculateCostSummary(1500, [
    { label: "ต้นทุนสินค้า/ชิ้น", value: 116 },
    { label: "ค่าบรรจุภัณฑ์/ชิ้น", value: 20 },
    { label: "ค่าขนส่ง/ชิ้น", value: 0 },
  ], 1), {
    revenue: 1500,
    profit: 1364,
    margin: 90.93,
    totalUnitCost: 136,
  });
});

test("calculateVariableBreakdown uses sale price as 100 percent", () => {
  assert.deepEqual(calculateVariableBreakdown(1500, [
    { label: "ต้นทุนสินค้า/ชิ้น", value: 116 },
    { label: "ค่าบรรจุภัณฑ์/ชิ้น", value: 20 },
  ]), {
    segments: [
      { label: "ต้นทุนสินค้า/ชิ้น", value: 116, percent: 7.73, barPercent: 7.733333333333333 },
      { label: "ค่าบรรจุภัณฑ์/ชิ้น", value: 20, percent: 1.33, barPercent: 1.3333333333333335 },
      { label: "กำไร", value: 1364, percent: 90.93, barPercent: 90.93333333333334 },
    ],
    loss: 0,
    isLoss: false,
  });
});

test("calculateVariableBreakdown stays finite at zero price", () => {
  assert.deepEqual(calculateVariableBreakdown(0, [{ label: "ต้นทุน", value: 50 }]), {
    segments: [{ label: "ต้นทุน", value: 50, percent: 0, barPercent: 100 }],
    loss: 50,
    isLoss: true,
  });
});

test("calculateVariableBreakdown scales an over-budget bar without hiding actual percentages", () => {
  assert.deepEqual(calculateVariableBreakdown(100, [
    { label: "สินค้า", value: 80 },
    { label: "ขนส่ง", value: 40 },
  ]), {
    segments: [
      { label: "สินค้า", value: 80, percent: 80, barPercent: 66.66666666666666 },
      { label: "ขนส่ง", value: 40, percent: 40, barPercent: 33.33333333333333 },
    ],
    loss: 20,
    isLoss: true,
  });
});

test("sanitizeCostItems migrates the three legacy cost fields", () => {
  assert.deepEqual(sanitizeCostItems({ cost: 116, packagingCost: 20, shippingCost: 7 }), [
    { id: "legacy-product", label: "ต้นทุนสินค้า/ชิ้น", value: 116 },
    { id: "legacy-packaging", label: "ค่าบรรจุภัณฑ์/ชิ้น", value: 20 },
    { id: "legacy-shipping", label: "ค่าขนส่ง/ชิ้น", value: 7 },
  ]);
});

test("sanitizeCostItems cleans flexible items and keeps at least one row", () => {
  assert.deepEqual(sanitizeCostItems({ costItems: [
    { id: "one", label: "  ค่าแรง  ", value: -5 },
    { id: "two", label: "", value: 25 },
  ] }), [
    { id: "one", label: "ค่าแรง", value: 0 },
    { id: "two", label: "ต้นทุนที่ 2/ชิ้น", value: 25 },
  ]);
  assert.ok(sanitizeCostItems({ costItems: [] }).length >= 1);
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

test("normalizePoints sorts, preserves decimals, and keeps points apart", () => {
  assert.deepEqual(normalizePoints([90.2, 10.7, 10.9, -4, 140]), [0.01, 10.7, 10.9, 90.2, 99.99]);
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

test("setSegmentAmount moves the correct boundary from a typed money amount", () => {
  assert.deepEqual(setSegmentAmount([20, 59], 0, 200, 1200), [16.666667, 59]);
  assert.deepEqual(setSegmentAmount([20, 59], 1, 200, 1200), [20, 36.666667]);
  assert.deepEqual(setSegmentAmount([20, 59], 2, 200, 1200), [20, 83.333333]);
});

test("setSegmentAmount leaves points unchanged when the total is zero", () => {
  assert.deepEqual(setSegmentAmount([20, 59], 0, 200, 0), [20, 59]);
});

test("setSegmentAmount preserves an exact typed amount that needs a decimal percent", () => {
  const points = setSegmentAmount([20, 59], 0, 100, 1200);
  assert.ok(Math.abs(points[0] - 8.333333) < 0.000001);
  assert.equal(calculateAllocations(1200, points)[0].amount, 100);
});

test("moveGroupBoundary scales every unlocked segment on both sides proportionally", () => {
  const points = moveGroupBoundary([16, 29, 50], 1, 40);
  assert.ok(Math.abs(points[0] - 22.068966) < 0.000001);
  assert.equal(points[1], 40);
  assert.ok(Math.abs(points[2] - 57.746479) < 0.000001);
});

test("moveGroupBoundary keeps locked segment amounts fixed", () => {
  const points = moveGroupBoundary([16, 29, 50], 1, 40, [true, false, false, false]);
  assert.equal(points[0], 16);
  assert.equal(points[1], 40);
  assert.ok(Math.abs(points[2] - 57.746479) < 0.000001);
});

test("snapGroupBoundaryIndex selects the existing divider nearest to the Ctrl-drag position", () => {
  assert.equal(snapGroupBoundaryIndex([10, 32.4, 64.85, 78.29], 61), 2);
  assert.equal(snapGroupBoundaryIndex([10, 32.4, 64.85, 78.29], 35), 1);
});

test("snapGroupBoundaryIndex safely falls back when there are no dividers", () => {
  assert.equal(snapGroupBoundaryIndex([], 50), -1);
});

test("movePointWithLocks preserves a locked segment and changes the nearest unlocked segments", () => {
  assert.deepEqual(
    movePointWithLocks([20, 50, 70], 0, 30, [false, true, false, false]),
    [30, 60, 70],
  );
});

test("movePointWithLocks refuses movement when one side has no unlocked segment", () => {
  assert.deepEqual(
    movePointWithLocks([20, 50], 0, 30, [false, true, true]),
    [20, 50],
  );
});

test("movePointWithLocks clamps movement before an unlocked segment reaches zero", () => {
  assert.deepEqual(
    movePointWithLocks([20, 50, 70], 0, 50, [false, true, false, false]),
    [39.99, 69.99, 70],
  );
});

test("room credentials round-trip through a URL hash", () => {
  const room = "123e4567-e89b-42d3-a456-426614174000";
  const key = "123e4567-e89b-42d3-a456-426614174111";
  assert.deepEqual(parseRoomHash(buildRoomHash(room, key)), { room, key });
});

test("parseRoomHash rejects missing or invalid room credentials", () => {
  assert.equal(parseRoomHash("#room=bad&key=test"), null);
  assert.equal(parseRoomHash("#room=123e4567-e89b-42d3-a456-426614174000"), null);
});

test("state can be encoded into and decoded from a share link", () => {
  const state = { title: "Snack Box", groups: [{ price: 65, points: [40] }] };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("decodeState safely rejects malformed data", () => {
  assert.equal(decodeState("not-valid"), null);
});
