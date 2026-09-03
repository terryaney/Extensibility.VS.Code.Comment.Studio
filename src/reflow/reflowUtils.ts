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

/**
 * Returns true if a line consists entirely of two or more adjacent comment prefixes
 * with no actual text content — indicating a double-injection where both the VS Code
 * language enter-rule and another extension inserted a comment prefix on the same line.
 *
 * Example: "\t/// /// " → trimmed to "/// ///" → two "///" prefixes, no text → true.
 * Example: "\t/// some text" → has content after prefix → false.
 */
export function isDoubledCommentPrefix(lineText: string): boolean {
  const trimmed = lineText.trim();
  return (
    /^(\/\/\/[ \t]*){2,}$/.test(trimmed) ||
    /^(#[ \t]*){2,}$/.test(trimmed) ||
    /^(-{2}[ \t]*){2,}$/.test(trimmed) ||
    /^('[ \t]*){2,}$/.test(trimmed)
  );
}

/**
 * Matches a line whose leading run of comment prefixes is duplicated, optionally
 * followed by content: "\t/// /// text" → [indent, "///", " ///", "text"].
 */
const DUPLICATED_PREFIX_LINE = /^([ \t]*)(\/\/\/|#|--|')((?:[ \t]*\2)+)[ \t]*(.*)$/;

/**
 * Collapses a duplicated leading comment prefix run down to a single prefix.
 * Returns undefined when the line has no duplicated prefix.
 */
export function collapseDuplicatedPrefix(lineText: string): string | undefined {
  const m = lineText.match(DUPLICATED_PREFIX_LINE);
  if (!m) return undefined;
  const [, indent, prefix, , rest] = m;
  const collapsed = rest ? `${indent}${prefix} ${rest}` : `${indent}${prefix} `;
  return collapsed === lineText ? undefined : collapsed;
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
