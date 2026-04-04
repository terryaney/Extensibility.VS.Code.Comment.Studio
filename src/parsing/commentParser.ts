import { XmlDocCommentBlock, LanguageCommentStyle } from '../types';
import { getLanguageCommentStyle } from './languageConfig';

interface DocumentCache {
  version: number;
  blocks: XmlDocCommentBlock[];
}

const documentCaches = new Map<string, DocumentCache>();

/**
 * Gets cached comment blocks for a document, parsing only if stale.
 */
export function getCachedCommentBlocks(
  documentUri: string,
  documentVersion: number,
  lines: string[],
  languageId: string,
): XmlDocCommentBlock[] | undefined {
  const commentStyle = getLanguageCommentStyle(languageId);
  if (!commentStyle) {
    return undefined;
  }

  const cacheKey = documentUri;
  const cached = documentCaches.get(cacheKey);
  if (cached && cached.version === documentVersion) {
    return cached.blocks;
  }

  const blocks = findAllCommentBlocks(lines, commentStyle);
  documentCaches.set(cacheKey, { version: documentVersion, blocks });
  return blocks;
}

/**
 * Clears the comment block cache for a document.
 */
export function clearDocumentCache(documentUri: string): void {
  documentCaches.delete(documentUri);
}

/**
 * Finds all XML documentation comment blocks in the given lines.
 */
export function findAllCommentBlocks(lines: string[], commentStyle: LanguageCommentStyle): XmlDocCommentBlock[] {
  const blocks: XmlDocCommentBlock[] = [];
  let currentLine = 0;

  // Pre-compute line offsets
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for newline
  }

  while (currentLine < lines.length) {
    const block = tryParseCommentBlockAt(lines, currentLine, lineOffsets, commentStyle);
    if (block) {
      blocks.push(block);
      currentLine = block.endLine + 1;
    } else {
      currentLine++;
    }
  }

  return blocks;
}

function tryParseCommentBlockAt(
  lines: string[],
  startLine: number,
  lineOffsets: number[],
  commentStyle: LanguageCommentStyle,
): XmlDocCommentBlock | undefined {
  if (startLine < 0 || startLine >= lines.length) {
    return undefined;
  }

  const firstLineText = lines[startLine];

  // Try single-line doc comment style (///, ''')
  const singleLineBlock = tryParseSingleLineCommentBlock(lines, startLine, firstLineText, lineOffsets, commentStyle);
  if (singleLineBlock) {
    return singleLineBlock;
  }

  // Try multi-line doc comment style (/** */)
  if (commentStyle.supportsMultiLineDoc) {
    return tryParseMultiLineCommentBlock(lines, startLine, firstLineText, lineOffsets, commentStyle);
  }

  return undefined;
}

function tryParseSingleLineCommentBlock(
  lines: string[],
  startLine: number,
  firstLineText: string,
  lineOffsets: number[],
  commentStyle: LanguageCommentStyle,
): XmlDocCommentBlock | undefined {
  const prefix = commentStyle.singleLineDocPrefix;
  const trimmedFirst = firstLineText.trimStart();

  if (!isValidDocCommentStart(trimmedFirst, prefix)) {
    return undefined;
  }

  const indentation = firstLineText.substring(0, firstLineText.length - trimmedFirst.length);
  const xmlContentParts: string[] = [];
  let endLine = startLine;

  for (let i = startLine; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmedLine = lineText.trimStart();

    if (!isValidDocCommentStart(trimmedLine, prefix)) {
      break;
    }

    let content = trimmedLine.substring(prefix.length);
    // Remove leading single space if present (standard formatting)
    if (content.length > 0 && content[0] === ' ') {
      content = content.substring(1);
    }

    xmlContentParts.push(content.trimEnd());
    endLine = i;
  }

  const startOffset = lineOffsets[startLine];
  const endOffset = lineOffsets[endLine] + lines[endLine].length;

  return {
    startOffset,
    endOffset,
    startLine,
    endLine,
    indentation,
    xmlContent: xmlContentParts.join('\n'),
    isMultiLineStyle: false,
  };
}

function tryParseMultiLineCommentBlock(
  lines: string[],
  startLine: number,
  firstLineText: string,
  lineOffsets: number[],
  commentStyle: LanguageCommentStyle,
): XmlDocCommentBlock | undefined {
  const trimmedFirst = firstLineText.trimStart();
  const multiLineStart = commentStyle.multiLineDocStart!;
  const multiLineEnd = commentStyle.multiLineDocEnd!;

  if (!trimmedFirst.startsWith(multiLineStart)) {
    return undefined;
  }

  const indentation = firstLineText.substring(0, firstLineText.length - trimmedFirst.length);
  const xmlContentParts: string[] = [];
  let endLine = startLine;

  // Handle content on the opening line after /**
  const openingContent = trimmedFirst.substring(multiLineStart.length);

  // Check if single-line: /** content */
  const closeIndex = openingContent.indexOf(multiLineEnd);
  if (closeIndex >= 0) {
    const content = openingContent.substring(0, closeIndex).trim();
    const startOffset = lineOffsets[startLine];
    const endOffset = lineOffsets[startLine] + lines[startLine].length;

    return {
      startOffset,
      endOffset,
      startLine,
      endLine: startLine,
      indentation,
      xmlContent: content,
      isMultiLineStyle: true,
    };
  }

  // Add content from first line if any
  const trimmedOpening = openingContent.trim();
  if (trimmedOpening) {
    xmlContentParts.push(trimmedOpening);
  }

  // Search for closing marker
  for (let i = startLine + 1; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmedLine = lineText.trimStart();
    endLine = i;

    const closeIdx = trimmedLine.indexOf(multiLineEnd);
    if (closeIdx >= 0) {
      let content = trimmedLine.substring(0, closeIdx);
      content = stripContinuationPrefix(content);
      const trimmedContent = content.trim();
      if (trimmedContent) {
        xmlContentParts.push(trimmedContent);
      }
      break;
    }

    // Middle line
    const middleContent = stripContinuationPrefix(trimmedLine).trimEnd();
    xmlContentParts.push(middleContent);
  }

  const startOffset = lineOffsets[startLine];
  const endOffset = lineOffsets[endLine] + lines[endLine].length;

  return {
    startOffset,
    endOffset,
    startLine,
    endLine,
    indentation,
    xmlContent: xmlContentParts.join('\n'),
    isMultiLineStyle: true,
  };
}

function stripContinuationPrefix(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('*')) {
    let result = trimmed.substring(1);
    if (result.length > 0 && result[0] === ' ') {
      result = result.substring(1);
    }
    return result;
  }
  return line;
}

/**
 * Checks if a trimmed line is a valid doc comment start.
 * Excludes commented-out doc comments (e.g., //// has 4 slashes).
 */
export function isValidDocCommentStart(trimmedLine: string, prefix: string): boolean {
  if (!trimmedLine.startsWith(prefix)) {
    return false;
  }

  // Check for extra comment character after prefix (makes it a regular comment)
  if (trimmedLine.length > prefix.length) {
    const charAfterPrefix = trimmedLine[prefix.length];
    const commentChar = prefix[0];
    if (charAfterPrefix === commentChar) {
      return false;
    }
  }

  return true;
}
