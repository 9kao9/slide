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
