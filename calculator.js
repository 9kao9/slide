export function calculateSummary(price, cost, quantity) {
  const safePrice = Math.max(0, Number(price) || 0);
  const safeCost = Math.max(0, Number(cost) || 0);
  const safeQuantity = Math.max(0, Number(quantity) || 0);
  const revenue = safePrice * safeQuantity;
  const profit = Math.max(0, safePrice - safeCost) * safeQuantity;
  const margin = revenue ? Number(((profit / revenue) * 100).toFixed(2)) : 0;
  return { revenue, profit, margin };
}

export function normalizePoints(points) {
  const sorted = [...points]
    .map((point) => Math.min(99, Math.max(1, Math.round(Number(point) || 0))))
    .sort((a, b) => a - b);
  return sorted.filter((point, index) => index === 0 || point > sorted[index - 1]);
}

export function pointsToSegments(points) {
  const normalized = normalizePoints(points);
  const edges = [0, ...normalized, 100];
  return edges.slice(1).map((edge, index) => edge - edges[index]);
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

  const requestedDelta = Math.round(Number(requestedValue) || 0) - normalized[pointIndex];
  const delta = Math.min(widths[rightIndex] - 1, Math.max(-(widths[leftIndex] - 1), requestedDelta));
  widths[leftIndex] += delta;
  widths[rightIndex] -= delta;
  let runningTotal = 0;
  return widths.slice(0, -1).map((width) => (runningTotal += width));
}

export function setSegmentAmount(points, segmentIndex, amount, total, locks = []) {
  const normalized = normalizePoints(points);
  const safeTotal = Math.max(0, Number(total) || 0);
  if (!safeTotal || segmentIndex < 0 || segmentIndex > normalized.length) return normalized;

  const targetPercent = Math.min(99, Math.max(1, Math.round((Math.max(0, Number(amount) || 0) / safeTotal) * 100)));
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
