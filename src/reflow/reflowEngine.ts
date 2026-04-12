import { LanguageCommentStyle, XmlDocCommentBlock } from '../types';

export interface ReflowOptions {
  maxLineWidth: number;
  commentStyle: LanguageCommentStyle;
  indentation: string;
}

const XML_OPEN_TAG_REGEX = /^\s*<(\w+)([^>]*)>\s*$/;
const XML_CLOSE_TAG_REGEX = /^\s*<\/(\w+)>\s*$/;
const XML_SELF_CLOSE_TAG_REGEX = /^\s*<(\w+)([^>]*)\s*\/>\s*$/;
const BLOCK_TAGS = new Set(['summary', 'remarks', 'returns', 'param', 'typeparam', 'value', 'example', 'exception', 'code', 'para', 'list', 'item', 'term', 'description', 'seealso', 'inheritdoc']);

// JSDoc/TSDoc languages use non-XML content — reflow would corrupt @param/@returns etc.
const JSDOC_REFLOW_SKIP = new Set(['javascript', 'typescript', 'typescriptreact', 'javascriptreact']);

/** Returns the first non-empty trimmed line at or after `start`, or undefined. */
function findNextNonEmpty(lines: string[], start: number): string | undefined {
  for (let j = start; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * Returns true if a blank separator should be inserted before a <para> element.
 * Suppressed when the previous result entry is an opening block tag (e.g. <summary>)
 * or ends with a closing block tag (e.g. </para>), so we never add blanks after
 * container openings or between consecutive <para> blocks.
 */
function shouldInsertParaSeparator(result: string[]): boolean {
  if (result.length === 0 || result[result.length - 1] === '') return false;
  const prev = result[result.length - 1];
  if (prev.match(XML_OPEN_TAG_REGEX)) return false;
  const m = prev.match(/<\/(\w+)>\s*$/);
  return !(m !== null && BLOCK_TAGS.has(m[1].toLowerCase()));
}

/**
 * Splits lines where a closing block tag is followed by more content on the same line,
 * e.g., "content</para> <para>more" → ["content</para>", "<para>more"].
 * This normalises inline multi-element lines before the main reflow loop runs.
 * Lines that require no splitting are returned unchanged (preserving leading whitespace
 * for code blocks and other indented content).
 */
function normalizeLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      result.push(raw);  // preserve blank lines as-is
      continue;
    }
    const parts: string[] = [];
    let rest = trimmed;
    for (;;) {
      // Split open-open: <blockTag[attrs]><blockTag... → <blockTag[attrs]> | <blockTag...
      // e.g. <summary><para>content → <summary> and <para>content
      const oo = rest.match(/^(<(\w+)[^>]*>)(<(\w+))/);
      if (oo && BLOCK_TAGS.has(oo[2].toLowerCase()) && BLOCK_TAGS.has(oo[4].toLowerCase())) {
        parts.push(oo[1]);
        rest = rest.slice(oo[1].length).trimStart();
        continue;
      }
      // Split close-open: ...content</blockTag>nextContent → ...content</blockTag> | nextContent
      const m = rest.match(/^(.*?<\/(\w+)>)\s*(?=\S)/);
      if (!m || !BLOCK_TAGS.has(m[2].toLowerCase())) break;
      parts.push(m[1]);
      rest = rest.slice(m[0].length);
    }
    if (parts.length > 0) {
      // Splitting occurred; push trimmed segments (these are structural XML, not code)
      if (rest.trim()) parts.push(rest.trim());
      result.push(...parts);
    } else {
      result.push(raw);  // no split — preserve original (keeps indentation in <code> blocks)
    }
  }
  return result;
}

/**
 * Reflows (wraps) XML documentation comment text to fit within a maximum line width.
 * Preserves XML structure, code blocks, and list formatting.
 */
export function reflowCommentBlock(block: XmlDocCommentBlock, options: ReflowOptions): string[] {
  const lines = block.xmlContent.split('\n');
  const reflowedXml = reflowXmlContent(lines, options.maxLineWidth, options.indentation, options.commentStyle);
  return formatAsCommentLines(reflowedXml, options.indentation, options.commentStyle, block.isMultiLineStyle);
}

/**
 * Reflows raw XML content lines to fit within maxWidth.
 */
export function reflowXmlContent(
  lines: string[],
  maxWidth: number,
  indentation: string,
  commentStyle: LanguageCommentStyle,
): string[] {
  // Normalise: split lines where a closing block tag is followed by more content
  // (e.g. "text</para> <para>more") so the main loop always sees one element per line.
  // JSDoc languages use non-XML content — skip reflow to avoid corrupting @param/@returns lines
  if (JSDOC_REFLOW_SKIP.has(commentStyle.languageId)) {
    return lines;
  }

  lines = normalizeLines(lines);

  const result: string[] = [];
  let i = 0;

  // Calculate effective content width (subtract prefix overhead)
  const singlePrefixLen = commentStyle.singleLineDocPrefix?.length ?? 3;
  const prefixOverhead = indentation.length + singlePrefixLen + 1; // +1 for space after prefix
  const effectiveWidth = Math.max(20, maxWidth - prefixOverhead);

  while (i < lines.length) {
    const line = lines[i].trim();

    // Empty line - preserve as paragraph break, but skip blanks that fall
    // between a closing block tag and an opening block tag (e.g. between
    // consecutive <para> elements) since <para> itself provides separation.
    if (!line) {
      const prevEntry = result.length > 0 ? result[result.length - 1] : '';
      const nextLine = findNextNonEmpty(lines, i + 1);
      const prevEndsWithBlockClose = (() => {
        if (!prevEntry) return false;
        const m = prevEntry.match(/<\/(\w+)>\s*$/);
        return m !== null && BLOCK_TAGS.has(m[1].toLowerCase());
      })();
      const prevIsBlockOpen = (() => {
        if (!prevEntry) return false;
        const m = prevEntry.match(XML_OPEN_TAG_REGEX);
        return m !== null && BLOCK_TAGS.has(m[1].toLowerCase());
      })();
      const nextStartsWithBlockTag = (() => {
        if (!nextLine) return false;
        const m = nextLine.match(/^<(\w+)/);
        return m !== null && BLOCK_TAGS.has(m[1].toLowerCase());
      })();
      if ((prevEndsWithBlockClose || prevIsBlockOpen) && nextStartsWithBlockTag) {
        i++;
        continue;
      }
      result.push('');
      i++;
      continue;
    }

    // Self-closing XML tag - keep on its own line
    const selfCloseMatch = line.match(XML_SELF_CLOSE_TAG_REGEX);
    if (selfCloseMatch) {
      result.push(line);
      i++;
      continue;
    }

    // Opening XML block tag
    const openMatch = line.match(XML_OPEN_TAG_REGEX);
    if (openMatch && BLOCK_TAGS.has(openMatch[1].toLowerCase())) {
      const tagName = openMatch[1].toLowerCase();

      // Special handling for <code> blocks - preserve as-is
      if (tagName === 'code') {
        result.push(line);
        i++;
        while (i < lines.length) {
          const codeLine = lines[i];
          result.push(codeLine);
          i++;
          if (codeLine.trim().match(XML_CLOSE_TAG_REGEX)?.[1]?.toLowerCase() === 'code') {
            break;
          }
        }
        continue;
      }

      // Other block tags - put tag on its own line, reflow content.
      // <para> starts on its own line with a blank separator, but only when
      // the preceding entry is plain text — not after an opening block tag
      // (e.g. <summary>) or a closing block tag (e.g. </para>).
      if (tagName === 'para' && shouldInsertParaSeparator(result)) {
        result.push('');
      }
      result.push(line);
      i++;

      // Collect content until closing tag
      const contentLines: string[] = [];
      while (i < lines.length) {
        const contentLine = lines[i].trim();
        const closeMatch = contentLine.match(XML_CLOSE_TAG_REGEX);
        if (closeMatch && closeMatch[1].toLowerCase() === tagName) {
          break;
        }

        // Check for nested block tags — both standalone (<para>) and inline (<para>content)
        const nestedBlockOpen = contentLine.match(/^<(\w+)[^>]*>/);
        if (nestedBlockOpen && BLOCK_TAGS.has(nestedBlockOpen[1].toLowerCase())) {
          // Flush accumulated content first
          if (contentLines.length > 0) {
            result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
            contentLines.length = 0;
          }
          // Handle nested tag (push back and let outer loop handle)
          break;
        }

        if (contentLine === '') {
          // Paragraph break within block — suppress if the next non-empty line is a
          // block tag opener (open-open or close-open pattern); <para> provides its own separation.
          if (contentLines.length > 0) {
            result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
            contentLines.length = 0;
          }
          const nextNonEmpty = findNextNonEmpty(lines, i + 1);
          const nextM = nextNonEmpty?.match(/^<(\w+)/);
          if (!nextM || !BLOCK_TAGS.has(nextM[1].toLowerCase())) {
            result.push('');
          }
        } else {
          contentLines.push(contentLine);
        }
        i++;
      }

      // Flush remaining content
      if (contentLines.length > 0) {
        result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
      }

      // Add closing tag if present
      if (i < lines.length) {
        const closingLine = lines[i].trim();
        const closeMatch = closingLine.match(XML_CLOSE_TAG_REGEX);
        if (closeMatch && closeMatch[1].toLowerCase() === tagName) {
          result.push(closingLine);
          i++;
        }
      }

      continue;
    }

    // Opening tag with content on same line (e.g., "<param name="x">Some text")
    const inlineOpenMatch = line.match(/^<(\w+)([^>]*)>\s*(.+)$/);
    if (inlineOpenMatch && BLOCK_TAGS.has(inlineOpenMatch[1].toLowerCase())) {
      const tagName = inlineOpenMatch[1].toLowerCase();
      const tagAttrs = inlineOpenMatch[2];
      const afterContent = inlineOpenMatch[3].trim();
      // Only <summary> is forced to multi-line form (standalone opening/closing tags)
      // so the transparent-text opacity effect renders cleanly when collapsed.
      const alwaysMultiLine = tagName === 'summary';

      // Check if closing tag is on same line
      const inlineCloseMatch = afterContent.match(new RegExp(`^(.*)<\\/${tagName}>\\s*$`));
      if (inlineCloseMatch) {
        if (tagName === 'para' && shouldInsertParaSeparator(result)) {
          result.push('');
        }
        const content = inlineCloseMatch[1].trim();
        const wrapped = wrapParagraph(content, effectiveWidth);
        if (wrapped.length <= 1 && !alwaysMultiLine) {
          // Short enough to stay on one line (or empty)
          result.push(`<${tagName}${tagAttrs}>${wrapped[0] ?? ''}</${tagName}>`);
        } else if (alwaysMultiLine) {
          // Force standalone opening/closing (summary)
          result.push(`<${tagName}${tagAttrs}>`);
          result.push(...wrapped);
          result.push(`</${tagName}>`);
        } else {
          // Inline form: opening tag on the first content line, closing on the last.
          // Rule: if content followed the opening tag in the source, the closing tag
          // should follow the last line of content (not sit on its own line).
          result.push(`<${tagName}${tagAttrs}>${wrapped[0]}`);
          for (let wi = 1; wi < wrapped.length; wi++) result.push(wrapped[wi]);
          result[result.length - 1] += `</${tagName}>`;
        }
        i++;
        continue;
      }

      // Multi-line: opening tag has inline content but the closing tag is on a later line.
      // Collect everything until the closing tag, then emit in the same style as above.
      if (tagName === 'para' && shouldInsertParaSeparator(result)) {
        result.push('');
      }
      const collectedContent: string[] = [afterContent];
      let foundClose = false;
      i++;

      while (i < lines.length) {
        const contentLine = lines[i].trim();

        // Standalone closing tag on its own line
        if (contentLine.match(XML_CLOSE_TAG_REGEX)?.[1]?.toLowerCase() === tagName) {
          i++;
          foundClose = true;
          break;
        }

        // Closing tag at end of line (preceded by content on the same line).
        // Uses non-greedy `.*?` so it stops at the FIRST occurrence of </tagName>.
        const endCloseMatch = contentLine.match(new RegExp(`^(.*?)<\\/${tagName}>\\s*$`));
        if (endCloseMatch) {
          const beforeClose = endCloseMatch[1].trim();
          if (beforeClose) collectedContent.push(beforeClose);
          i++;
          foundClose = true;
          break;  // fixed: was `continue`, which re-entered the loop past the closing tag
        }

        // Skip blank lines within inline-open block content
        if (!contentLine) {
          i++;
          continue;
        }

        collectedContent.push(contentLine);
        i++;
      }

      const fullText = collectedContent.filter(l => l).join(' ');
      const wrapped = wrapParagraph(fullText, effectiveWidth);
      if (alwaysMultiLine) {
        result.push(`<${tagName}${tagAttrs}>`);
        if (wrapped.length > 0) result.push(...wrapped);
        if (foundClose) result.push(`</${tagName}>`);
      } else if (wrapped.length === 0) {
        result.push(`<${tagName}${tagAttrs}>${foundClose ? `</${tagName}>` : ''}`);
      } else {
        result.push(`<${tagName}${tagAttrs}>${wrapped[0]}`);
        for (let wi = 1; wi < wrapped.length; wi++) result.push(wrapped[wi]);
        if (foundClose) result[result.length - 1] += `</${tagName}>`;
      }
      continue;
    }

    // Plain text line (not inside a block tag) - collect and wrap
    const contentLines: string[] = [];
    while (i < lines.length) {
      const contentLine = lines[i].trim();
      if (!contentLine || contentLine.match(XML_OPEN_TAG_REGEX) || contentLine.match(XML_SELF_CLOSE_TAG_REGEX) || contentLine.match(XML_CLOSE_TAG_REGEX)) {
        break;
      }
      // Also stop when we encounter an inline block-level open tag (e.g. "<para>word...")
      // so the preceding paragraph flushes before the new block tag is handled.
      const inlineBlockOpen = contentLine.match(/^<(\w+)[^>]*>/);
      if (inlineBlockOpen && BLOCK_TAGS.has(inlineBlockOpen[1].toLowerCase())) {
        break;
      }
      contentLines.push(contentLine);
      i++;
    }
    if (contentLines.length > 0) {
      result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
    }

    // Safety: if no handler consumed the current line, skip it to prevent infinite loop
    if (contentLines.length === 0 && i < lines.length) {
      const skippedLine = lines[i].trim();
      if (skippedLine) {
        result.push(skippedLine);
      }
      i++;
    }
  }

  return result;
}

/**
 * Wraps a paragraph of text to fit within maxWidth.
 * XML tags (anything between < and >) are treated as atomic tokens
 * and will never be split across lines.
 */
function wrapParagraph(text: string, maxWidth: number): string[] {
  if (!text.trim()) return [];

  const words = tokenizePreservingXml(text);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  return lines;
}

/**
 * Splits text on whitespace while keeping XML tag sequences (<...>) as single indivisible tokens.
 */
function tokenizePreservingXml(text: string): string[] {
  const tokens: string[] = [];
  let buffer = '';
  let inTag = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '<') {
      inTag = true;
      buffer += ch;
    } else if (ch === '>') {
      inTag = false;
      buffer += ch;
    } else if (!inTag && (ch === ' ' || ch === '\t')) {
      if (buffer) {
        tokens.push(buffer);
        buffer = '';
      }
    } else {
      buffer += ch;
    }
  }
  if (buffer) tokens.push(buffer);

  return tokens.filter(t => t);
}

/**
 * Formats reflowed XML content as comment lines with proper prefixes.
 */
function formatAsCommentLines(
  xmlLines: string[],
  indentation: string,
  commentStyle: LanguageCommentStyle,
  isMultiLineStyle: boolean,
): string[] {
  if (isMultiLineStyle && commentStyle.multiLineDocStart) {
    const result: string[] = [];
    result.push(`${indentation}${commentStyle.multiLineDocStart}`);
    for (const line of xmlLines) {
      if (line === '') {
        result.push(`${indentation} ${commentStyle.multiLineContinuation || '*'}`);
      } else {
        result.push(`${indentation} ${commentStyle.multiLineContinuation || '*'} ${line}`);
      }
    }
    result.push(`${indentation} ${commentStyle.multiLineDocEnd}`);
    return result;
  }

  // Single-line style
  const prefix = commentStyle.singleLineDocPrefix ?? '///';
  return xmlLines.map(line => {
    if (line === '') {
      return `${indentation}${prefix}`;
    }
    return `${indentation}${prefix} ${line}`;
  });
}
