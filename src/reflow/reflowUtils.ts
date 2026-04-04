/**
 * Utility types and functions for reflow operations that have no VS Code dependency,
 * making them unit-testable without a VS Code mock.
 */

export interface PlainRange {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

export interface MinimalEdit {
  range: PlainRange;
  text: string;
}

/**
 * Computes the minimal edit by diffing old vs new lines.
 * Returns only the changed sub-range and the replacement text,
 * or null if there is no change.
 */
export function computeMinimalEditRange(
  oldLines: string[],
  newLines: string[],
  blockStartLine: number,
): MinimalEdit | null {
  let firstDiff = 0;
  while (firstDiff < oldLines.length && firstDiff < newLines.length && oldLines[firstDiff] === newLines[firstDiff]) {
    firstDiff++;
  }

  if (firstDiff === oldLines.length && firstDiff === newLines.length) {
    return null;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= firstDiff && newEnd >= firstDiff && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  return {
    range: {
      startLine: blockStartLine + firstDiff,
      startChar: 0,
      endLine: blockStartLine + oldEnd,
      endChar: oldLines[oldEnd]?.length ?? 0,
    },
    text: newLines.slice(firstDiff, newEnd + 1).join('\n'),
  };
}
