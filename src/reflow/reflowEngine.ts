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
  const result: string[] = [];
  let i = 0;

  // Calculate effective content width (subtract prefix overhead)
  const prefixOverhead = indentation.length + commentStyle.singleLineDocPrefix.length + 1; // +1 for space after prefix
  const effectiveWidth = Math.max(20, maxWidth - prefixOverhead);

  while (i < lines.length) {
    const line = lines[i].trim();

    // Empty line - preserve as paragraph break
    if (!line) {
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

      // Other block tags - put tag on its own line, reflow content
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

        // Check for nested block tags
        const nestedOpen = contentLine.match(XML_OPEN_TAG_REGEX);
        if (nestedOpen && BLOCK_TAGS.has(nestedOpen[1].toLowerCase())) {
          // Flush accumulated content first
          if (contentLines.length > 0) {
            result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
            contentLines.length = 0;
          }
          // Handle nested tag (push back and let outer loop handle)
          break;
        }

        if (contentLine === '') {
          // Paragraph break within block
          if (contentLines.length > 0) {
            result.push(...wrapParagraph(contentLines.join(' '), effectiveWidth));
            contentLines.length = 0;
          }
          result.push('');
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

    // Opening tag with content on same line (e.g., "<summary>Some text")
    const inlineOpenMatch = line.match(/^<(\w+)([^>]*)>\s*(.+)$/);
    if (inlineOpenMatch && BLOCK_TAGS.has(inlineOpenMatch[1].toLowerCase())) {
      const tagName = inlineOpenMatch[1].toLowerCase();
      const tagAttrs = inlineOpenMatch[2];
      const afterContent = inlineOpenMatch[3].trim();

      // Check if closing tag is on same line
      const inlineCloseMatch = afterContent.match(new RegExp(`^(.*)<\\/${tagName}>\\s*$`));
      if (inlineCloseMatch) {
        // Single line tag with content
        const content = inlineCloseMatch[1].trim();
        const wrapped = wrapParagraph(content, effectiveWidth);
        if (wrapped.length === 1) {
          result.push(`<${tagName}${tagAttrs}>${wrapped[0]}</${tagName}>`);
        } else {
          result.push(`<${tagName}${tagAttrs}>`);
          result.push(...wrapped);
          result.push(`</${tagName}>`);
        }
        i++;
        continue;
      }

      // Multi-line: split tag and content
      result.push(`<${tagName}${tagAttrs}>`);
      const contentLines: string[] = [afterContent];
      i++;

      while (i < lines.length) {
        const contentLine = lines[i].trim();
        const closeMatch = contentLine.match(XML_CLOSE_TAG_REGEX);
        if (closeMatch && closeMatch[1].toLowerCase() === tagName) {
          break;
        }

        // Check for closing tag at end of line
        const endCloseMatch = contentLine.match(new RegExp(`^(.*)<\\/${tagName}>\\s*$`));
        if (endCloseMatch) {
          contentLines.push(endCloseMatch[1].trim());
          i++;
          // Flush and add closing tag
          if (contentLines.length > 0) {
            const text = contentLines.filter(l => l).join(' ');
            if (text) result.push(...wrapParagraph(text, effectiveWidth));
          }
          result.push(`</${tagName}>`);
          continue;
        }

        if (contentLine === '') {
          if (contentLines.length > 0) {
            const text = contentLines.filter(l => l).join(' ');
            if (text) result.push(...wrapParagraph(text, effectiveWidth));
            contentLines.length = 0;
          }
          result.push('');
        } else {
          contentLines.push(contentLine);
        }
        i++;
      }

      if (contentLines.length > 0) {
        const text = contentLines.filter(l => l).join(' ');
        if (text) result.push(...wrapParagraph(text, effectiveWidth));
      }

      if (i < lines.length) {
        result.push(`</${tagName}>`);
        i++;
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
 */
function wrapParagraph(text: string, maxWidth: number): string[] {
  if (!text.trim()) return [];

  const words = text.split(/\s+/).filter(w => w);
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
  return xmlLines.map(line => {
    if (line === '') {
      return `${indentation}${commentStyle.singleLineDocPrefix}`;
    }
    return `${indentation}${commentStyle.singleLineDocPrefix} ${line}`;
  });
}
