import test from "node:test";
import assert from "node:assert/strict";

import { createUndoHistory, recordUndoState, undoState } from "./history.js";

test("undo restores the state before the latest action", () => {
  const history = createUndoHistory("A");
  recordUndoState(history, "B", "price", 1000);
  recordUndoState(history, "C", "cost", 2000);
  assert.equal(undoState(history), "B");
  assert.equal(undoState(history), "A");
  assert.equal(undoState(history), null);
});

test("continuous changes from the same control become one undo action", () => {
  const history = createUndoHistory("A");
  recordUndoState(history, "B", "group-slider", 1000);
  recordUndoState(history, "C", "group-slider", 1200);
  recordUndoState(history, "D", "group-slider", 1400);
  assert.equal(undoState(history), "A");
});

test("the same control starts a new undo action after the burst window", () => {
  const history = createUndoHistory("A");
  recordUndoState(history, "B", "group-slider", 1000);
  recordUndoState(history, "C", "group-slider", 2500);
  assert.equal(undoState(history), "B");
});
