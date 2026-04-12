import { XmlDocCommentBlock, LanguageCommentStyle } from '../types';
import { getLanguageCommentStyle } from './languageConfig';

// Languages that use JSDoc/TSDoc-style comments (/** */)
const JSDOC_LANG_IDS = new Set(['javascript', 'typescript', 'typescriptreact', 'javascriptreact']);

// C# modifier keywords that precede the member's return type / name
const CSHARP_MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'virtual', 'override',
  'abstract', 'sealed', 'readonly', 'extern', 'partial', 'async', 'unsafe', 'new',
  'required', 'file',
]);

// Type-keyword names we should not return as the member name
const SKIP_MEMBER_NAMES = new Set([
  'void', 'string', 'int', 'long', 'short', 'byte', 'bool', 'float', 'double',
  'decimal', 'char', 'object', 'dynamic', 'var', 'uint', 'ulong', 'ushort', 'sbyte',
  'nint', 'nuint', 'get', 'set', 'init', 'return', 'new', 'this', 'base',
  'any', 'never', 'undefined', 'null', 'number', 'boolean', 'symbol', 'bigint',
  'as', 'is', 'in', 'out', 'ref', 'params',
]);

/**
 * Returns true if the trimmed line is an attribute / decorator that should be
 * skipped when scanning for the declaration following a comment block.
 */
function isAttributeLine(trimmed: string, languageId?: string): boolean {
  if (!trimmed) return false;
  // TypeScript/JavaScript decorators: @Component, @Injectable, etc.
  if (languageId && JSDOC_LANG_IDS.has(languageId)) {
    return trimmed.startsWith('@');
  }
  // F# attributes: [<Attribute>]
  if (languageId === 'fsharp') return trimmed.startsWith('[<');
  // VB attributes: <Obsolete()>
  if (languageId === 'vb') return trimmed.startsWith('<') && trimmed.endsWith('>');
  // C# / Razor / C / C++ attributes: [Attribute] — also handles partial multi-line open
  return trimmed.startsWith('[');
}

/**
 * Extracts the last significant word before a delimiter in a string, stripping
 * trailing generic type parameters: "Task<T> MethodName" → "MethodName",
 * "Foo<T>" → "Foo".
 */
function lastWordBefore(text: string, delimChar: string): string | undefined {
  const idx = text.indexOf(delimChar);
  if (idx <= 0) return undefined;
  const before = text.substring(0, idx);
  // Strip a trailing generic: Foo<T> → Foo, List<string> → List<string> MethodName
  const cleaned = before.replace(/(\w+)\s*<[^<>()]*>\s*$/, '$1').trim();
  const m = /(\w+)\s*$/.exec(cleaned);
  return m?.[1];
}

/**
 * Strips C# modifier keywords from the start of a declaration line and returns
 * the remainder. E.g. "public static async Task<T> Foo(" → "Task<T> Foo(").
 */
function stripCSharpModifiers(line: string): string {
  let rest = line;
  for (;;) {
    const m = /^(\w+)\s+(.*)$/.exec(rest.trimStart());
    if (!m || !CSHARP_MODIFIERS.has(m[1])) break;
    rest = m[2];
  }
  return rest.trimStart();
}

/**
 * Extracts the member name from a single declaration line, dispatching by
 * languageId when provided.
 */
export function extractMemberName(line: string, languageId?: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  // Universal keyword-based patterns that work across most languages
  let m: RegExpMatchArray | null;

  // function keyword (JS/TS/C/C++)
  m = /\bfunction\s*\*?\s*(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // Type declaration keywords
  m = /\b(?:class|interface|enum|struct|record|delegate|trait|module|namespace)\s+(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  if (languageId && JSDOC_LANG_IDS.has(languageId)) {
    return extractJsName(trimmed);
  }

  if (languageId === 'vb') {
    return extractVbName(trimmed);
  }

  if (languageId === 'fsharp') {
    return extractFSharpName(trimmed);
  }

  // C# / Razor / C / C++ (and default)
  return extractCSharpName(trimmed);
}

function validateName(name: string): string | undefined {
  return name && !SKIP_MEMBER_NAMES.has(name) ? name : undefined;
}

/** Extracts member name from a JS/TS declaration line. */
function extractJsName(trimmed: string): string | undefined {
  let m: RegExpMatchArray | null;

  // type alias: type Foo = ...
  m = /\btype\s+(\w+)\s*[=<]/.exec(trimmed);
  if (m) return validateName(m[1]);

  // export enum / enum
  m = /\benum\s+(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // const/let/var declaration
  m = /\b(?:const|let|var)\s+(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // Arrow function / object method assigned to const/let
  // e.g. "const foo = (" already handled above via const/let/var

  // Class method, getter, setter, async method: optional modifiers then name(
  // e.g. "  async fetchData(" or "  get value(" or "  #privateMethod("
  m = /(?:^|[\s;{])(?:(?:public|private|protected|static|async|abstract|override|readonly|get|set)\s+)*([#]?\w+)\s*(?:<[^>]*>)?\s*\(/.exec(trimmed);
  if (m) return validateName(m[1]);

  return undefined;
}

/** Extracts member name from a VB declaration line. */
function extractVbName(trimmed: string): string | undefined {
  const m = /\b(?:Sub|Function|Property|Event|Class|Interface|Enum|Structure|Module|Delegate)\s+(\w+)/i.exec(trimmed);
  return m ? validateName(m[1]) : undefined;
}

/** Extracts member name from an F# declaration line. */
function extractFSharpName(trimmed: string): string | undefined {
  let m: RegExpMatchArray | null;

  // member self.Name or member _.Name or static member Name
  m = /\bmember\s+(?:\w+\.)?(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // type Name
  m = /\btype\s+(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // let/let rec name
  m = /\blet\s+(?:rec\s+)?(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  // val name
  m = /\bval\s+(?:mutable\s+)?(\w+)/.exec(trimmed);
  if (m) return validateName(m[1]);

  return undefined;
}

/** Extracts member name from a C# / Razor / C / C++ declaration line. */
function extractCSharpName(trimmed: string): string | undefined {
  const rest = stripCSharpModifiers(trimmed);
  if (!rest) return undefined;

  // Expression-bodied member: find => before any ( — the name is the last word before =>
  const exprIdx = rest.indexOf('=>');
  const parenIdx = rest.indexOf('(');
  if (exprIdx > 0 && (parenIdx < 0 || exprIdx < parenIdx)) {
    const name = lastWordBefore(rest, '=>');
    return name ? validateName(name) : undefined;
  }

  // Method / constructor / indexer: last word before (
  if (parenIdx > 0) {
    const name = lastWordBefore(rest, '(');
    return name ? validateName(name) : undefined;
  }

  // Property / event with brace body: last word before {
  const braceIdx = rest.indexOf('{');
  if (braceIdx > 0) {
    const name = lastWordBefore(rest, '{');
    return name ? validateName(name) : undefined;
  }

  // Field / enum member / property (auto-prop): last word before = ; ,
  const m = /(\w+)\s*(?:[=;,]|$)/.exec(rest.replace(/<[^<>]*>/g, ''));
  if (m) return validateName(m[1]);

  return undefined;
}

/**
 * Scans lines following a comment block end to find and extract the declared
 * member name. Skips blank lines and attribute/decorator lines. Handles
 * multi-line C# attributes by tracking unclosed `[` brackets.
 */
export function extractMemberNameFromLines(
  lines: string[],
  blockEndLine: number,
  languageId?: string,
): string | undefined {
  const limit = Math.min(blockEndLine + 21, lines.length);
  let bracketDepth = 0; // for tracking multi-line C# attributes [Route(\n"foo")]

  for (let i = blockEndLine + 1; i < limit; i++) {
    const trimmed = lines[i].trim();

    // Skip blank lines
    if (!trimmed) continue;

    // Handle continuation of a multi-line C# attribute
    if (bracketDepth > 0) {
      for (const ch of trimmed) {
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
      }
      continue;
    }

    // Detect attribute/decorator lines
    if (isAttributeLine(trimmed, languageId)) {
      // Count brackets to detect multi-line attribute opening
      for (const ch of trimmed) {
        if (ch === '[') bracketDepth++;
        else if (ch === ']') bracketDepth--;
      }
      // bracketDepth > 0 means this attribute continues onto the next line
      continue;
    }

    // First real declaration line — extract name and return
    return extractMemberName(trimmed, languageId);
  }

  return undefined;
}

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
      block.memberName = extractMemberNameFromLines(lines, block.endLine, block.languageId);
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
  if (!prefix) return undefined;

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
      // If blank, look ahead: if more /// lines follow before any real code,
      // bridge the gap so an accidental blank line doesn't split the block.
      if (trimmedLine.length === 0 && hasMoreCommentLinesAhead(lines, i + 1, prefix)) {
        xmlContentParts.push('');
        continue;
      }
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
    languageId: commentStyle.languageId,
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
      languageId: commentStyle.languageId,
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
    languageId: commentStyle.languageId,
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
 * Returns true if any line from `fromLine` onward is a valid doc comment line
 * before encountering any non-blank, non-comment line. Used to bridge accidental
 * blank lines inside a comment block.
 */
function hasMoreCommentLinesAhead(lines: string[], fromLine: number, prefix: string): boolean {
  for (let i = fromLine; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (isValidDocCommentStart(trimmed, prefix)) {
      return true;
    }
    if (trimmed.length > 0) {
      return false;
    }
    // blank line — keep looking
  }
  return false;
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
