import { describe, it, expect } from 'vitest';
import { processMarkdownInText } from '../../src/rendering/markdownProcessor';
import { SegmentType, GitRepositoryInfo, GitHostingProvider } from '../../src/types';

describe('processMarkdownInText', () => {
  // --- Bold Tests ---
  describe('bold', () => {
    it('should create bold segment with double asterisk', () => {
      const segments = processMarkdownInText('This is **bold** text');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'This is ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'bold', type: SegmentType.Bold });
      expect(segments[2]).toEqual({ text: ' text', type: SegmentType.Text });
    });

    it('should create bold segment with double underscore', () => {
      const segments = processMarkdownInText('This is __bold__ text');
      expect(segments).toHaveLength(3);
      expect(segments[1]).toEqual({ text: 'bold', type: SegmentType.Bold });
    });

    it('should handle bold at start', () => {
      const segments = processMarkdownInText('**bold** at start');
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ text: 'bold', type: SegmentType.Bold });
      expect(segments[1]).toEqual({ text: ' at start', type: SegmentType.Text });
    });

    it('should handle bold at end', () => {
      const segments = processMarkdownInText('ends with **bold**');
      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({ text: 'ends with ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'bold', type: SegmentType.Bold });
    });

    it('should handle only bold', () => {
      const segments = processMarkdownInText('**bold**');
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ text: 'bold', type: SegmentType.Bold });
    });

    it('should handle bold with multi-word content', () => {
      const segments = processMarkdownInText('Text with **bold text** here');
      const boldSegment = segments.find(s => s.type === SegmentType.Bold);
      expect(boldSegment).toBeDefined();
      expect(boldSegment!.text).toBe('bold text');
    });
  });

  // --- Italic Tests ---
  describe('italic', () => {
    it('should create italic segment with single asterisk', () => {
      const segments = processMarkdownInText('This is *italic* text');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'This is ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'italic', type: SegmentType.Italic });
      expect(segments[2]).toEqual({ text: ' text', type: SegmentType.Text });
    });

    it('should find italic in sentence', () => {
      const segments = processMarkdownInText('Represents a user with *basic* contact information.');
      const italicSegment = segments.find(s => s.type === SegmentType.Italic);
      expect(italicSegment).toBeDefined();
      expect(italicSegment!.text).toBe('basic');
    });

    it('should create italic with surrounding context', () => {
      const segments = processMarkdownInText('with *basic* contact');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'with ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'basic', type: SegmentType.Italic });
      expect(segments[2]).toEqual({ text: ' contact', type: SegmentType.Text });
    });

    it('should create italic segment with single underscore', () => {
      const segments = processMarkdownInText('This is _italic_ text');
      expect(segments).toHaveLength(3);
      expect(segments[1]).toEqual({ text: 'italic', type: SegmentType.Italic });
    });
  });

  // --- Code Tests ---
  describe('code', () => {
    it('should create code segment', () => {
      const segments = processMarkdownInText('Use the `GetValue` method');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'Use the ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'GetValue', type: SegmentType.Code });
      expect(segments[2]).toEqual({ text: ' method', type: SegmentType.Text });
    });

    it('should give code precedence over bold', () => {
      const segments = processMarkdownInText('Use `**not bold**` for emphasis');
      const codeSegment = segments.find(s => s.type === SegmentType.Code);
      expect(codeSegment).toBeDefined();
      expect(codeSegment!.text).toBe('**not bold**');
      const boldSegment = segments.find(s => s.type === SegmentType.Bold);
      expect(boldSegment).toBeUndefined();
    });
  });

  // --- Strikethrough Tests ---
  describe('strikethrough', () => {
    it('should create strikethrough segment', () => {
      const segments = processMarkdownInText('This is ~~removed~~ text');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'This is ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'removed', type: SegmentType.Strikethrough });
      expect(segments[2]).toEqual({ text: ' text', type: SegmentType.Text });
    });
  });

  // --- Multiple Formats Tests ---
  describe('multiple formats', () => {
    it('should handle multiple formats correctly', () => {
      const segments = processMarkdownInText('This is **bold** and *italic* and `code`');
      expect(segments.find(s => s.type === SegmentType.Bold && s.text === 'bold')).toBeDefined();
      expect(segments.find(s => s.type === SegmentType.Italic && s.text === 'italic')).toBeDefined();
      expect(segments.find(s => s.type === SegmentType.Code && s.text === 'code')).toBeDefined();
    });
  });

  // --- Plain Text Tests ---
  describe('plain text', () => {
    it('should create single text segment for plain text', () => {
      const segments = processMarkdownInText('This is plain text');
      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual({ text: 'This is plain text', type: SegmentType.Text });
    });

    it('should return empty array for empty string', () => {
      const segments = processMarkdownInText('');
      expect(segments).toHaveLength(0);
    });

    it('should return empty array for null/undefined', () => {
      const segments = processMarkdownInText(null as any);
      expect(segments).toHaveLength(0);
    });
  });

  // --- Link Tests ---
  describe('links', () => {
    it('should create link segment from markdown link', () => {
      const segments = processMarkdownInText('See the [API docs](https://example.com/api) for details');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'See the ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'API docs', type: SegmentType.Link, linkTarget: 'https://example.com/api' });
      expect(segments[2]).toEqual({ text: ' for details', type: SegmentType.Text });
    });

    it('should create link segment from auto-link', () => {
      const segments = processMarkdownInText('Visit <https://example.com> for more info');
      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({ text: 'Visit ', type: SegmentType.Text });
      expect(segments[1]).toEqual({ text: 'https://example.com', type: SegmentType.Link, linkTarget: 'https://example.com' });
      expect(segments[2]).toEqual({ text: ' for more info', type: SegmentType.Text });
    });
  });

  // --- Issue Reference Tests ---
  describe('issue references', () => {
    const githubRepo: GitRepositoryInfo = {
      provider: GitHostingProvider.GitHub,
      owner: 'testowner',
      repository: 'testrepo',
      baseUrl: 'https://github.com',
    };

    it('should treat as plain text without repo info', () => {
      const segments = processMarkdownInText('See issue #123 for details');
      expect(segments.every(s => s.type === SegmentType.Text)).toBe(true);
      const joined = segments.map(s => s.text).join('');
      expect(joined).toContain('#123');
    });

    it('should create issue reference with repo info', () => {
      const segments = processMarkdownInText('See issue #123 for details', githubRepo);
      const issueSegment = segments.find(s => s.type === SegmentType.IssueReference);
      expect(issueSegment).toBeDefined();
      expect(issueSegment!.text).toBe('#123');
      expect(issueSegment!.linkTarget).toBe('https://github.com/testowner/testrepo/issues/123');
    });

    it('should handle issue ref at start of text', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText('#42 is the issue', repoInfo);
      const issueSegment = segments.find(s => s.type === SegmentType.IssueReference);
      expect(issueSegment).toBeDefined();
      expect(issueSegment!.text).toBe('#42');
    });

    it('should handle issue ref after parenthesis', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText('Fixed bug (#99)', repoInfo);
      const issueSegment = segments.find(s => s.type === SegmentType.IssueReference);
      expect(issueSegment).toBeDefined();
      expect(issueSegment!.text).toBe('#99');
    });

    it('should handle multiple issue references', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText('See #10 and #20', repoInfo);
      const issueSegments = segments.filter(s => s.type === SegmentType.IssueReference);
      expect(issueSegments).toHaveLength(2);
      expect(issueSegments[0].text).toBe('#10');
      expect(issueSegments[1].text).toBe('#20');
    });

    it('should handle both markdown and issue references', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText('Fix for **bug** #123', repoInfo);
      expect(segments.some(s => s.type === SegmentType.Bold)).toBe(true);
      expect(segments.some(s => s.type === SegmentType.IssueReference)).toBe(true);
    });

    it('should not treat hashtag in code as issue reference', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText('Use `#123` in code', repoInfo);
      expect(segments.some(s => s.type === SegmentType.IssueReference && s.text === '#123')).toBe(false);
    });

    it('should create distinct segment types for issue, link, and code', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const segments = processMarkdownInText(
        'Track #42 in [docs](https://example.com) with `#literal`',
        repoInfo
      );
      expect(segments.some(s => s.type === SegmentType.IssueReference && s.text === '#42')).toBe(true);
      expect(segments.some(s => s.type === SegmentType.Link && s.linkTarget === 'https://example.com')).toBe(true);
      expect(segments.some(s => s.type === SegmentType.Code && s.text === '#literal')).toBe(true);
    });
  });
});
