export interface LinkAnchorTarget {
  /** The original LINK: text */
  rawText: string;
  /** Resolved target path (may be relative or absolute) */
  targetPath: string;
  /** Target line number (1-based, undefined if not specified) */
  lineNumber?: number;
  /** End line for ranges (1-based) */
  endLineNumber?: number;
  /** Anchor name within the target file */
  anchorName?: string;
  /** Whether this is a local anchor (same file) */
  isLocalAnchor: boolean;
  /** Start index of the path portion in the original text */
  pathStart: number;
  /** Length of the path portion */
  pathLength: number;
}

// Match LINK: followed by the target
const LINK_PREFIX_REGEX = /\bLINK:\s*/g;

/**
 * Parses LINK: syntax from a line of text.
 *
 * Supported forms:
 * - LINK: file.cs
 * - LINK: ./relative/file.cs
 * - LINK: ../parent/file.cs
 * - LINK: path with spaces/file.cs
 * - LINK: file.cs:42           (line number)
 * - LINK: file.cs:10-20        (line range)
 * - LINK: file.cs#AnchorName   (file anchor)
 * - LINK: #local-anchor        (local anchor in same file)
 */
export function parseLinkAnchors(text: string): LinkAnchorTarget[] {
  const results: LinkAnchorTarget[] = [];
  LINK_PREFIX_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LINK_PREFIX_REGEX.exec(text)) !== null) {
    const afterPrefix = text.substring(match.index + match[0].length);
    const target = parseLinkTarget(afterPrefix, match.index, match[0].length);
    if (target) {
      results.push(target);
    }
  }

  return results;
}

function parseLinkTarget(text: string, linkStart: number, prefixLength: number): LinkAnchorTarget | undefined {
  if (!text.trim()) return undefined;

  // Local anchor: #anchor-name
  if (text.startsWith('#')) {
    const anchorMatch = text.match(/^#([\w-]+)/);
    if (anchorMatch) {
      return {
        rawText: `LINK: ${anchorMatch[0]}`,
        targetPath: '',
        anchorName: anchorMatch[1],
        isLocalAnchor: true,
        pathStart: linkStart + prefixLength,
        pathLength: anchorMatch[0].length,
      };
    }
    return undefined;
  }

  // File path (possibly with spaces, line numbers, anchors)
  // Find the boundary: next LINK:, newline, or comment end
  let boundary = text.length;

  // Find next LINK: keyword to limit capture
  const nextLink = text.search(/\bLINK:\s*/);
  if (nextLink > 0) {
    boundary = nextLink;
  }

  let pathPart = '';
  let i = 0;

  // Consume path characters up to boundary
  while (i < boundary) {
    const ch = text[i];
    // Stop at newline
    if (ch === '\n' || ch === '\r') break;
    // Stop at common comment endings
    if (ch === '*' && i + 1 < text.length && text[i + 1] === '/') break;
    pathPart += ch;
    i++;
  }

  pathPart = pathPart.trimEnd();

  // When bounded by another LINK:, trim trailing words that don't look like path components
  // (path components contain dots, slashes, backslashes, or colons)
  if (nextLink > 0) {
    while (pathPart.includes(' ')) {
      const lastSpace = pathPart.lastIndexOf(' ');
      const lastWord = pathPart.substring(lastSpace + 1);
      if (/[./\\:#]/.test(lastWord)) break;
      pathPart = pathPart.substring(0, lastSpace).trimEnd();
    }
  }

  if (!pathPart) return undefined;

  // Parse suffixes: :lineNum, :lineNum-lineNum, #anchor
  let targetPath = pathPart;
  let lineNumber: number | undefined;
  let endLineNumber: number | undefined;
  let anchorName: string | undefined;

  // Check for #anchor suffix
  const anchorIdx = pathPart.lastIndexOf('#');
  if (anchorIdx > 0) {
    const anchor = pathPart.substring(anchorIdx + 1);
    if (/^[\w-]+$/.test(anchor)) {
      anchorName = anchor;
      targetPath = pathPart.substring(0, anchorIdx);
    }
  }

  // Check for :lineNum or :lineNum-lineNum suffix
  const lineMatch = targetPath.match(/^(.+):(\d+)(?:-(\d+))?$/);
  if (lineMatch) {
    targetPath = lineMatch[1];
    lineNumber = parseInt(lineMatch[2], 10);
    if (lineMatch[3]) {
      endLineNumber = parseInt(lineMatch[3], 10);
    }
  }

  return {
    rawText: `LINK: ${pathPart}`,
    targetPath: targetPath.trim(),
    lineNumber,
    endLineNumber,
    anchorName,
    isLocalAnchor: false,
    pathStart: linkStart + prefixLength,
    pathLength: pathPart.length,
  };
}

/**
 * Resolves a link target path relative to a base file path.
 */
export function resolveLinkTarget(target: LinkAnchorTarget, baseFilePath: string): string {
  if (target.isLocalAnchor) return baseFilePath;

  const pathModule = require('path');

  if (target.targetPath.startsWith('./') || target.targetPath.startsWith('../')) {
    // Relative path
    return pathModule.resolve(pathModule.dirname(baseFilePath), target.targetPath);
  }

  // Try workspace-relative
  const vscode = require('vscode');
  const workspaceFolders = vscode.workspace?.workspaceFolders;
  if (workspaceFolders) {
    for (const folder of workspaceFolders) {
      const resolved = pathModule.join(folder.uri.fsPath, target.targetPath);
      try {
        const fsModule = require('fs');
        if (fsModule.existsSync(resolved)) return resolved;
      } catch {
        // Continue
      }
    }
  }

  // Fall back to relative to current file
  return pathModule.resolve(pathModule.dirname(baseFilePath), target.targetPath);
}
