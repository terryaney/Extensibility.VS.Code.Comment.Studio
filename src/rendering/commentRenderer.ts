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

const JSDOC_LANGUAGES = new Set(['javascript', 'typescript', 'typescriptreact', 'javascriptreact']);
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

// Static color lookup for anchor tags — used to colorize TODO:, HACK:, etc. in rendered output
const ANCHOR_TAG_COLORS: ReadonlyMap<string, string> = new Map(
  [...BUILTIN_ANCHOR_TYPES.entries()].map(([tag, type]) => [tag, type.color]),
);

/**
 * Colorizes anchor tags in plain text for MarkdownString output.
 * Uses the restricted style attribute allowed in VS Code hovers.
 */
function colorizeAnchorTagsMarkdown(text: string): string {
  const tagPattern = [...ANCHOR_TAG_COLORS.keys()].join('|');
  const regex = new RegExp(`\\b(${tagPattern}):`, 'g');
  return text.replace(regex, (match, tag) => {
    const color = ANCHOR_TAG_COLORS.get(tag);
    if (!color) return match;
    return `<span style="color:${color};">${match}</span>`;
  });
}

export const NO_SUMMARY_PLACEHOLDER = '(No summary provided)';

/**
 * Renders an XML doc comment block into a structured rendered model.
 */
export function renderCommentBlock(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): RenderedComment {
  const fallbackSummary = block.memberName ? `${block.memberName} Details` : undefined;
  return renderXmlContent(block.xmlContent, repoInfo, block.indentation, block.languageId, fallbackSummary);
}

/**
 * Renders raw XML content into a structured rendered model.
 * Primarily for testing purposes.
 */
export function renderXmlContent(xmlContent: string, repoInfo?: GitRepositoryInfo, indentation = '', languageId?: string, fallbackSummary?: string): RenderedComment {
  const result: RenderedComment = {
    lines: [],
    indentation,
    sections: [],
  };

  if (!xmlContent || !xmlContent.trim()) {
    ensureSummarySection(result, fallbackSummary);
    return result;
  }

  // Route JSDoc/TSDoc languages through the JSDoc renderer
  if (languageId && JSDOC_LANGUAGES.has(languageId)) {
    return renderJsDocContent(xmlContent, repoInfo, languageId, indentation, fallbackSummary);
  }

  const nodes = parseXmlContent(xmlContent);

  if (nodes) {
    for (const node of nodes) {
      renderTopLevelNode(node, result, repoInfo);
    }
    ensureSummarySection(result, fallbackSummary);
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
export function getStrippedSummaryFromXml(xmlContent: string, repoInfo?: GitRepositoryInfo, languageId?: string): string {
  if (!xmlContent || !xmlContent.trim()) {
    return NO_SUMMARY_PLACEHOLDER;
  }

  // For JSDoc languages, extract summary from parsed JSDoc
  if (languageId && JSDOC_LANGUAGES.has(languageId)) {
    const parsed = parseJsDoc(xmlContent);
    const descEntry = parsed.entries.find(e => e.tag === 'desc' || e.tag === 'description' || e.tag === 'summary');
    if (descEntry && descEntry.descLines.length > 0) {
      const text = cleanText(descEntry.descLines.filter(Boolean).join(' ')).trim();
      if (text) return text;
    }
    // Fall back to @brief (Doxygen)
    const briefEntry = parsed.entries.find(e => e.tag === 'brief');
    if (briefEntry && briefEntry.descLines.length > 0) {
      const text = cleanText(briefEntry.descLines.filter(Boolean).join(' ')).trim();
      if (text) return text;
    }
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
        const summaryText = cleanText(extractFirstParagraphText(node));
        return summaryText.trim() || NO_SUMMARY_PLACEHOLDER;
      }
    }

    // No <summary> element — collect leading text nodes (description before @tags).
    // Stop at the first @tag line or blank line after content has started.
    const descParts: string[] = [];
    for (const node of nodes) {
      if (!isText(node)) continue;
      const lines = node.text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('@') || trimmed.startsWith('\\')) break;
        if (trimmed) descParts.push(trimmed);
        else if (descParts.length > 0) break; // blank line after description ends it
      }
    }
    if (descParts.length > 0) {
      return cleanText(descParts.join(' ')).trim() || NO_SUMMARY_PLACEHOLDER;
    }

    // @brief fallback for Doxygen-style (C/C++)
    for (const node of nodes) {
      if (!isText(node)) continue;
      for (const line of node.text.split(/\r?\n/)) {
        const m = /^[ \t]*[@\\]brief\s+(.+)/.exec(line);
        if (m) return cleanText(m[1]).trim() || NO_SUMMARY_PLACEHOLDER;
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
    return block.memberName ? `${block.memberName} Details` : NO_SUMMARY_PLACEHOLDER;
  }
  const result = getStrippedSummaryFromXml(block.xmlContent, undefined, block.languageId);
  if (result === NO_SUMMARY_PLACEHOLDER && block.memberName) {
    return `${block.memberName} Details`;
  }
  return result;
}

/**
 * Renders an XML doc comment block to a rich MarkdownString for hover display.
 * Requires vscode module to be available (extension host only).
 */
export interface SignatureInfo {
  text: string;
  languageId: string;
}

export function renderToMarkdown(
  block: XmlDocCommentBlock,
  repoInfo?: GitRepositoryInfo,
  signatureInfo?: SignatureInfo,
): InstanceType<typeof import('vscode').MarkdownString> | undefined {
  if (!vscodeModule) return undefined;

  const rendered = renderCommentBlock(block, repoInfo);
  const md = new vscodeModule.MarkdownString('', true);
  md.isTrusted = true;
  md.supportHtml = true;

  const fenceLang = block.languageId ?? 'csharp';

  if (signatureInfo) {
    const fence = safeFence(signatureInfo.text);
    // 5 trailing spaces on the last content line — JS detects these to identify KAT hovers.
    const fenceLines = signatureInfo.text.split('\n');
    fenceLines[fenceLines.length - 1] += '     ';
    md.appendMarkdown(`${fence}${signatureInfo.languageId}\n${fenceLines.join('\n')}\n${fence}\n\n`);
	// md.appendMarkdown(`${fence}${signatureInfo.languageId}\n${signatureInfo.text}\n${fence}\n\n`);
  }

  // Collect params/typeParams for table rendering
  const paramSections = rendered.sections.filter(
    s => (s.type === CommentSectionType.Param || s.type === CommentSectionType.TypeParam)
      && s.lines.length > 0 && !s.lines.every(l => isBlankLine(l)),
  );
  let paramSectionsRendered = false;

  // Collect exceptions for table rendering
  const exceptionSections = rendered.sections.filter(
    s => s.type === CommentSectionType.Exception
      && s.lines.length > 0 && !s.lines.every(l => isBlankLine(l)),
  );
  let exceptionSectionsRendered = false;

  // Collect seealso entries for table rendering (include entries with no description lines too)
  const seeAlsoSections = rendered.sections.filter(s => s.type === CommentSectionType.SeeAlso);
  let seeAlsoSectionsRendered = false;

  let isFirst = true;
  for (const section of rendered.sections) {
    if (section.type !== CommentSectionType.SeeAlso
      && (section.lines.length === 0 || section.lines.every(l => isBlankLine(l)))) continue;

    // Batch all param/typeParam sections into a single table
    if (section.type === CommentSectionType.Param || section.type === CommentSectionType.TypeParam) {
      if (paramSectionsRendered) continue;
      paramSectionsRendered = true;
      if (!isFirst) md.appendMarkdown('\n\n---\n\n');
      isFirst = false;
      md.appendMarkdown(renderParamTableMarkdown(paramSections));
      continue;
    }

    // Batch all exception sections into a single table
    if (section.type === CommentSectionType.Exception) {
      if (exceptionSectionsRendered) continue;
      exceptionSectionsRendered = true;
      if (!isFirst) md.appendMarkdown('\n\n---\n\n');
      isFirst = false;
      md.appendMarkdown(renderExceptionTableMarkdown(exceptionSections));
      continue;
    }

    // Batch all seealso entries into a single table
    if (section.type === CommentSectionType.SeeAlso) {
      if (seeAlsoSectionsRendered) continue;
      seeAlsoSectionsRendered = true;
      if (!isFirst) md.appendMarkdown('\n\n---\n\n');
      isFirst = false;
      md.appendMarkdown(renderSeeAlsoTableMarkdown(seeAlsoSections));
      continue;
    }

    if (!isFirst) md.appendMarkdown('\n\n---\n\n');
    isFirst = false;

    switch (section.type) {
      case CommentSectionType.Summary:
        md.appendMarkdown(sectionLinesToMarkdownRich(section, fenceLang));
        break;

      case CommentSectionType.Returns:
        md.appendMarkdown(sectionHeadingMarkdown('$(symbol-key) Returns'));
        md.appendMarkdown(sectionLinesToMarkdownRich(section, fenceLang));
        break;

      case CommentSectionType.Value:
        md.appendMarkdown(sectionHeadingMarkdown('$(symbol-value) Value'));
        md.appendMarkdown(sectionLinesToMarkdownRich(section, fenceLang));
        break;

      case CommentSectionType.Remarks:
        md.appendMarkdown(sectionHeadingMarkdown('$(comment-discussion) Remarks'));
        md.appendMarkdown(sectionLinesToMarkdownRich(section, fenceLang));
        break;

      case CommentSectionType.Example:
        md.appendMarkdown(sectionHeadingMarkdown('$(book) Example'));
        md.appendMarkdown(sectionLinesToMarkdownRichExample(section, fenceLang));
        break;

      default: {
        const heading = section.heading;
        if (heading) {
          md.appendMarkdown(sectionHeadingMarkdown(heading));
        }
        md.appendMarkdown(sectionLinesToMarkdownRich(section, fenceLang));
        break;
      }
    }
  }

  return md;
}

/**
 * Renders a styled section heading for hover display.
 * Uses a span with muted color for visual hierarchy.
 */
function sectionHeadingMarkdown(label: string): string {
  return `<span style="color:var(--vscode-editorCodeLens-foreground);">**${label}**</span>\n\n`;
}

/**
 * Renders param/typeParam sections as a formatted table.
 */
function renderParamTableMarkdown(sections: RenderedCommentSection[]): string {
  const parts: string[] = [];
  parts.push('<span style="color:var(--vscode-editorCodeLens-foreground);">**$(symbol-parameter) Parameters**</span>\n\n');
  parts.push('| | |\n|---|---|\n');
  for (const s of sections) {
    const name = s.name || '?';
    const desc = s.lines
      .filter(l => !isBlankLine(l))
      .map(l => l.segments.map(seg => segmentToMarkdownRich(seg)).join(''))
      .join(' ');
    parts.push(`| <span style="color:var(--vscode-katCommentStudio-parameterName);">\`${name}\`</span> | ${desc} |\n`);
  }
  return parts.join('');
}

/**
 * Renders exception sections as a formatted table.
 */
function renderExceptionTableMarkdown(sections: RenderedCommentSection[]): string {
  const parts: string[] = [];
  parts.push('<span style="color:var(--vscode-editorCodeLens-foreground);">**$(warning) Throws**</span>\n\n');
  parts.push('| | |\n|---|---|\n');
  for (const s of sections) {
    const name = s.name || '?';
    const desc = s.lines
      .filter(l => !isBlankLine(l))
      .map(l => l.segments.map(seg => segmentToMarkdownRich(seg)).join(''))
      .join(' ');
    parts.push(`| <span style="color:var(--vscode-katCommentStudio-typeName);">\`${name}\`</span> | ${desc} |\n`);
  }
  return parts.join('');
}

function renderSeeAlsoTableMarkdown(sections: RenderedCommentSection[]): string {
  const parts: string[] = [];
  parts.push('<span style="color:var(--vscode-editorCodeLens-foreground);">**$(references) See Also**</span>\n\n');
  parts.push('| | |\n|---|---|\n');
  for (const s of sections) {
    const name = s.name || '?';
    const link = s.nameLink;
    const desc = s.lines
      .filter(l => !isBlankLine(l))
      .map(l => l.segments.map(seg => segmentToMarkdownRich(seg)).join(''))
      .join(' ')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ');
    // cref entries: code-styled name linked to quick-symbol search
    // href entries: "Visit Url" linked to the URL (plain markdown link)
    const nameCell = link
      ? `<span style="color:var(--vscode-katCommentStudio-typeName);">[${name}](${link})</span>`
      : `<span style="color:var(--vscode-katCommentStudio-typeName);">\`${name}\`</span>`;
    parts.push(`| ${nameCell} | ${desc} |\n`);
  }
  return parts.join('');
}

/**
 * Returns a backtick fence string long enough that the content cannot break out.
 * Finds the longest run of consecutive backticks in the text and adds one more.
 */
function safeFence(text: string): string {
  let max = 0;
  const re = /`+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length > max) max = m[0].length;
  }
  return '`'.repeat(Math.max(3, max + 1));
}

/**
 * Renders section lines to rich markdown, merging consecutive prose lines
 * into paragraphs (blank lines = paragraph break), and merging consecutive
 * code lines into fenced code blocks.
 */
function sectionLinesToMarkdownRich(section: RenderedCommentSection, fenceLang = 'csharp'): string {
  const parts: string[] = [];
  let paragraphTokens: string[] = [];
  let i = 0;
  const lines = section.lines;

  const flushParagraph = () => {
    if (paragraphTokens.length > 0) {
      parts.push(paragraphTokens.join(' ') + '\n\n');
      paragraphTokens = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (isBlankLine(line)) {
      flushParagraph();
      i++;
      continue;
    }

    // Merge consecutive Code-only lines into a fenced code block
    if (line.segments.length === 1 && line.segments[0].type === SegmentType.Code) {
      flushParagraph();
      const codeTexts: string[] = [];
      while (i < lines.length) {
        const cl = lines[i];
        if (cl.segments.length === 1 && cl.segments[0].type === SegmentType.Code) {
          codeTexts.push(cl.segments[0].text);
          i++;
        } else {
          break;
        }
      }
      // 5 trailing spaces on the last code line — JS uses these to locate code fences in KAT hovers.
      codeTexts[codeTexts.length - 1] += '     ';
      const codeBlock = codeTexts.join('\n');
      const fence = safeFence(codeBlock);
      parts.push(`\n${fence}${fenceLang}\n${codeBlock}\n${fence}\n`);
      continue;
    }

    // Normal prose line — accumulate into paragraph buffer
    const lineText = line.segments.map(s => segmentToMarkdownRich(s)).join('');
    paragraphTokens.push(lineText);
    i++;
  }

  flushParagraph();
  return parts.join('');
}

/**
 * Renders example section lines, treating ALL content as a code block
 * when there are code segments present.
 */
function sectionLinesToMarkdownRichExample(section: RenderedCommentSection, fenceLang = 'csharp'): string {
  // Check if section has any code-only lines
  const hasCodeLines = section.lines.some(
    l => l.segments.length === 1 && l.segments[0].type === SegmentType.Code,
  );

  if (!hasCodeLines) {
    return sectionLinesToMarkdownRich(section, fenceLang);
  }

  // Render mixed: text lines as markdown, code lines as fenced block
  return sectionLinesToMarkdownRich(section, fenceLang);
}

/**
 * Converts a segment to rich markdown with color spans where applicable.
 */
function segmentToMarkdownRich(segment: RenderedSegment): string {
  switch (segment.type) {
    case SegmentType.Bold:
    case SegmentType.Heading:
      return `**${segment.text}**`;
    case SegmentType.Italic:
      return `*${segment.text}*`;
    case SegmentType.Code:
      return `\`${segment.text}\``;
    case SegmentType.ParamRef:
      return `<span style="color:var(--vscode-katCommentStudio-parameterName);">\`${segment.text}\`</span>`;
    case SegmentType.TypeParamRef:
    case SegmentType.TypeRef:
      return `<span style="color:var(--vscode-katCommentStudio-typeName);">\`${segment.text}\`</span>`;
    case SegmentType.IssueReference:
      return segment.linkTarget ? `[${segment.text}](${segment.linkTarget})` : segment.text;
    case SegmentType.Link: {
      if (!segment.linkTarget) return segment.text;
      const target = segment.linkTarget;
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        const symbolName = getTypeNameFromCref(target);
        const encoded = encodeURIComponent(JSON.stringify([`#${symbolName}`]));
        return `[${segment.text}](command:workbench.action.quickOpen?${encoded})`;
      }
      return `[${segment.text}](${target})`;
    }
    case SegmentType.Strikethrough:
      return `~~${segment.text}~~`;
    case SegmentType.Text:
    default:
      return colorizeAnchorTagsMarkdown(segment.text);
  }
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
    case SegmentType.TypeRef:
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

function ensureSummarySection(result: RenderedComment, fallbackSummary?: string): void {
  let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
  if (!summary) {
    summary = createSection(CommentSectionType.Summary);
    result.sections.unshift(summary);
  }

  const isEmpty = summary.lines.length === 0 || summary.lines.every(l => isBlankLine(l));
  if (isEmpty) {
    const text = fallbackSummary ?? NO_SUMMARY_PLACEHOLDER;
    summary.lines = [{ segments: [{ text, type: SegmentType.Text }] }];
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

// --- JSDoc/TSDoc Parser ---

interface JsDocEntry {
  tag: string;           // 'desc' for pre-tag text; otherwise lowercase tag name
  type?: string;         // content from {braces}
  name?: string;         // param name (cleaned: no [], no =default)
  optional?: boolean;
  defaultValue?: string;
  descLines: string[];
}

interface ParsedJsDoc {
  entries: JsDocEntry[];
}

/** Extracts a brace-balanced type expression from the start of a string. */
function extractBracedType(s: string): { type: string; rest: string } | undefined {
  if (!s.startsWith('{')) return undefined;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) {
        return { type: s.substring(1, i).trim(), rest: s.substring(i + 1) };
      }
    }
  }
  return undefined; // unmatched brace
}

/** Extracts a parameter name (with optional/rest/dotted forms) from a string. */
function extractParamName(s: string): { name: string; optional: boolean; defaultValue?: string; rest: string } | undefined {
  if (!s) return undefined;

  // Optional form: [name] or [name=default]
  if (s.startsWith('[')) {
    const closeIdx = s.indexOf(']');
    if (closeIdx > 0) {
      const inner = s.substring(1, closeIdx);
      const eqIdx = inner.indexOf('=');
      const name = (eqIdx >= 0 ? inner.substring(0, eqIdx) : inner).trim();
      const defaultValue = eqIdx >= 0 ? inner.substring(eqIdx + 1).trim() : undefined;
      return { name, optional: true, defaultValue, rest: s.substring(closeIdx + 1).trimStart() };
    }
  }

  // Rest param prefix: ...name
  const isRest = s.startsWith('...');
  const nameStr = isRest ? s.substring(3) : s;

  // First word, allowing dots for `options.sub` forms
  const wordMatch = /^([\w.]+)(.*)/.exec(nameStr);
  if (wordMatch) {
    const name = (isRest ? '...' : '') + wordMatch[1];
    return { name, optional: false, rest: wordMatch[2].trimStart() };
  }

  return undefined;
}

const JSDOC_TAG_RE = /^[ \t]*[@\\]([\w]+)(.*)/;

/** Parses JSDoc/TSDoc/Doxygen content into structured entries. */
function parseJsDoc(content: string): ParsedJsDoc {
  const lines = content.split(/\r?\n/);
  const entries: JsDocEntry[] = [];
  let currentEntry: JsDocEntry = { tag: 'desc', descLines: [] };
  entries.push(currentEntry);

  for (const line of lines) {
    const tagMatch = JSDOC_TAG_RE.exec(line);
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase();
      let rest = tagMatch[2].trim();

      // Extract {type} if present
      let type: string | undefined;
      const braceResult = extractBracedType(rest);
      if (braceResult) {
        type = braceResult.type;
        rest = braceResult.rest.trim();
      }

      // Extract name for tags that have one
      let name: string | undefined;
      let optional = false;
      let defaultValue: string | undefined;
      if (['param', 'arg', 'argument', 'typeparam', 'template'].includes(tag)) {
        const nameResult = extractParamName(rest);
        if (nameResult) {
          name = nameResult.name;
          optional = nameResult.optional;
          defaultValue = nameResult.defaultValue;
          rest = nameResult.rest.trimStart();
        }
      }

      // Strip leading " - " or "-" separator before description
      rest = rest.replace(/^-\s*/, '').trim();

      currentEntry = { tag, type, name, optional, defaultValue, descLines: rest ? [rest] : [] };
      entries.push(currentEntry);
    } else {
      currentEntry.descLines.push(line.trim());
    }
  }

  // Trim leading/trailing blank lines from each entry (but preserve blank lines inside @example)
  for (const entry of entries) {
    if (entry.tag !== 'example') {
      while (entry.descLines.length > 0 && !entry.descLines[0]) entry.descLines.shift();
      while (entry.descLines.length > 0 && !entry.descLines[entry.descLines.length - 1]) entry.descLines.pop();
    }
  }

  // Remove the leading desc entry if it ended up empty
  if (entries.length > 0 && entries[0].tag === 'desc' && entries[0].descLines.length === 0) {
    entries.shift();
  }

  return { entries };
}

/** Appends JSDoc description lines to a section as rendered text. */
function appendJsDocTextLines(section: RenderedCommentSection, lines: string[], repoInfo?: GitRepositoryInfo): void {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    if (text) {
      const renderedLine = getOrCreateCurrentLine(section);
      const segments = processMarkdownInText(text, repoInfo);
      for (const seg of segments) {
        renderedLine.segments.push(seg);
      }
    }
    if (i < lines.length - 1) {
      section.lines.push({ segments: [] });
    }
  }
}

/** Prepends a type ref segment followed by the description lines for param/returns entries. */
function buildJsDocDescWithType(section: RenderedCommentSection, entry: JsDocEntry, repoInfo?: GitRepositoryInfo): void {
  if (entry.type) {
    const line = getOrCreateCurrentLine(section);
    line.segments.push({ text: entry.type, type: SegmentType.TypeRef });
    if (entry.descLines.length > 0 && entry.descLines[0]) {
      line.segments.push({ text: ' — ', type: SegmentType.Text });
      const segments = processMarkdownInText(entry.descLines[0], repoInfo);
      for (const seg of segments) line.segments.push(seg);
      section.lines.push({ segments: [] });
      appendJsDocTextLines(section, entry.descLines.slice(1), repoInfo);
    }
  } else {
    appendJsDocTextLines(section, entry.descLines, repoInfo);
  }
}

/** Renders JSDoc/TSDoc content into a RenderedComment. */
function renderJsDocContent(
  content: string,
  repoInfo?: GitRepositoryInfo,
  languageId?: string,
  indentation = '',
  fallbackSummary?: string,
): RenderedComment {
  const result: RenderedComment = { lines: [], indentation, sections: [] };
  const parsed = parseJsDoc(content);

  for (const entry of parsed.entries) {
    switch (entry.tag) {
      case 'desc':
      case 'description':
      case 'summary': {
        let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
        if (!summary) {
          summary = createSection(CommentSectionType.Summary);
          result.sections.push(summary);
        }
        appendJsDocTextLines(summary, entry.descLines, repoInfo);
        break;
      }

      case 'brief': {
        // Doxygen: use as summary only if no free-text description already added
        const hasSummary = result.sections.some(
          s => s.type === CommentSectionType.Summary && s.lines.length > 0 && !s.lines.every(l => isBlankLine(l)),
        );
        if (!hasSummary) {
          let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
          if (!summary) {
            summary = createSection(CommentSectionType.Summary);
            result.sections.push(summary);
          }
          const briefLines = entry.type ? [`{${entry.type}}`, ...entry.descLines] : entry.descLines;
          appendJsDocTextLines(summary, briefLines, repoInfo);
        }
        break;
      }

      case 'param':
      case 'arg':
      case 'argument': {
        const section = createSection(CommentSectionType.Param, undefined, entry.name || '?');
        buildJsDocDescWithType(section, entry, repoInfo);
        result.sections.push(section);
        break;
      }

      case 'returns':
      case 'return': {
        const section = createSection(CommentSectionType.Returns);
        buildJsDocDescWithType(section, entry, repoInfo);
        result.sections.push(section);
        break;
      }

      case 'throws':
      case 'throw':
      case 'exception': {
        const exceptionName = entry.type || entry.name || '?';
        const section = createSection(CommentSectionType.Exception, undefined, exceptionName);
        appendJsDocTextLines(section, entry.descLines, repoInfo);
        result.sections.push(section);
        break;
      }

      case 'example': {
        const section = createSection(CommentSectionType.Example);
        for (const line of entry.descLines) {
          section.lines.push({ segments: [{ text: line, type: SegmentType.Code }] });
        }
        result.sections.push(section);
        break;
      }

      case 'remarks':
      case 'note': {
        const section = createSection(CommentSectionType.Remarks);
        appendJsDocTextLines(section, entry.descLines, repoInfo);
        result.sections.push(section);
        break;
      }

      case 'see':
      case 'seealso': {
        const section = createSection(CommentSectionType.SeeAlso);
        const parts = [
          ...(entry.type ? [entry.type] : []),
          ...entry.descLines,
        ].filter(Boolean);
        if (parts.length > 0) {
          section.lines.push({ segments: [{ text: parts.join(' '), type: SegmentType.Text }] });
        }
        result.sections.push(section);
        break;
      }

      case 'type': {
        // Prepend type annotation to summary
        let summary = result.sections.find(s => s.type === CommentSectionType.Summary);
        if (!summary) {
          summary = createSection(CommentSectionType.Summary);
          result.sections.unshift(summary);
        }
        if (entry.type) {
          summary.lines.unshift({ segments: [{ text: entry.type, type: SegmentType.TypeRef }] });
        }
        break;
      }

      case 'deprecated': {
        const section = createSection(CommentSectionType.Other, '⚠️ Deprecated');
        appendJsDocTextLines(section, entry.descLines, repoInfo);
        result.sections.push(section);
        break;
      }

      case 'typeparam':
      case 'template': {
        const tpName = entry.name || entry.type || '?';
        const section = createSection(CommentSectionType.TypeParam, undefined, tpName);
        appendJsDocTextLines(section, entry.descLines, repoInfo);
        result.sections.push(section);
        break;
      }

      default: {
        // Unknown tag — render as Other with @tagname heading
        const section = createSection(CommentSectionType.Other, `@${entry.tag}`);
        const allLines = [
          ...(entry.type ? [`{${entry.type}}`] : []),
          ...(entry.name ? [entry.name] : []),
          ...entry.descLines,
        ].filter(Boolean);
        appendJsDocTextLines(section, allLines, repoInfo);
        result.sections.push(section);
        break;
      }
    }
  }

  ensureSummarySection(result, fallbackSummary);
  populateLinesFromSections(result);
  return result;
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
    case 'permission': {
      const permissionCref = getAttr(node, 'cref');
      const section = createSection(CommentSectionType.Other, '$(lock) Permission');
      if (permissionCref) {
        const permName = getTypeNameFromCref(permissionCref);
        getOrCreateCurrentLine(section).segments.push({ text: permName, type: SegmentType.TypeRef });
        section.lines.push({ segments: [] });
      }
      renderChildNodes(node, section, repoInfo);
      result.sections.push(section);
      break;
    }
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
  const cref = getAttr(element, 'cref');
  const href = getAttr(element, 'href');
  const innerText = extractText(element.children).trim();

  let name: string;
  let nameLink: string | undefined;
  const descriptionText = innerText;

  if (cref) {
    name = getTypeNameFromCref(cref);
    // command URI to open VS Code quick symbol search pre-populated with #TypeName
    nameLink = `command:workbench.action.quickOpen?${encodeURIComponent(JSON.stringify(['#' + name]))}`;
  } else if (href) {
    // Only allow http/https schemes — prevents command: injection via isTrusted MarkdownString
    if (!href.startsWith('http://') && !href.startsWith('https://')) return;
    name = 'Visit Url';
    nameLink = href;
  } else {
    return;
  }

  const section = createSection(CommentSectionType.SeeAlso);
  section.name = name;
  section.nameLink = nameLink;
  if (descriptionText) {
    section.lines.push({ segments: [{ text: descriptionText, type: SegmentType.Text }] });
  }
  result.sections.push(section);
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
    case 'paramref': {
      const name = getAttr(node, 'name');
      if (name) {
        getOrCreateCurrentLine(section).segments.push({ text: name, type: SegmentType.ParamRef });
      }
      break;
    }
    case 'typeparamref': {
      const name = getAttr(node, 'name');
      if (name) {
        getOrCreateCurrentLine(section).segments.push({ text: name, type: SegmentType.TypeParamRef });
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
    case 'br':
      section.lines.push({ segments: [] });
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
    segmentType = cref.startsWith('T:') ? SegmentType.TypeRef : SegmentType.Code;
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
  const rawLines = codeContent.split(/\r?\n/);
  let start = 0;
  let end = rawLines.length - 1;
  while (start <= end && !rawLines[start].trim()) start++;
  while (end >= start && !rawLines[end].trim()) end--;
  const codeLines = rawLines.slice(start, end + 1);

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
 * Extracts plain text from the first meaningful paragraph of a summary element.
 * Logic: if there is non-whitespace text before the first <para> child, return that.
 * Otherwise return the text content of the first <para> child only.
 * Falls back to full extractPlainText if no <para> elements exist.
 */
function extractFirstParagraphText(element: XmlElement): string {
  const preParaParts: string[] = [];
  let firstParaElement: XmlElement | undefined;

  for (const child of element.children) {
    if (isText(child)) {
      preParaParts.push(child.text);
    } else if (isElement(child)) {
      if (child.tagName.toLowerCase() === 'para') {
        firstParaElement = child;
        break;
      }
      // Non-para element before first para — include its text
      preParaParts.push(extractPlainText(child));
    }
  }

  if (!firstParaElement) {
    // No <para> elements — return full text
    return extractPlainText(element);
  }

  const preParaText = preParaParts.join('').trim();
  if (preParaText) {
    return preParaText;
  }

  return extractPlainText(firstParaElement).trim();
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
