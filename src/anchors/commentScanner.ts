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

/**
 * Languages and file extensions treated as prose rather than code. In these
 * files there is no comment marker to look for — the whole document reads like
 * a comment — so every line is scannable for anchors.
 */
const PROSE_LANGUAGE_IDS = new Set(['markdown']);
const PROSE_EXTENSIONS = new Set(['.md', '.markdown']);

/** True when a VS Code language ID identifies a prose document. */
export function isProseLanguageId(languageId: string): boolean {
  return PROSE_LANGUAGE_IDS.has(languageId);
}

/** True when a file path identifies a prose document. */
export function isProseFilePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  return PROSE_EXTENSIONS.has(filePath.substring(dot).toLowerCase());
}

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

/**
 * Returns the index of the closing quote for the string literal opening at
 * `start`, or the line length when the literal is left unterminated.
 */
function skipQuoted(line: string, start: number, quote: string): number {
  for (let i = start + 1; i < line.length; i++) {
    if (line[i] === '\\') { i++; continue; }
    if (line[i] === quote) return i;
  }
  return line.length;
}

/**
 * Returns the index of the closing quote when `start` begins a character
 * literal such as `'a'` or `'\n'`, otherwise -1.
 *
 * A lone `'` is ambiguous — a character literal in C-family languages, a
 * comment in VB — so the shape of the text decides.
 */
function charLiteralEnd(line: string, start: number): number {
  if (line[start + 1] === '\\' && line[start + 3] === "'") return start + 3;
  if (line[start + 1] !== undefined && line[start + 1] !== "'" && line[start + 2] === "'") return start + 2;
  return -1;
}

/**
 * Finds the earliest comment opener on a line at or after `from`, skipping over
 * string and character literals so that a marker inside one — `"http://x"`,
 * `"don't"`, `"# 1"` — is not mistaken for the start of a comment.
 */
export function findCommentOpener(line: string, from = 0): OpenerResult | null {
  for (let i = from; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"' || ch === '`') {
      i = skipQuoted(line, i, ch);
      continue;
    }

    if (ch === "'") {
      const end = charLiteralEnd(line, i);
      if (end >= 0) {
        i = end;
        continue;
      }
      // Not a character literal, so fall through and treat it as a marker.
    }

    // Block openers are checked first so `/*` wins over `//` at the same index.
    for (const pair of BLOCK_PAIRS) {
      if (line.startsWith(pair.open, i)) {
        return { index: i, marker: pair.open, blockClose: pair.close };
      }
    }
    for (const marker of SINGLE_LINE_MARKERS) {
      if (line.startsWith(marker, i)) {
        return { index: i, marker };
      }
    }
  }

  return null;
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
    const opener = findCommentOpener(line, 0);
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

/**
 * Returns the lines that may carry an anchor, as a Map<lineIndex, scanStart>.
 *
 * For code, that is the comment portion of each commented line. For prose
 * (Markdown), every line qualifies in full — requiring a comment marker there
 * would match `<!-- TODO -->` and `# TODO` headings while missing a plain
 * `TODO: ...` line.
 */
export function scanAnchorLinesMap(lines: string[], prose: boolean): Map<number, number> {
  if (!prose) return scanCommentLinesMap(lines);

  const map = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    map.set(i, 0);
  }
  return map;
}
