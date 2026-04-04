export interface AnchorType {
  tag: string;
  displayName: string;
  icon: string; // codicon name
  color: string; // hex color for editor decorations
  themeColorId: string; // registered theme color ID for tree view icons
}

export interface AnchorMatch {
  /** The anchor tag (e.g., "TODO", "HACK") */
  tag: string;
  /** The full matched text */
  fullText: string;
  /** Optional owner (@owner) */
  owner?: string;
  /** Optional issue reference (#123) */
  issueRef?: string;
  /** Optional anchor name for ANCHOR(name) */
  anchorName?: string;
  /** Optional due date (ISO format yyyy-MM-dd) */
  dueDate?: string;
  /** The description text after the tag and metadata */
  description: string;
  /** File path */
  filePath: string;
  /** Line number (0-based) */
  lineNumber: number;
  /** Column offset (0-based) */
  column: number;
}

// Built-in anchor types
export const BUILTIN_ANCHOR_TYPES: ReadonlyMap<string, AnchorType> = new Map([
  ['TODO', { tag: 'TODO', displayName: 'Todo', icon: 'checklist', color: '#FF8C00', themeColorId: 'katCommentStudio.anchorTodo' }],
  ['HACK', { tag: 'HACK', displayName: 'Hack', icon: 'alert', color: '#DC143C', themeColorId: 'katCommentStudio.anchorHack' }],
  ['NOTE', { tag: 'NOTE', displayName: 'Note', icon: 'note', color: '#4169E1', themeColorId: 'katCommentStudio.anchorNote' }],
  ['BUG', { tag: 'BUG', displayName: 'Bug', icon: 'bug', color: '#FF0000', themeColorId: 'katCommentStudio.anchorBug' }],
  ['FIXME', { tag: 'FIXME', displayName: 'Fix Me', icon: 'wrench', color: '#FF4500', themeColorId: 'katCommentStudio.anchorFixme' }],
  ['UNDONE', { tag: 'UNDONE', displayName: 'Undone', icon: 'circle-slash', color: '#808080', themeColorId: 'katCommentStudio.anchorUndone' }],
  ['REVIEW', { tag: 'REVIEW', displayName: 'Review', icon: 'eye', color: '#9370DB', themeColorId: 'katCommentStudio.anchorReview' }],
  ['ANCHOR', { tag: 'ANCHOR', displayName: 'Anchor', icon: 'pin', color: '#20B2AA', themeColorId: 'katCommentStudio.anchorAnchor' }],
]);

/**
 * Builds the anchor detection regex from the given tags and optional prefixes.
 */
export function buildAnchorRegex(tags: string[], tagPrefixes?: string[]): RegExp {
  const escapedTags = tags.map(t => escapeRegex(t));
  const tagPattern = escapedTags.join('|');

  let prefixPattern = '';
  if (tagPrefixes && tagPrefixes.length > 0) {
    const escapedPrefixes = tagPrefixes.map(p => escapeRegex(p));
    prefixPattern = `(?:${escapedPrefixes.join('|')})?`;
  }

  // Require colon after tag (case-sensitive, no 'i' flag)
  return new RegExp(
    `\\b${prefixPattern}(${tagPattern})` +
    `(?:\\(([^)]+)\\))?` +       // optional (name) or (@owner) for ANCHOR
    `(?:\\s*\\[#(\\d+)\\])?` +   // optional [#123]
    `(?:\\s*\\(@([^)]+)\\))?` +  // optional (@owner) if not captured above
    `:\\s*(.*)$`,                // colon + description
  );
}

/**
 * Finds all anchor matches in a single line of text.
 */
export function findAnchorsInLine(
  line: string,
  lineNumber: number,
  filePath: string,
  regex: RegExp,
): AnchorMatch | undefined {
  const match = regex.exec(line);
  if (!match) return undefined;

  const tag = match[1].toUpperCase();
  const group2 = match[2]?.trim();
  const issueRef = match[3];
  const group4 = match[4]?.trim();
  const description = match[5]?.trim() || '';

  let owner: string | undefined;
  let anchorName: string | undefined;
  let dueDate: string | undefined;

  // For ANCHOR tag, group2 is the anchor name
  // For other tags, group2 starting with @ is an owner
  if (tag === 'ANCHOR' && group2 && !group2.startsWith('@')) {
    anchorName = group2;
  } else if (group2) {
    // group2 may contain comma-separated metadata: @owner, #1234, 2026-02-01
    const tokens = group2.split(',').map(t => t.trim());
    for (const token of tokens) {
      if (token.startsWith('@')) {
        owner = token.substring(1);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
        dueDate = token;
      }
      // #issue handled by regex group3 already
    }
  }

  // group4 is always an owner (@owner)
  if (group4) {
    owner = group4;
  }

  return {
    tag,
    fullText: match[0],
    owner,
    issueRef: issueRef ? `#${issueRef}` : undefined,
    anchorName,
    dueDate,
    description,
    filePath,
    lineNumber,
    column: match.index,
  };
}

/**
 * Finds all anchors in a file's content.
 */
export function findAnchorsInText(
  text: string,
  filePath: string,
  tags?: string[],
  tagPrefixes?: string[],
): AnchorMatch[] {
  const allTags = tags || [...BUILTIN_ANCHOR_TYPES.keys()];
  const regex = buildAnchorRegex(allTags, tagPrefixes);
  const lines = text.split(/\r?\n/);
  const matches: AnchorMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Reset regex state for each line
    regex.lastIndex = 0;
    const match = findAnchorsInLine(lines[i], i, filePath, new RegExp(regex.source, regex.flags));
    if (match) {
      matches.push(match);
    }
  }

  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
