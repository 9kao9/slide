const DEFAULT_LIMIT = 50;
const BURST_WINDOW_MS = 700;

export function createUndoHistory(initialState, limit = DEFAULT_LIMIT) {
  return {
    past: [],
    current: initialState,
    limit: Math.max(1, Number(limit) || DEFAULT_LIMIT),
    lastKey: "",
    lastRecordedAt: 0,
  };
}

export function recordUndoState(history, nextState, key = "page-action", now = Date.now()) {
  if (nextState === history.current) return false;
  const continuesBurst = history.lastKey === key && now - history.lastRecordedAt <= BURST_WINDOW_MS;
  if (!continuesBurst) {
    history.past.push(history.current);
    if (history.past.length > history.limit) history.past.splice(0, history.past.length - history.limit);
  }
  history.current = nextState;
  history.lastKey = key;
  history.lastRecordedAt = now;
  return true;
}

export function undoState(history) {
  if (!history.past.length) return null;
  const previous = history.past.pop();
  history.current = previous;
  history.lastKey = "";
  history.lastRecordedAt = 0;
  return previous;
}
