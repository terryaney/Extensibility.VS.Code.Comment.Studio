import { RenderedSegment, SegmentType, GitRepositoryInfo, getIssueUrl } from '../types';

// Regex patterns matching the C# source
const MARKDOWN_CODE_REGEX = /`([^`]+)`/g;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
const MARKDOWN_AUTO_LINK_REGEX = /<(https?:\/\/[^>]+)>/g;
const MARKDOWN_BOLD_REGEX = /(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g;
const MARKDOWN_ITALIC_REGEX = /(?<!\*)\*(?!\*)(\S(?:[^*]*\S)?)\*(?!\*)|(?<!_)_(?!_)(\S(?:[^_]*\S)?)_(?!_)/g;
const MARKDOWN_STRIKETHROUGH_REGEX = /~~(\S(?:[^~]*\S)?)~~/g;
const ISSUE_REFERENCE_REGEX = /(?<=^|[\s(\[{])#(?<number>\d+)\b/g;

interface MatchInfo {
  start: number;
  length: number;
  content: string;
  type: SegmentType;
  linkTarget?: string;
}

function overlapsWithExisting(existing: MatchInfo[], start: number, length: number): boolean {
  const end = start + length;
  for (const match of existing) {
    const matchEnd = match.start + match.length;
    if (start < matchEnd && end > match.start) {
      return true;
    }
  }
  return false;
}

function collectMatches(regex: RegExp, text: string, type: SegmentType, existing: MatchInfo[], getContent: (match: RegExpExecArray) => { content: string; linkTarget?: string }): void {
  regex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (!overlapsWithExisting(existing, match.index, match[0].length)) {
      const { content, linkTarget } = getContent(match);
      existing.push({ start: match.index, length: match[0].length, content, type, linkTarget });
    }
  }
}

/**
 * Processes markdown patterns in text and returns a list of segments.
 * Supports **bold**, __bold__, *italic*, _italic_, `code`, ~~strikethrough~~,
 * [text](url), <url>, and #123 issue refs.
 * 
 * Code spans and links take precedence over other formatting.
 * Issue references are only resolved when repoInfo is provided.
 */
export function processMarkdownInText(text: string, repoInfo?: GitRepositoryInfo): RenderedSegment[] {
  if (!text) return [];

  const allMatches: MatchInfo[] = [];

  // Code first (highest priority)
  collectMatches(MARKDOWN_CODE_REGEX, text, SegmentType.Code, allMatches, m => ({ content: m[1] }));

  // Links
  collectMatches(MARKDOWN_LINK_REGEX, text, SegmentType.Link, allMatches, m => ({ content: m[1], linkTarget: m[2] }));

  // Auto-links
  collectMatches(MARKDOWN_AUTO_LINK_REGEX, text, SegmentType.Link, allMatches, m => ({ content: m[1], linkTarget: m[1] }));

  // Bold
  collectMatches(MARKDOWN_BOLD_REGEX, text, SegmentType.Bold, allMatches, m => ({ content: m[2] }));

  // Italic
  collectMatches(MARKDOWN_ITALIC_REGEX, text, SegmentType.Italic, allMatches, m => ({
    content: m[1] || m[2],
  }));

  // Strikethrough
  collectMatches(MARKDOWN_STRIKETHROUGH_REGEX, text, SegmentType.Strikethrough, allMatches, m => ({ content: m[1] }));

  // Issue references (only with repo info)
  if (repoInfo) {
    ISSUE_REFERENCE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ISSUE_REFERENCE_REGEX.exec(text)) !== null) {
      if (!overlapsWithExisting(allMatches, match.index, match[0].length)) {
        const issueNumber = parseInt(match.groups!.number, 10);
        const url = getIssueUrl(repoInfo, issueNumber);
        if (url) {
          allMatches.push({
            start: match.index,
            length: match[0].length,
            content: match[0],
            type: SegmentType.IssueReference,
            linkTarget: url,
          });
        }
      }
    }
  }

  // Sort by position
  allMatches.sort((a, b) => a.start - b.start);

  // Build segments
  const segments: RenderedSegment[] = [];
  let currentPos = 0;

  for (const m of allMatches) {
    if (m.start > currentPos) {
      const beforeText = text.substring(currentPos, m.start);
      if (beforeText) {
        segments.push({ text: beforeText, type: SegmentType.Text });
      }
    }
    segments.push({ text: m.content, type: m.type, linkTarget: m.linkTarget });
    currentPos = m.start + m.length;
  }

  if (currentPos < text.length) {
    const remaining = text.substring(currentPos);
    if (remaining) {
      segments.push({ text: remaining, type: SegmentType.Text });
    }
  }

  if (segments.length === 0) {
    segments.push({ text, type: SegmentType.Text });
  }

  return segments;
}
