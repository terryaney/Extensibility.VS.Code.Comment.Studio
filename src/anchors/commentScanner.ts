export interface CommentLineInfo {
  lineIndex: number;
  /** Column index where the comment portion starts. -1 if the line has no comment. */
  commentStart: number;
}

interface BlockPair {
  open: string;
  close: string;
}

const SINGLE_LINE_MARKERS: string[] = ['//', '--', '#', "'"];

const BLOCK_PAIRS: BlockPair[] = [
  { open: '/*', close: '*/' },
  { open: '<!--', close: '-->' },
  { open: '<#', close: '#>' },
];

interface OpenerResult {
  index: number;
  marker: string;
  blockClose?: string; // defined when opener is a block-comment start
}

/** Find the earliest comment opener on a line starting from `from`, preferring longer markers at equal positions. */
function findFirstOpener(line: string, from: number): OpenerResult | null {
  let best: OpenerResult | null = null;

  const consider = (index: number, marker: string, blockClose?: string) => {
    if (index < 0) return;
    if (
      best === null ||
      index < best.index ||
      (index === best.index && marker.length > best.marker.length)
    ) {
      best = { index, marker, blockClose };
    }
  };

  for (const pair of BLOCK_PAIRS) {
    consider(line.indexOf(pair.open, from), pair.open, pair.close);
  }
  for (const marker of SINGLE_LINE_MARKERS) {
    consider(line.indexOf(marker, from), marker);
  }

  return best;
}

/**
 * Scans an array of lines and returns one CommentLineInfo per line that
 * contains a comment (or is inside a block comment). Lines with no comment
 * portion are omitted — callers can check by index or use the full array form.
 *
 * Block-comment state is tracked across lines, so interior lines of
 * `/* ... *\/`, `<!-- ... -->`, and `<# ... #>` are correctly identified.
 */
export function scanCommentLines(lines: string[]): CommentLineInfo[] {
  const results: CommentLineInfo[] = [];

  let inBlock = false;
  let blockClose = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inBlock) {
      // Entire line is inside a block comment.
      const closeIdx = line.indexOf(blockClose);
      if (closeIdx >= 0) {
        inBlock = false;
        blockClose = '';
      }
      results.push({ lineIndex: i, commentStart: 0 });
      continue;
    }

    // Scan for the first opener on this line.
    const opener = findFirstOpener(line, 0);
    if (opener === null) continue;

    if (opener.blockClose) {
      // Block comment opened on this line.
      inBlock = true;
      blockClose = opener.blockClose;

      // Check if the block also closes on the same line.
      const closeIdx = line.indexOf(opener.blockClose, opener.index + opener.marker.length);
      if (closeIdx >= 0) {
        inBlock = false;
        blockClose = '';
      }
    }

    results.push({ lineIndex: i, commentStart: opener.index });
  }

  return results;
}

/**
 * Convenience form: returns a Map<lineIndex, commentStart> for O(1) lookup.
 */
export function scanCommentLinesMap(lines: string[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const info of scanCommentLines(lines)) {
    map.set(info.lineIndex, info.commentStart);
  }
  return map;
}
