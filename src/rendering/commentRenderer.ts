import {
  RenderedComment,
  RenderedCommentSection,
  RenderedLine,
  RenderedSegment,
  CommentSectionType,
  SegmentType,
  XmlDocCommentBlock,
  GitRepositoryInfo,
} from '../types';
import { parseXmlContent, isElement, isText, XmlNode, XmlElement, getAttr, extractText } from '../parsing/xmlDocParser';
import { processMarkdownInText } from './markdownProcessor';

// vscode is only available at runtime in the extension host, not in unit tests.
// We use a lazy import pattern so renderToMarkdown works in the extension
// while the rest of commentRenderer remains testable without vscode.
let vscodeModule: typeof import('vscode') | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  vscodeModule = require('vscode');
} catch {
  // Running in test environment without vscode
}

export const NO_SUMMARY_PLACEHOLDER = '(No summary provided)';

/**
 * Renders an XML doc comment block into a structured rendered model.
 */
export function renderCommentBlock(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): RenderedComment {
  return renderXmlContent(block.xmlContent, repoInfo, block.indentation);
}

/**
 * Renders raw XML content into a structured rendered model.
 * Primarily for testing purposes.
 */
export function renderXmlContent(xmlContent: string, repoInfo?: GitRepositoryInfo, indentation = ''): RenderedComment {
  const result: RenderedComment = {
    lines: [],
    indentation,
    sections: [],
  };

  if (!xmlContent || !xmlContent.trim()) {
    ensureSummarySection(result);
    return result;
  }

  const nodes = parseXmlContent(xmlContent);

  if (nodes) {
    for (const node of nodes) {
      renderTopLevelNode(node, result, repoInfo);
    }
    ensureSummarySection(result);
    populateLinesFromSections(result);
  } else {
    // XML parsing failed - render as plain text
    const cleanedText = cleanText(xmlContent);
    const line: RenderedLine = { segments: [{ text: cleanedText, type: SegmentType.Text }] };
    result.lines.push(line);

    const summarySection = createSection(CommentSectionType.Summary);
    summarySection.lines.push({ segments: [{ text: cleanedText, type: SegmentType.Text }] });
    result.sections.push(summarySection);
  }

  return result;
}

/**
 * Extracts plain text summary from XML content for compact display.
 */
export function getStrippedSummaryFromXml(xmlContent: string, repoInfo?: GitRepositoryInfo): string {
  if (!xmlContent || !xmlContent.trim()) {
    return NO_SUMMARY_PLACEHOLDER;
  }

  const nodes = parseXmlContent(xmlContent);

  if (nodes) {
    // Check for inheritdoc
    for (const node of nodes) {
      if (isElement(node) && node.tagName.toLowerCase() === 'inheritdoc') {
        const cref = getAttr(node, 'cref');
        if (cref) {
          const typeName = getTypeNameFromCref(cref);
          return `(Documentation inherited from ${typeName})`;
        }
        return '(Documentation inherited)';
      }
    }

    // Find summary element
    for (const node of nodes) {
      if (isElement(node) && node.tagName.toLowerCase() === 'summary') {
        const summaryText = cleanText(extractPlainText(node));
        return summaryText.trim() || NO_SUMMARY_PLACEHOLDER;
      }
    }

    return NO_SUMMARY_PLACEHOLDER;
  }

  // XML parsing failed - strip tags manually
  const stripped = stripXmlTags(xmlContent);
  return stripped.trim() || NO_SUMMARY_PLACEHOLDER;
}

/**
 * Gets a stripped summary directly from a comment block.
 */
export function getStrippedSummary(block: XmlDocCommentBlock): string {
  if (!block.xmlContent || !block.xmlContent.trim()) {
    return NO_SUMMARY_PLACEHOLDER;
  }
  return getStrippedSummaryFromXml(block.xmlContent);
}

/**
 * Renders an XML doc comment block to a rich MarkdownString for hover display.
 * Requires vscode module to be available (extension host only).
 */
export function renderToMarkdown(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): InstanceType<typeof import('vscode').MarkdownString> | undefined {
  if (!vscodeModule) return undefined;

  const rendered = renderCommentBlock(block, repoInfo);
  const md = new vscodeModule.MarkdownString('', true);
  md.isTrusted = true;
  md.supportHtml = true;

  let isFirst = true;
  for (const section of rendered.sections) {
    if (section.lines.length === 0 || section.lines.every(l => isBlankLine(l))) continue;

    if (!isFirst) {
      md.appendMarkdown('\n\n---\n\n');
    }
    isFirst = false;

    // Add section heading
    const heading = getSectionMarkdownHeading(section);
    if (heading) {
      md.appendMarkdown(`**${heading}**\n\n`);
    }

    // Render section lines
    const lineTexts: string[] = [];
    for (const line of section.lines) {
      if (isBlankLine(line)) {
        lineTexts.push('');
        continue;
      }
      const lineText = line.segments.map(s => segmentToMarkdown(s)).join('');
      lineTexts.push(lineText);
    }

    // Trim trailing blank lines
    while (lineTexts.length > 0 && lineTexts[lineTexts.length - 1] === '') {
      lineTexts.pop();
    }

    md.appendMarkdown(lineTexts.join('  \n'));
  }

  return md;
}

/**
 * Converts a rendered comment to a plain markdown string (no vscode dependency).
 * Used for testing.
 */
export function renderToMarkdownString(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): string {
  const rendered = renderCommentBlock(block, repoInfo);
  const parts: string[] = [];

  let isFirst = true;
  for (const section of rendered.sections) {
    if (section.lines.length === 0 || section.lines.every(l => isBlankLine(l))) continue;

    if (!isFirst) {
      parts.push('\n\n---\n\n');
    }
    isFirst = false;

    const heading = getSectionMarkdownHeading(section);
    if (heading) {
      parts.push(`**${heading}**\n\n`);
    }

    const lineTexts: string[] = [];
    for (const line of section.lines) {
      if (isBlankLine(line)) {
        lineTexts.push('');
        continue;
      }
      const lineText = line.segments.map(s => segmentToMarkdown(s)).join('');
      lineTexts.push(lineText);
    }

    while (lineTexts.length > 0 && lineTexts[lineTexts.length - 1] === '') {
      lineTexts.pop();
    }

    parts.push(lineTexts.join('  \n'));
  }

  return parts.join('');
}

function getSectionMarkdownHeading(section: RenderedCommentSection): string | undefined {
  switch (section.type) {
    case CommentSectionType.Summary:
      return undefined; // No heading for summary
    case CommentSectionType.Param:
      return section.name ? `Parameter \`${section.name}\`` : 'Parameter';
    case CommentSectionType.TypeParam:
      return section.name ? `Type Parameter \`${section.name}\`` : 'Type Parameter';
    case CommentSectionType.Returns:
      return 'Returns';
    case CommentSectionType.Value:
      return 'Value';
    case CommentSectionType.Remarks:
      return 'Remarks';
    case CommentSectionType.Example:
      return 'Example';
    case CommentSectionType.Exception:
      return section.name ? `Throws \`${section.name}\`` : 'Throws';
    case CommentSectionType.SeeAlso:
      return 'See Also';
    default:
      return section.heading;
  }
}

function segmentToMarkdown(segment: RenderedSegment): string {
  switch (segment.type) {
    case SegmentType.Bold:
      return `**${segment.text}**`;
    case SegmentType.Italic:
      return `*${segment.text}*`;
    case SegmentType.Code:
      return `\`${segment.text}\``;
    case SegmentType.Link:
      return segment.linkTarget ? `[${segment.text}](${segment.linkTarget})` : segment.text;
    case SegmentType.Strikethrough:
      return `~~${segment.text}~~`;
    case SegmentType.IssueReference:
      return segment.linkTarget ? `[${segment.text}](${segment.linkTarget})` : segment.text;
    case SegmentType.ParamRef:
    case SegmentType.TypeParamRef:
      return `\`${segment.text}\``;
    case SegmentType.Heading:
      return `**${segment.text}**`;
    case SegmentType.Text:
    default:
      return segment.text;
  }
}

// --- Internal rendering functions ---

function createSection(type: CommentSectionType, heading?: string, name?: string): RenderedCommentSection {
  return { type, heading, name, lines: [], listContentStartIndex: -1 };
}

function ensureSummarySection(result: RenderedComment): void {
  let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
  if (!summary) {
    summary = createSection(CommentSectionType.Summary);
    result.sections.unshift(summary);
  }

  const isEmpty = summary.lines.length === 0 || summary.lines.every(l => isBlankLine(l));
  if (isEmpty) {
    summary.lines = [{ segments: [{ text: NO_SUMMARY_PLACEHOLDER, type: SegmentType.Text }] }];
  }
}

function isBlankLine(line: RenderedLine): boolean {
  return line.segments.length === 0 ||
    (line.segments.length === 1 && (!line.segments[0].text || !line.segments[0].text.trim()));
}

function populateLinesFromSections(result: RenderedComment): void {
  let isFirst = true;
  let previousSection: RenderedCommentSection | undefined;

  for (const section of result.sections) {
    if (section.lines.length === 0 || section.lines.every(l => isBlankLine(l))) {
      continue;
    }

    if (!isFirst) {
      const needsExtraPadding = section.type === CommentSectionType.Remarks
        || section.type === CommentSectionType.Example
        || section.type === CommentSectionType.SeeAlso
        || (previousSection?.type === CommentSectionType.Summary);

      result.lines.push({ segments: [] }); // blank line
      if (needsExtraPadding) {
        result.lines.push({ segments: [] }); // extra blank line
      }
    }

    isFirst = false;

    if (section.heading && section.type !== CommentSectionType.Summary) {
      result.lines.push({
        segments: [{ text: section.heading, type: SegmentType.Heading }],
      });
      if (section.lines.length > 0 && !isBlankLine(section.lines[0])) {
        result.lines.push({ segments: [] });
      }
    }

    for (const line of section.lines) {
      result.lines.push(line);
    }

    previousSection = section;
  }
}

function renderTopLevelNode(node: XmlNode, result: RenderedComment, repoInfo?: GitRepositoryInfo): void {
  if (isText(node)) {
    const text = cleanText(node.text);
    if (text.trim()) {
      let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      if (!summary) {
        summary = createSection(CommentSectionType.Summary);
        result.sections.unshift(summary);
      }
      const line = getOrCreateCurrentLine(summary);
      const segments = processMarkdownInText(text, repoInfo);
      for (const seg of segments) {
        line.segments.push(seg);
      }
    }
    return;
  }

  if (!isElement(node)) return;

  const tagName = node.tagName.toLowerCase();

  switch (tagName) {
    case 'summary':
      renderSectionElement(node, result, CommentSectionType.Summary, undefined, undefined, repoInfo);
      break;
    case 'remarks':
      renderSectionElement(node, result, CommentSectionType.Remarks, 'Remarks:', undefined, repoInfo);
      break;
    case 'returns':
      renderSectionElement(node, result, CommentSectionType.Returns, 'Returns:', undefined, repoInfo);
      break;
    case 'value':
      renderSectionElement(node, result, CommentSectionType.Value, 'Value:', undefined, repoInfo);
      break;
    case 'example':
      renderSectionElement(node, result, CommentSectionType.Example, 'Example:', undefined, repoInfo);
      break;
    case 'param': {
      const paramName = getAttr(node, 'name');
      renderSectionElement(node, result, CommentSectionType.Param, `Parameter '${paramName}':`, paramName, repoInfo);
      break;
    }
    case 'typeparam': {
      const typeParamName = getAttr(node, 'name');
      renderSectionElement(node, result, CommentSectionType.TypeParam, `Type parameter '${typeParamName}':`, typeParamName, repoInfo);
      break;
    }
    case 'exception': {
      const exceptionType = getTypeNameFromCref(getAttr(node, 'cref'));
      renderSectionElement(node, result, CommentSectionType.Exception, `Throws ${exceptionType}:`, exceptionType, repoInfo);
      break;
    }
    case 'seealso':
      renderSeeAlsoSection(node, result);
      break;
    case 'inheritdoc':
      renderInheritDocSection(node, result);
      break;
    default: {
      let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      if (!summary) {
        summary = createSection(CommentSectionType.Summary);
        result.sections.unshift(summary);
      }
      renderChildNodes(node, summary, repoInfo);
      break;
    }
  }
}

function renderSectionElement(
  element: XmlElement,
  result: RenderedComment,
  sectionType: CommentSectionType,
  heading: string | undefined,
  name: string | undefined,
  repoInfo?: GitRepositoryInfo,
): void {
  const section = createSection(sectionType, heading, name);
  renderChildNodes(element, section, repoInfo);
  result.sections.push(section);
}

function renderSeeAlsoSection(element: XmlElement, result: RenderedComment): void {
  let seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso);
  if (!seeAlsoSection) {
    seeAlsoSection = createSection(CommentSectionType.SeeAlso, 'See also:');
    result.sections.push(seeAlsoSection);
  }

  const cref = getAttr(element, 'cref');
  const href = getAttr(element, 'href');
  const displayText = extractText(element.children).trim();
  let linkTarget: string | undefined;
  let text = displayText;

  if (cref) {
    linkTarget = cref;
    if (!text) text = getTypeNameFromCref(cref);
  } else if (href) {
    linkTarget = href;
    if (!text) text = href;
  }

  if (text) {
    seeAlsoSection.lines.push({
      segments: [
        { text: '• ', type: SegmentType.Text },
        { text, type: SegmentType.Link, linkTarget },
      ],
    });
  }
}

function renderInheritDocSection(element: XmlElement, result: RenderedComment): void {
  const section = createSection(CommentSectionType.Summary);
  const line: RenderedLine = { segments: [] };

  const cref = getAttr(element, 'cref');
  if (cref) {
    const typeName = getTypeNameFromCref(cref);
    line.segments.push(
      { text: '(Documentation inherited from ', type: SegmentType.Italic },
      { text: typeName, type: SegmentType.Code },
      { text: ')', type: SegmentType.Italic },
    );
  } else {
    line.segments.push({ text: '(Documentation inherited)', type: SegmentType.Italic });
  }

  section.lines.push(line);
  result.sections.push(section);
}

function renderNode(node: XmlNode, section: RenderedCommentSection, repoInfo?: GitRepositoryInfo): void {
  if (isText(node)) {
    renderTextNode(node.text, section, repoInfo);
    return;
  }

  if (!isElement(node)) return;

  const tagName = node.tagName.toLowerCase();

  switch (tagName) {
    case 'see':
      renderSeeTag(node, section);
      break;
    case 'paramref':
    case 'typeparamref': {
      const name = getAttr(node, 'name');
      if (name) {
        getOrCreateCurrentLine(section).segments.push({ text: name, type: SegmentType.Code });
      }
      break;
    }
    case 'c': {
      const code = extractText(node.children);
      if (code) {
        getOrCreateCurrentLine(section).segments.push({ text: code, type: SegmentType.Code });
      }
      break;
    }
    case 'code':
      renderCodeBlock(node, section);
      break;
    case 'para':
      section.lines.push({ segments: [] });
      renderChildNodes(node, section, repoInfo);
      section.lines.push({ segments: [] });
      break;
    case 'list':
      renderList(node, section);
      break;
    case 'b':
    case 'strong': {
      const boldText = extractText(node.children);
      if (boldText) {
        getOrCreateCurrentLine(section).segments.push({ text: boldText, type: SegmentType.Bold });
      }
      break;
    }
    case 'i':
    case 'em': {
      const italicText = extractText(node.children);
      if (italicText) {
        getOrCreateCurrentLine(section).segments.push({ text: italicText, type: SegmentType.Italic });
      }
      break;
    }
    default:
      renderChildNodes(node, section, repoInfo);
      break;
  }
}

function renderChildNodes(parent: XmlElement, section: RenderedCommentSection, repoInfo?: GitRepositoryInfo): void {
  for (const child of parent.children) {
    renderNode(child, section, repoInfo);
  }
}

function renderSeeTag(element: XmlElement, section: RenderedCommentSection): void {
  const cref = getAttr(element, 'cref');
  const href = getAttr(element, 'href');
  const langword = getAttr(element, 'langword');
  let displayText = extractText(element.children).trim();
  let segmentType: SegmentType;
  let linkTarget: string | undefined;

  if (cref) {
    segmentType = SegmentType.Code;
    if (!displayText) {
      displayText = getTypeNameFromCref(cref) || cref;
    }
  } else if (href) {
    segmentType = SegmentType.Link;
    linkTarget = href;
    if (!displayText) displayText = href;
  } else if (langword) {
    segmentType = SegmentType.Code;
    displayText = langword;
  } else {
    segmentType = SegmentType.Text;
  }

  if (displayText) {
    getOrCreateCurrentLine(section).segments.push({ text: displayText, type: segmentType, linkTarget });
  }
}

function renderCodeBlock(element: XmlElement, section: RenderedCommentSection): void {
  section.lines.push({ segments: [] }); // blank before

  const codeContent = extractText(element.children);
  const codeLines = codeContent.split(/\r?\n/);

  // Find minimum indentation
  let minIndent = Infinity;
  for (const codeLine of codeLines) {
    if (!codeLine.trim()) continue;
    const leadingSpaces = codeLine.length - codeLine.trimStart().length;
    if (leadingSpaces < minIndent) minIndent = leadingSpaces;
  }
  if (!isFinite(minIndent)) minIndent = 0;

  for (const codeLine of codeLines) {
    const line: RenderedLine = { segments: [] };
    if (!codeLine.trim()) {
      line.segments.push({ text: ' ', type: SegmentType.Code });
    } else {
      const normalizedLine = codeLine.length > minIndent
        ? codeLine.substring(minIndent)
        : codeLine.trimStart();
      line.segments.push({ text: '    ' + normalizedLine.trimEnd(), type: SegmentType.Code });
    }
    section.lines.push(line);
  }

  section.lines.push({ segments: [] }); // blank after
}

function renderList(element: XmlElement, section: RenderedCommentSection): void {
  if (section.listContentStartIndex < 0) {
    section.listContentStartIndex = section.lines.length;
  }

  if (section.lines.length === 0 || !isBlankLine(section.lines[section.lines.length - 1])) {
    section.lines.push({ segments: [] });
  }

  const listType = getAttr(element, 'type');
  let itemNumber = 1;

  for (const child of element.children) {
    if (isElement(child) && child.tagName.toLowerCase() === 'item') {
      const line: RenderedLine = { segments: [] };
      const bullet = listType === 'number' ? `${itemNumber++}. ` : '  • ';
      line.segments.push({ text: bullet, type: SegmentType.Text });

      const term = child.children.find(c => isElement(c) && c.tagName.toLowerCase() === 'term') as XmlElement | undefined;
      const description = child.children.find(c => isElement(c) && c.tagName.toLowerCase() === 'description') as XmlElement | undefined;

      if (term) {
        line.segments.push({ text: extractText(term.children).trim(), type: SegmentType.Bold });
        if (description) {
          line.segments.push({ text: ' – ', type: SegmentType.Text });
          line.segments.push({ text: extractText(description.children).trim(), type: SegmentType.Text });
        }
      } else {
        line.segments.push({ text: extractText(child.children).trim(), type: SegmentType.Text });
      }

      section.lines.push(line);
    }
  }
}

function renderTextNode(text: string, section: RenderedCommentSection, repoInfo?: GitRepositoryInfo): void {
  if (!text) return;

  const lines = text.split(/\r?\n|\r/);

  for (let i = 0; i < lines.length; i++) {
    const lineText = cleanLineText(lines[i]);

    if (lineText.trim()) {
      const line = getOrCreateCurrentLine(section);
      const segments = processMarkdownInText(lineText, repoInfo);
      for (const seg of segments) {
        line.segments.push(seg);
      }
    }

    if (i < lines.length - 1) {
      section.lines.push({ segments: [] });
    }
  }
}

function getOrCreateCurrentLine(section: RenderedCommentSection): RenderedLine {
  if (section.lines.length === 0) {
    const line: RenderedLine = { segments: [] };
    section.lines.push(line);
    return line;
  }
  return section.lines[section.lines.length - 1];
}

function cleanLineText(text: string): string {
  if (!text) return '';

  const hadLeadingSpace = text.length > 0 && /\s/.test(text[0]);
  const hadTrailingSpace = text.length > 0 && /\s/.test(text[text.length - 1]);

  text = text.replace(/\s+/g, ' ');
  const trimmed = text.trim();

  if (!trimmed) {
    return (hadLeadingSpace || hadTrailingSpace) ? ' ' : '';
  }

  let result = trimmed;
  if (hadLeadingSpace) result = ' ' + result;
  if (hadTrailingSpace) result += ' ';
  return result;
}

function cleanText(text: string): string {
  if (!text) return '';

  const hadLeadingSpace = /\s/.test(text[0]);
  const hadTrailingSpace = /\s/.test(text[text.length - 1]);

  text = text.replace(/\s+/g, ' ');
  const trimmed = text.trim();

  if (!trimmed) {
    return (hadLeadingSpace || hadTrailingSpace) ? ' ' : '';
  }

  let result = trimmed;
  if (hadLeadingSpace) result = ' ' + result;
  if (hadTrailingSpace) result += ' ';
  return result;
}

export function getTypeNameFromCref(cref: string): string {
  if (!cref) return '';

  let result = cref;

  // Remove type prefix (T:, M:, P:, F:, E:)
  if (result.length > 2 && result[1] === ':') {
    result = result.substring(2);
  }

  // Remove parameter list
  const parenIndex = result.indexOf('(');
  if (parenIndex >= 0) {
    result = result.substring(0, parenIndex);
  }

  // Get just the type/member name
  const lastDot = result.lastIndexOf('.');
  if (lastDot >= 0 && lastDot < result.length - 1) {
    result = result.substring(lastDot + 1);
  }

  return result;
}

function stripXmlTags(xml: string): string {
  if (!xml) return '';
  let text = xml.replace(/<[^>]+>/g, ' ');
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

/**
 * Recursively extracts plain text from an XML node tree.
 * Code-like elements are wrapped in backticks for markdown processing.
 */
function extractPlainText(element: XmlElement): string {
  const parts: string[] = [];

  for (const child of element.children) {
    if (isText(child)) {
      parts.push(child.text);
    } else if (isElement(child)) {
      const tagName = child.tagName.toLowerCase();
      switch (tagName) {
        case 'paramref':
        case 'typeparamref': {
          const name = getAttr(child, 'name');
          if (name) parts.push(`\`${name}\``);
          break;
        }
        case 'see':
        case 'seealso': {
          const cref = getAttr(child, 'cref');
          const typeName = getTypeNameFromCref(cref);
          if (typeName) parts.push(`\`${typeName}\``);
          break;
        }
        case 'c': {
          const code = extractText(child.children);
          if (code) parts.push(`\`${code}\``);
          break;
        }
        default:
          parts.push(extractPlainText(child));
          break;
      }
    }
  }

  return parts.join('');
}
