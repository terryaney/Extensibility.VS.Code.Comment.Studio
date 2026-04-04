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
import { BUILTIN_ANCHOR_TYPES } from '../anchors/anchorService';

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

// Static color lookup for anchor tags — used to colorize TODO:, HACK:, etc. in rendered HTML
const ANCHOR_TAG_COLORS: ReadonlyMap<string, string> = new Map(
  [...BUILTIN_ANCHOR_TYPES.entries()].map(([tag, type]) => [tag, type.color]),
);

function colorizeAnchorTags(html: string): string {
  // Match anchor tags at word boundaries: TODO:, HACK:, NOTE:, BUG:, etc.
  // The html parameter is already HTML-escaped text, so no tags to worry about.
  const tagPattern = [...ANCHOR_TAG_COLORS.keys()].join('|');
  const regex = new RegExp(`\\b(${tagPattern}):`, 'g');
  return html.replace(regex, (match, tag) => {
    const color = ANCHOR_TAG_COLORS.get(tag);
    if (!color) return match;
    return `<span style="color:${color};font-weight:600">${match}</span>`;
  });
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
 * Renders a plain-text tooltip for CodeLens hover display.
 * VS Code CodeLens Command.tooltip only supports plain strings.
 * Format:
 *   Summary text
 *       param1 — Description
 *   Returns: Description
 *   Example: code
 */
export function renderTooltipPlainText(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): string {
  const rendered = renderCommentBlock(block, repoInfo);
  const lines: string[] = [];

  // Summary
  const summarySection = rendered.sections.find(s => s.type === CommentSectionType.Summary);
  if (summarySection) {
    const summaryText = sectionLinesToPlainText(summarySection);
    if (summaryText) {
      lines.push(summaryText);
    }
  }

  // Parameters
  const paramSections = rendered.sections.filter(s => s.type === CommentSectionType.Param);
  const hasParamDescriptions = paramSections.some(s => sectionLinesToPlainText(s).trim().length > 0);
  if (paramSections.length > 0 && hasParamDescriptions) {
    lines.push('');
    for (const param of paramSections) {
      const paramName = param.name || '?';
      const desc = sectionLinesToPlainText(param);
      lines.push(`    ${paramName} — ${desc}`);
    }
  }

  // Type parameters
  const typeParamSections = rendered.sections.filter(s => s.type === CommentSectionType.TypeParam);
  const hasTypeParamDescriptions = typeParamSections.some(s => sectionLinesToPlainText(s).trim().length > 0);
  if (typeParamSections.length > 0 && hasTypeParamDescriptions) {
    lines.push('');
    for (const tp of typeParamSections) {
      const tpName = tp.name || '?';
      const desc = sectionLinesToPlainText(tp);
      lines.push(`    ${tpName} — ${desc}`);
    }
  }

  // Returns
  const returnsSection = rendered.sections.find(s => s.type === CommentSectionType.Returns);
  if (returnsSection) {
    const returnsText = sectionLinesToPlainText(returnsSection);
    if (returnsText.trim()) {
      lines.push('');
      lines.push(`Returns: ${returnsText}`);
    }
  }

  // Remarks
  const remarksSection = rendered.sections.find(s => s.type === CommentSectionType.Remarks);
  if (remarksSection) {
    const remarksText = sectionLinesToPlainText(remarksSection);
    if (remarksText.trim()) {
      lines.push('');
      lines.push('Remarks:');
      for (const line of remarksText.split('\n')) {
        lines.push(`    ${line}`);
      }
    }
  }

  // Example
  const exampleSection = rendered.sections.find(s => s.type === CommentSectionType.Example);
  if (exampleSection) {
    const exampleText = sectionLinesToPlainText(exampleSection);
    if (exampleText.trim()) {
      lines.push('');
      lines.push('Example:');
      for (const line of exampleText.split('\n')) {
        lines.push(`    ${line}`);
      }
    }
  }

  // Exceptions
  const exceptionSections = rendered.sections.filter(s => s.type === CommentSectionType.Exception);
  for (const exc of exceptionSections) {
    const excName = exc.name || 'Exception';
    const excText = sectionLinesToPlainText(exc);
    lines.push(`Throws ${excName}: ${excText}`);
  }

  return lines.join('\n');
}

function sectionLinesToPlainText(section: RenderedCommentSection): string {
  const parts: string[] = [];
  for (const line of section.lines) {
    if (isBlankLine(line)) continue;
    const lineText = line.segments.map(s => s.text).join('');
    parts.push(lineText);
  }
  return parts.join(' ').trim();
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
 * Renders an XML doc comment block as an HTML fragment (body content only, no document wrapper).
 * Suitable for embedding in an existing webview such as the documentation overlay.
 */
export function renderToHtmlFragment(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): string {
  const rendered = renderCommentBlock(block, repoInfo);
  const htmlParts: string[] = [];

  for (const section of rendered.sections) {
    if (section.lines.length === 0 || section.lines.every(l => isBlankLine(l))) continue;

    switch (section.type) {
      case CommentSectionType.Summary:
        htmlParts.push(`<div class="section summary">${sectionLinesToHtml(section)}</div>`);
        break;

      case CommentSectionType.Param:
      case CommentSectionType.TypeParam: {
        const label = section.type === CommentSectionType.TypeParam ? 'T' : '';
        const paramName = section.name || '?';
        const desc = sectionLinesToHtml(section);
        htmlParts.push(
          `<div class="param-row">` +
          `<span class="param-name">${label}${escapeHtml(paramName)}</span>` +
          `<span class="param-sep">—</span>` +
          `<span class="param-desc">${desc}</span>` +
          `</div>`,
        );
        break;
      }

      case CommentSectionType.Returns:
        htmlParts.push(
          `<div class="section labeled"><span class="section-label">Returns</span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;

      case CommentSectionType.Value:
        htmlParts.push(
          `<div class="section labeled"><span class="section-label">Value</span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;

      case CommentSectionType.Remarks:
        htmlParts.push(
          `<div class="section labeled"><span class="section-label">Remarks</span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;

      case CommentSectionType.Example:
        htmlParts.push(
          `<div class="section labeled example"><span class="section-label">Example</span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;

      case CommentSectionType.Exception: {
        const excName = section.name || 'Exception';
        htmlParts.push(
          `<div class="section labeled"><span class="section-label">Throws <code>${escapeHtml(excName)}</code></span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;
      }

      case CommentSectionType.SeeAlso:
        htmlParts.push(
          `<div class="section labeled"><span class="section-label">See Also</span>` +
          `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
        );
        break;

      default: {
        const heading = section.heading;
        if (heading) {
          htmlParts.push(
            `<div class="section labeled"><span class="section-label">${escapeHtml(heading)}</span>` +
            `<div class="section-body">${sectionLinesToHtml(section)}</div></div>`,
          );
        } else {
          htmlParts.push(`<div class="section">${sectionLinesToHtml(section)}</div>`);
        }
        break;
      }
    }
  }

  return htmlParts.join('\n');
}

/**
 * Renders an XML doc comment block as a styled HTML document for display in a WebviewPanel.
 * Uses VS Code theme CSS variables for consistent theming.
 */
export function renderToHtml(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): string {
  const body = renderToHtmlFragment(block, repoInfo);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 12px 16px;
    line-height: 1.5;
    margin: 0;
  }
  .summary {
    margin-bottom: 10px;
    color: var(--vscode-descriptionForeground);
    font-size: 1.05em;
  }
  .param-row {
    display: flex;
    gap: 8px;
    padding: 2px 0 2px 16px;
    align-items: baseline;
  }
  .param-name {
    color: var(--vscode-symbolIcon-fieldForeground, #9CDCFE);
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    white-space: nowrap;
  }
  .param-sep {
    color: var(--vscode-descriptionForeground);
    opacity: 0.6;
  }
  .param-desc {
    color: var(--vscode-editor-foreground);
  }
  .section {
    margin: 8px 0;
  }
  .section.labeled {
    margin: 12px 0 8px 0;
  }
  .section-label {
    display: block;
    font-weight: 600;
    color: var(--vscode-editorCodeLens-foreground, #999);
    text-transform: uppercase;
    font-size: 0.85em;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--vscode-widget-border, #333);
    padding-bottom: 2px;
  }
  .section-body {
    padding-left: 16px;
    color: var(--vscode-editor-foreground);
  }
  .example .section-body {
    background: var(--vscode-textBlockQuote-background, #1e1e1e);
    border-left: 3px solid var(--vscode-textBlockQuote-border, #444);
    padding: 8px 12px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    white-space: pre-wrap;
  }
  code {
    font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    color: var(--vscode-textPreformat-foreground, #CE9178);
    background: var(--vscode-textPreformat-background, rgba(255,255,255,0.06));
    padding: 1px 4px;
    border-radius: 3px;
  }
  a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .seg-bold { font-weight: 600; }
  .seg-italic { font-style: italic; }
  .seg-strike { text-decoration: line-through; }
  .blank-line { height: 0.5em; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function sectionLinesToHtml(section: RenderedCommentSection): string {
  const htmlLines: string[] = [];
  let i = 0;
  const lines = section.lines;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlankLine(line)) {
      htmlLines.push('<div class="blank-line"></div>');
      i++;
      continue;
    }

    // Merge consecutive Code-only lines into a single <code> block
    if (line.segments.length === 1 && line.segments[0].type === SegmentType.Code) {
      const codeTexts: string[] = [];
      while (i < lines.length) {
        const cl = lines[i];
        if (cl.segments.length === 1 && cl.segments[0].type === SegmentType.Code) {
          codeTexts.push(escapeHtml(cl.segments[0].text));
          i++;
        } else {
          break;
        }
      }
      htmlLines.push(`<code>${codeTexts.join('\n')}</code>`);
      continue;
    }

    const lineHtml = line.segments.map(s => segmentToHtml(s)).join('');
    htmlLines.push(`<div>${lineHtml}</div>`);
    i++;
  }
  return htmlLines.join('\n');
}

function segmentToHtml(segment: RenderedSegment): string {
  const text = escapeHtml(segment.text);
  switch (segment.type) {
    case SegmentType.Bold:
    case SegmentType.Heading:
      return `<span class="seg-bold">${text}</span>`;
    case SegmentType.Italic:
      return `<span class="seg-italic">${text}</span>`;
    case SegmentType.Code:
    case SegmentType.ParamRef:
    case SegmentType.TypeParamRef:
      return `<code>${text}</code>`;
    case SegmentType.Strikethrough:
      return `<span class="seg-strike">${text}</span>`;
    case SegmentType.Link:
    case SegmentType.IssueReference:
      if (segment.linkTarget && isSafeUrl(segment.linkTarget)) {
        return `<a href="${escapeHtml(segment.linkTarget)}">${text}</a>`;
      }
      return text;
    case SegmentType.Text:
    default:
      return colorizeAnchorTags(text);
  }
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('#');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
        case 'para': {
          const paraText = extractPlainText(child);
          if (paraText) parts.push(' ' + paraText);
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
