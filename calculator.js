export function calculateSummary(price, cost, quantity, packagingCost = 0, shippingCost = 0) {
  const safePrice = Math.max(0, Number(price) || 0);
  const safeCost = Math.max(0, Number(cost) || 0);
  const safePackagingCost = Math.max(0, Number(packagingCost) || 0);
  const safeShippingCost = Math.max(0, Number(shippingCost) || 0);
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const revenue = safePrice * safeQuantity;
  const totalUnitCost = safeCost + safePackagingCost + safeShippingCost;
  const profit = Math.max(0, safePrice - totalUnitCost) * safeQuantity;
  const margin = revenue ? Number(((profit / revenue) * 100).toFixed(2)) : 0;
  return { revenue, profit, margin };
}

export function calculateCostSummary(price, costItems, quantity) {
  const safeItems = Array.isArray(costItems) ? costItems : [];
  const totalUnitCost = safeItems.reduce((total, item) => total + Math.max(0, Number(item?.value) || 0), 0);
  const summary = calculateSummary(price, totalUnitCost, quantity);
  return { ...summary, totalUnitCost };
}

export function calculateVariableBreakdown(price, costItems) {
  const safePrice = Math.max(0, Number(price) || 0);
  const safeItems = (Array.isArray(costItems) ? costItems : []).map((item, index) => ({
    label: String(item?.label || `ต้นทุนที่ ${index + 1}`),
    value: Math.max(0, Number(item?.value) || 0),
  }));
  const totalCost = safeItems.reduce((total, item) => total + item.value, 0);
  const loss = Math.max(0, totalCost - safePrice);
  const isLoss = loss > 0 || (safePrice === 0 && totalCost > 0);
  const profit = Math.max(0, safePrice - totalCost);
  const visualTotal = isLoss ? totalCost : safePrice;
  const toSegment = (item) => ({
    ...item,
    percent: safePrice ? Number(((item.value / safePrice) * 100).toFixed(2)) : 0,
    barPercent: visualTotal ? (item.value / visualTotal) * 100 : 0,
  });
  const segments = safeItems.map(toSegment);
  if (!isLoss && profit > 0) segments.push(toSegment({ label: "กำไร", value: profit }));
  return { segments, loss, isLoss };
}

export function sanitizeCostItems(group) {
  const supplied = Array.isArray(group?.costItems) && group.costItems.length
    ? group.costItems
    : [
        { id: "legacy-product", label: "ต้นทุนสินค้า/ชิ้น", value: group?.cost },
        { id: "legacy-packaging", label: "ค่าบรรจุภัณฑ์/ชิ้น", value: group?.packagingCost },
        { id: "legacy-shipping", label: "ค่าขนส่ง/ชิ้น", value: group?.shippingCost },
      ];
  return supplied.slice(0, 12).map((item, index) => {
    const label = String(item?.label || "").trim().slice(0, 40) || `ต้นทุนที่ ${index + 1}/ชิ้น`;
    return {
      id: typeof item?.id === "string" && item.id ? item.id : `cost-${index + 1}`,
      label,
      value: Math.min(100000000, Math.max(0, Number(item?.value) || 0)),
    };
  });
}

export function normalizePoints(points) {
  const round = (value) => Number(value.toFixed(6));
  const sorted = [...points]
    .map((point) => round(Math.min(99.99, Math.max(0.01, Number(point) || 0))))
    .sort((a, b) => a - b);
  return sorted.filter((point, index) => index === 0 || point - sorted[index - 1] >= 0.01);
}

export function pointsToSegments(points) {
  const normalized = normalizePoints(points);
  const edges = [0, ...normalized, 100];
  return edges.slice(1).map((edge, index) => Number((edge - edges[index]).toFixed(6)));
}

export function addSplitPoint(points) {
  const normalized = normalizePoints(points);
  const edges = [0, ...normalized, 100];
  let widestIndex = 0;
  for (let index = 1; index < edges.length - 1; index += 1) {
    if (edges[index + 1] - edges[index] > edges[widestIndex + 1] - edges[widestIndex]) {
      widestIndex = index;
    }
  }
  const midpoint = Math.round((edges[widestIndex] + edges[widestIndex + 1]) / 2);
  return normalizePoints([...normalized, midpoint]);
}

export function getHandleGradient(pointIndex, colors) {
  const left = colors[pointIndex % colors.length];
  const right = colors[(pointIndex + 1) % colors.length];
  return `linear-gradient(90deg, ${left} 0 50%, ${right} 50% 100%)`;
}

export function calculateAllocations(total, points) {
  const safeTotal = Math.max(0, Number(total) || 0);
  return pointsToSegments(points).map((percent) => ({
    percent,
    amount: Math.round((safeTotal * percent) / 100),
  }));
}

export function getDynamicRangeMax(value, baseMax) {
  const safeBase = Math.max(1, Number(baseMax) || 1);
  const safeValue = Math.max(0, Number(value) || 0);
  return Math.max(safeBase, Math.ceil(safeValue / safeBase) * safeBase);
}

export function sanitizeLayout(layout) {
  return ["full", "halves", "thirds"].includes(layout) ? layout : "thirds";
}

export function movePointWithLocks(points, pointIndex, requestedValue, locks = []) {
  const normalized = normalizePoints(points);
  if (pointIndex < 0 || pointIndex >= normalized.length) return normalized;
  const widths = pointsToSegments(normalized);
  const locked = widths.map((_, index) => Boolean(locks[index]));
  let leftIndex = pointIndex;
  while (leftIndex >= 0 && locked[leftIndex]) leftIndex -= 1;
  let rightIndex = pointIndex + 1;
  while (rightIndex < widths.length && locked[rightIndex]) rightIndex += 1;
  if (leftIndex < 0 || rightIndex >= widths.length) return normalized;

  const requestedDelta = (Number(requestedValue) || 0) - normalized[pointIndex];
  const delta = Math.min(widths[rightIndex] - 0.01, Math.max(-(widths[leftIndex] - 0.01), requestedDelta));
  widths[leftIndex] += delta;
  widths[rightIndex] -= delta;
  let runningTotal = 0;
  return widths.slice(0, -1).map((width) => Number((runningTotal += width).toFixed(6)));
}

export function moveGroupBoundary(points, boundaryIndex, requestedValue, locks = []) {
  const normalized = normalizePoints(points);
  if (boundaryIndex < 0 || boundaryIndex >= normalized.length) return normalized;
  const widths = pointsToSegments(normalized);
  const split = boundaryIndex + 1;
  const locked = widths.map((_, index) => Boolean(locks[index]));
  const leftUnlocked = widths.slice(0, split).some((_, index) => !locked[index]);
  const rightUnlocked = widths.slice(split).some((_, index) => !locked[index + split]);
  if (!leftUnlocked || !rightUnlocked) return normalized;

  const minimumForSide = (start, end) => widths.slice(start, end).reduce(
    (total, width, localIndex) => total + (locked[start + localIndex] ? width : 0.01),
    0,
  );
  const minimumLeft = minimumForSide(0, split);
  const minimumRight = minimumForSide(split, widths.length);
  const boundary = Math.min(100 - minimumRight, Math.max(minimumLeft, Number(requestedValue) || 0));

  const scaleSide = (start, end, target) => {
    const indexes = Array.from({ length: end - start }, (_, index) => start + index);
    const lockedTotal = indexes.reduce((total, index) => total + (locked[index] ? widths[index] : 0), 0);
    const unlockedTotal = indexes.reduce((total, index) => total + (!locked[index] ? widths[index] : 0), 0);
    const available = Math.max(0, target - lockedTotal);
    indexes.forEach((index) => {
      if (!locked[index]) widths[index] = available * (widths[index] / unlockedTotal);
    });
  };

  scaleSide(0, split, boundary);
  scaleSide(split, widths.length, 100 - boundary);
  let runningTotal = 0;
  return widths.slice(0, -1).map((width) => Number((runningTotal += width).toFixed(6)));
}

export function snapGroupBoundaryIndex(points, requestedValue) {
  const normalized = normalizePoints(points);
  if (!normalized.length) return -1;
  const target = Number(requestedValue) || 0;
  return normalized.reduce((nearestIndex, point, index) =>
    Math.abs(point - target) < Math.abs(normalized[nearestIndex] - target) ? index : nearestIndex, 0);
}

export function setSegmentAmount(points, segmentIndex, amount, total, locks = []) {
  const normalized = normalizePoints(points);
  const safeTotal = Math.max(0, Number(total) || 0);
  if (!safeTotal || segmentIndex < 0 || segmentIndex > normalized.length) return normalized;

  const targetPercent = Math.min(99.99, Math.max(0.01, (Math.max(0, Number(amount) || 0) / safeTotal) * 100));
  if (!normalized.length) return normalized;
  const editableLocks = pointsToSegments(normalized).map((_, index) => index === segmentIndex ? false : Boolean(locks[index]));
  const pointIndex = segmentIndex < normalized.length ? segmentIndex : normalized.length - 1;
  const leftEdge = segmentIndex === 0 ? 0 : normalized[segmentIndex - 1];
  const requestedBoundary = segmentIndex < normalized.length ? leftEdge + targetPercent : 100 - targetPercent;
  return movePointWithLocks(normalized, pointIndex, requestedBoundary, editableLocks);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildRoomHash(room, key) {
  return `#${new URLSearchParams({ room, key }).toString()}`;
}

export function parseRoomHash(hash) {
  const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const room = params.get("room");
  const key = params.get("key");
  return UUID_PATTERN.test(room || "") && UUID_PATTERN.test(key || "") ? { room, key } : null;
}

export function encodeState(state) {
  const utf8 = encodeURIComponent(JSON.stringify(state)).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return btoa(utf8).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeState(encoded) {
  try {
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(base64);
    const escaped = Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");
    return JSON.parse(decodeURIComponent(escaped));
  } catch {
    return null;
  }
}
