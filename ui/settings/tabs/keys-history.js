// =====================================================================================================================
//  Undo and redo for the Keys tab. It remembers what the current layout's key edits (hidden keys, labels, moved keys)
//  looked like after each change, so the Undo and Redo buttons can step back and forward.
//
//  How it works: every time the tab is drawn, keys.js calls observe() with a snapshot (plain text) of the layout's edits.
//  If the snapshot differs from the last one, something was changed since, so the old snapshot becomes an undo step. That
//  way one drag, one nudge, one Align click and so on are each one step, without every place that edits keys having to
//  remember to report it.
//
//  Kept in memory only: it is gone when the settings window closes, and it starts again when you switch layout.
//  No page code in here, so tests/ui can run it with Node.
// =====================================================================================================================

export const MAX_HISTORY = 50; // how many steps back you can go

let layoutId = null; // the layout the history belongs to
let current = null; // the snapshot that is in effect now
let undoSteps = []; // older snapshots, the most recent last
let redoSteps = []; // snapshots that were undone, the most recently undone last

/** Call after every draw of the Keys tab with the layout's id and a snapshot of its edits. */
export function observe(id, snapshot) {
  if (id !== layoutId) {
    layoutId = id;
    current = snapshot;
    undoSteps = [];
    redoSteps = [];
    return;
  }
  if (snapshot === current) return;
  undoSteps.push(current);
  if (undoSteps.length > MAX_HISTORY) undoSteps.shift();
  redoSteps = []; // a new change ends the chance to redo what was undone
  current = snapshot;
}

export const canUndo = () => undoSteps.length > 0;
export const canRedo = () => redoSteps.length > 0;

/** Step back. Returns the snapshot to put back, or null when there is nothing to undo. */
export function undo() {
  if (!canUndo()) return null;
  redoSteps.push(current);
  current = undoSteps.pop();
  return current;
}

/** Step forward again. Returns the snapshot to put back, or null when there is nothing to redo. */
export function redo() {
  if (!canRedo()) return null;
  undoSteps.push(current);
  current = redoSteps.pop();
  return current;
}

/** Forget everything (used by tests). */
export function clearHistory() {
  layoutId = null;
  current = null;
  undoSteps = [];
  redoSteps = [];
}
