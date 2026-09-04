import { scanAnchorLinesMap, isProseFilePath } from './commentScanner';

export interface AnchorType {
  tag: string;
  displayName: string;
  icon: string; // codicon name
  color: string; // hex color for editor decorations
  themeColorId: string; // registered theme color ID for tree view icons
}

export interface AnchorScopeEntity {
  id: string;
  label: string;
  path: string;
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
  /** Workspace folder containing this anchor, when applicable */
  workspaceFolder?: AnchorScopeEntity;
  /** Git repository containing this anchor, when applicable */
  repository?: AnchorScopeEntity;
  /** Nearest .csproj containing this anchor, when applicable */
  project?: AnchorScopeEntity;
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
  ['ANCHOR', { tag: 'ANCHOR', displayName: 'Anchor', icon: 'link', color: '#20B2AA', themeColorId: 'katCommentStudio.anchorAnchor' }],
]);

/** Characters accepted as a tag delimiter, e.g. `TODO:` or `TODO!`. */
const DELIMITERS = ':!';

/** Optional metadata container — `(...)` and `[...]` are interchangeable. */
function metadata(groupName: string): string {
  return `[\\(\\[](?<${groupName}>[^\\)\\]]*)[\\)\\]]`;
}

/**
 * Expands a literal into a case-insensitive pattern using character classes,
 * e.g. `TODO` → `[Tt][Oo][Dd][Oo]`. Needed because only the tag portion of the
 * anchor pattern is case-insensitive — the `i` flag would apply to everything.
 */
function anyCaseLiteral(text: string): string {
  return text
    .split('')
    .map(ch => {
      const upper = ch.toUpperCase();
      const lower = ch.toLowerCase();
      return upper === lower ? escapeRegex(ch) : `[${escapeRegex(upper)}${escapeRegex(lower)}]`;
    })
    .join('');
}

/**
 * Builds the shared anchor pattern matching a tag and its optional metadata,
 * stopping before the description. Both inline colorization and the workspace
 * scanner use this so the two can never disagree about what an anchor is.
 *
 * A tag qualifies when either:
 *  - it is written in exact uppercase (`TODO`), where a delimiter is optional; or
 *  - it carries a delimiter (`todo:`, `Todo!`) or a metadata container attached
 *    with no intervening space (`todo(@terry)`).
 *
 * The second rule is what keeps prose such as `a half-written note - ...` from
 * being treated as an anchor.
 *
 * Named groups: `prefix`, `exact`/`loose` (tag), `metaExact`/`metaLoose`.
 */
export function buildAnchorPattern(tags: string[], tagPrefixes?: string[]): string {
  const exactTags = tags.map(t => escapeRegex(t.toUpperCase())).join('|');
  const looseTags = tags.map(t => anyCaseLiteral(t)).join('|');

  // Reject a word character before the tag (or before its prefix), so `mid-review`
  // is eligible but `NOTES` and `x@TODO` are not.
  const prefixChars = (tagPrefixes ?? []).map(p => escapeRegex(p)).join('');
  const boundary = prefixChars ? `(?<![\\w${prefixChars}])` : '(?<!\\w)';
  const prefix = prefixChars ? `(?<prefix>[${prefixChars}])?` : '';

  const delimiter = `[${DELIMITERS}]`;

  // Uppercase: metadata may be spaced, delimiter optional.
  const exactBranch = `(?<exact>${exactTags})\\b(?:\\s?${metadata('metaExact')})?\\s*${delimiter}?`;
  // Any case: requires an attached metadata container or a delimiter.
  const looseBranch = `(?<loose>${looseTags})\\b(?:${metadata('metaLoose')}\\s*${delimiter}?|${delimiter})`;

  return `${boundary}${prefix}(?:${exactBranch}|${looseBranch})`;
}

/**
 * Builds the anchor detection regex used by the scanner: the shared pattern
 * plus the trailing description capture.
 *
 * Metadata delimiters `()` and `[]` are interchangeable. Tokens inside are
 * comma-separated and parsed by type: `@owner`, `#issue`, `yyyy-MM-dd` date,
 * or plain name (ANCHOR only).
 */
export function buildAnchorRegex(tags: string[], tagPrefixes?: string[]): RegExp {
  return new RegExp(`${buildAnchorPattern(tags, tagPrefixes)}\\s*(?<description>.*)$`);
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

  const groups = match.groups ?? {};
  const tag = (groups.exact ?? groups.loose ?? '').toUpperCase();
  const metadataGroup = (groups.metaExact ?? groups.metaLoose)?.trim();
  const description = groups.description?.trim() || '';

  let owner: string | undefined;
  let anchorName: string | undefined;
  let dueDate: string | undefined;
  let issueRef: string | undefined;

  if (metadataGroup) {
    const tokens = metadataGroup.split(',').map(t => t.trim());
    for (const token of tokens) {
      if (token.startsWith('@')) {
        owner = token.substring(1);
      } else if (/^#\d+$/.test(token)) {
        issueRef = token;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
        dueDate = token;
      } else if (tag === 'ANCHOR' && !anchorName) {
        // Plain text token is an anchor name only for ANCHOR tag
        anchorName = token;
      }
    }
  }

  // ANCHOR requires a name — skip if no anchorName parsed
  if (tag === 'ANCHOR' && !anchorName) {
    return undefined;
  }

  return {
    tag,
    fullText: match[0],
    owner,
    issueRef,
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
 *
 * In code files only lines within a comment are searched. In prose files
 * (Markdown) every line is searched — see `scanAnchorLinesMap`.
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
  const commentMap = scanAnchorLinesMap(lines, isProseFilePath(filePath));
  const matches: AnchorMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    const commentStart = commentMap.get(i);
    if (commentStart === undefined) continue;

    const commentPortion = lines[i].substring(commentStart);
    regex.lastIndex = 0;
    const match = findAnchorsInLine(commentPortion, i, filePath, new RegExp(regex.source, regex.flags));
    if (match) {
      // Adjust column to be absolute (relative to start of full line).
      match.column += commentStart;
      matches.push(match);
    }
  }

  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
