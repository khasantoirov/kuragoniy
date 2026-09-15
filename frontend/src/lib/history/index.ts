/**
 * Global undo/redo — ported from js/history.js. One shared stack across
 * every editing surface (Timetable, Journal, Library, Lessons), exactly
 * like the old system: Ctrl+Z undoes the most recent action regardless of
 * which page it happened on. Each action is recorded as an
 * already-computed "before/after" pair rather than a generic command
 * object, since every mutation here is a REST PUT/PATCH that's naturally
 * idempotent to replay in either direction.
 *
 * Deliberately framework-free (no React/Zustand) so it can be called from
 * plain event handlers and mutation callbacks without needing to be
 * inside a component — AppShell wires the Ctrl+Z / Ctrl+Shift+Z keys and
 * surfaces the toast.
 */

export interface HistoryAction {
  label: string
  undo: () => Promise<void> | void
  redo: () => Promise<void> | void
}

export interface HistoryResult {
  ok: boolean
  label?: string
  error?: string
  empty?: boolean
}

const MAX = 20

let undoStack: HistoryAction[] = []
let redoStack: HistoryAction[] = []
let busy = false

/** Records a completed action. Call this AFTER the "after" state is
 * already saved — undo/redo just replay the given before/after writers. */
export function record(label: string, undo: HistoryAction['undo'], redo: HistoryAction['redo']) {
  undoStack.push({ label, undo, redo })
  if (undoStack.length > MAX) undoStack.shift()
  redoStack = []
}

export async function undoLast(): Promise<HistoryResult> {
  if (busy) return { ok: false }
  const a = undoStack.pop()
  if (!a) return { ok: false, empty: true }
  busy = true
  try {
    await a.undo()
    redoStack.push(a)
    return { ok: true, label: a.label }
  } catch (err) {
    undoStack.push(a)
    return { ok: false, label: a.label, error: err instanceof Error ? err.message : String(err) }
  } finally {
    busy = false
  }
}

export async function redoLast(): Promise<HistoryResult> {
  if (busy) return { ok: false }
  const a = redoStack.pop()
  if (!a) return { ok: false, empty: true }
  busy = true
  try {
    await a.redo()
    undoStack.push(a)
    return { ok: true, label: a.label }
  } catch (err) {
    redoStack.push(a)
    return { ok: false, label: a.label, error: err instanceof Error ? err.message : String(err) }
  } finally {
    busy = false
  }
}

export function clearHistory() {
  undoStack = []
  redoStack = []
}

export function hasUndo() {
  return undoStack.length > 0
}

export function hasRedo() {
  return redoStack.length > 0
}
