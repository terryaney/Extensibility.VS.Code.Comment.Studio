/**
 * Edit suppression utilities for decoration management.
 * When a user is actively editing a comment block, decorations
 * should be temporarily hidden to avoid visual interference.
 */

export interface EditSuppressionState {
  /** Document URIs that are currently suppressed */
  suppressedDocuments: Set<string>;
  /** Timers for re-enabling decorations */
  timers: Map<string, NodeJS.Timeout>;
}

export function createEditSuppressionState(): EditSuppressionState {
  return {
    suppressedDocuments: new Set(),
    timers: new Map(),
  };
}

export function isSuppressed(state: EditSuppressionState, documentUri: string): boolean {
  return state.suppressedDocuments.has(documentUri);
}

export function suppress(state: EditSuppressionState, documentUri: string, delay: number, onResume: () => void): void {
  state.suppressedDocuments.add(documentUri);

  // Clear existing timer
  const existingTimer = state.timers.get(documentUri);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new timer
  const timer = setTimeout(() => {
    state.suppressedDocuments.delete(documentUri);
    state.timers.delete(documentUri);
    onResume();
  }, delay);

  state.timers.set(documentUri, timer);
}

export function disposeEditSuppression(state: EditSuppressionState): void {
  for (const timer of state.timers.values()) {
    clearTimeout(timer);
  }
  state.timers.clear();
  state.suppressedDocuments.clear();
}
