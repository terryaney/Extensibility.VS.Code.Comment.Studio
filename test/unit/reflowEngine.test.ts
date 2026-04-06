import { describe, it, expect } from 'vitest';
import { reflowXmlContent } from '../../src/reflow/reflowEngine';
import { LanguageCommentStyle } from '../../src/types';

const csharpStyle: LanguageCommentStyle = {
  languageId: 'csharp',
  singleLineDocPrefix: '///',
  supportsMultiLineDoc: true,
  multiLineDocStart: '/**',
  multiLineDocEnd: '*/',
  multiLineContinuation: '*',
};

describe('reflowXmlContent', () => {
  it('should wrap long text to fit within max width', () => {
    const lines = [
      '<summary>',
      'This is a very long line that should be wrapped because it exceeds the maximum line width that we have configured for this test case.',
      '</summary>',
    ];

    const result = reflowXmlContent(lines, 50, '    ', csharpStyle);
    expect(result[0]).toBe('<summary>');
    expect(result[result.length - 1]).toBe('</summary>');
    // All content lines should be within effective width
    const contentLines = result.slice(1, -1);
    for (const line of contentLines) {
      expect(line.length).toBeLessThanOrEqual(42); // 50 - "    /// ".length
    }
  });

  it('should preserve code blocks as-is', () => {
    const lines = [
      '<summary>Short summary.</summary>',
      '<code>',
      '  var x = 1;',
      '  var y = 2;',
      '</code>',
    ];

    const result = reflowXmlContent(lines, 50, '', csharpStyle);
    expect(result).toContain('  var x = 1;');
    expect(result).toContain('  var y = 2;');
  });

  it('should preserve empty lines as paragraph breaks', () => {
    const lines = [
      '<summary>',
      'First paragraph.',
      '',
      'Second paragraph.',
      '</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result).toContain('');
  });

  it('should handle self-closing tags', () => {
    const lines = [
      '<inheritdoc/>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result).toEqual(['<inheritdoc/>']);
  });

  it('should always expand single-line summary to multi-line form', () => {
    const lines = [
      '<summary>Short.</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('<summary>');
    expect(result[1]).toBe('Short.');
    expect(result[2]).toBe('</summary>');
  });

  it('should keep single-line remarks on one line when short', () => {
    const lines = [
      '<remarks>Brief note.</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('<remarks>Brief note.</remarks>');
  });

  it('should handle param tags', () => {
    const lines = [
      '<param name="value">The value to process which has a very long description that should be wrapped.</param>',
    ];

    const result = reflowXmlContent(lines, 50, '    ', csharpStyle);
    expect(result.length).toBeGreaterThan(1);
  });

  it('<para> always starts on its own line after preceding content', () => {
    const lines = [
      '<remarks>',
      'Intro text.',
      '<para>First paragraph content.</para>',
      '</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    // <para> may be single-line (<para>content</para>) or expanded; find whichever form
    const paraIdx = result.findIndex(l => l === '<para>' || l.startsWith('<para>'));
    expect(paraIdx).toBeGreaterThan(0);
    // The entry immediately before <para> must be empty (blank separator)
    expect(result[paraIdx - 1]).toBe('');
  });

  it('blank line between opening block tag and next block tag is removed (open-open pattern)', () => {
    // Bug: blank line after <remarks> (open) before <para> (open) was preserved.
    const lines = [
      '<remarks>',
      '',
      '<para>Content.</para>',
      '</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    const remarksIdx = result.indexOf('<remarks>');
    const paraIdx = result.findIndex(l => l.startsWith('<para>'));
    expect(remarksIdx).toBeGreaterThan(-1);
    expect(paraIdx).toBeGreaterThan(remarksIdx);
    // No blank line between <remarks> and <para>
    expect(result[paraIdx - 1]).not.toBe('');
    expect(result[remarksIdx + 1]).not.toBe('');
  });

  it('<para> follows immediately after </para> with no blank line between them', () => {
    // Both <para> blocks use standalone tags (tag alone on its own line).
    const lines = [
      '<remarks>',
      '<para>',
      'First.',
      '</para>',
      '<para>',
      'Second.',
      '</para>',
      '</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    const firstClose = result.indexOf('</para>');
    const secondOpen = result.indexOf('<para>', firstClose + 1);
    expect(firstClose).toBeGreaterThan(-1);
    expect(secondOpen).toBeGreaterThan(firstClose);
    // No blank line between </para> and <para>
    expect(result[secondOpen - 1]).not.toBe('');
    expect(result[secondOpen - 1]).toBe('</para>');
  });

  it('inline </para> <para> on same line is split and reflowed correctly', () => {
    // The original bug: multiple <para> elements concatenated on a single line
    // caused runaway content duplication.
    const lines = [
      '<summary>',
      '<para>First paragraph.</para> <para>Second paragraph.</para>',
      '</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result[0]).toBe('<summary>');
    expect(result[result.length - 1]).toBe('</summary>');
    // Both paragraphs must appear exactly once
    const allText = result.join('\n');
    const firstCount = (allText.match(/First paragraph/g) ?? []).length;
    const secondCount = (allText.match(/Second paragraph/g) ?? []).length;
    expect(firstCount).toBe(1);
    expect(secondCount).toBe(1);
    // No blank line between the two <para> elements
    const firstParaIdx = result.findIndex(l => l.includes('First paragraph'));
    const secondParaIdx = result.findIndex(l => l.includes('Second paragraph'));
    expect(secondParaIdx).toBe(firstParaIdx + 1);
  });

  it('<summary><para> inline open-open is split so <para> blocks reflow correctly', () => {
    // Bug: <summary><para>content</para><para>more</para> caused all content to be
    // collected as flat text and joined, producing </para> <para> on the same wrapped line.
    const lines = [
      '<summary><para>First paragraph text.</para>',
      '<para>Second paragraph text.</para>',
      '</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result[0]).toBe('<summary>');
    expect(result[result.length - 1]).toBe('</summary>');
    const allText = result.join('\n');
    // Both paragraphs must appear exactly once
    expect((allText.match(/First paragraph/g) ?? []).length).toBe(1);
    expect((allText.match(/Second paragraph/g) ?? []).length).toBe(1);
    // </para> <para> must NOT appear on the same line (close-then-open is the broken pattern)
    expect(result.every(line => !/<\/para>.*<para>/.test(line))).toBe(true);
  });

  it('blank line inside standalone open block is suppressed before nested block tag', () => {
    // Bug: blank line after <remarks> (inner content loop) before <para> was not suppressed
    // — the inner loop pushed '' before it detected the nestedBlockOpen.
    const lines = [
      '<remarks>',
      '',
      '',
      '<para>Content here.</para>',
      '</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    const remarksIdx = result.indexOf('<remarks>');
    const paraIdx = result.findIndex(l => l.startsWith('<para>'));
    expect(remarksIdx).toBeGreaterThan(-1);
    expect(paraIdx).toBeGreaterThan(remarksIdx);
    // No blank lines between <remarks> and <para>
    for (let idx = remarksIdx + 1; idx < paraIdx; idx++) {
      expect(result[idx]).not.toBe('');
    }
  });

  it('inline-opened <para> wrapping to multiple lines keeps closing tag on last content line', () => {
    const lines = [
      '<remarks>',
      '<para>This is a long paragraph that will need to be wrapped across multiple lines when the max width is small enough to force it.</para>',
      '</remarks>',
    ];

    const result = reflowXmlContent(lines, 40, '', csharpStyle);
    // No standalone </para> on its own line — it should be appended to last content line
    expect(result).not.toContain('</para>');
    expect(result.some(l => l.endsWith('</para>'))).toBe(true);
    // Opening tag must carry the first content word
    expect(result.some(l => l.startsWith('<para>'))).toBe(true);
  });

  it('plain-text loop stops when inline block-level open tag is encountered', () => {
    // <para> appears inline (with content) mid-block — it should not be swallowed as plain text
    const lines = [
      '<summary>',
      'Before text.',
      '<para>Inside paragraph content.</para>',
      '</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    // <para> tag must appear in result as a separate structural element
    expect(result.some(l => l === '<para>' || l.startsWith('<para>'))).toBe(true);
    // 'Before text.' must appear before <para>
    const beforeIdx = result.findIndex(l => l.includes('Before text.'));
    const paraIdx = result.findIndex(l => l === '<para>' || l.startsWith('<para>'));
    expect(beforeIdx).toBeLessThan(paraIdx);
  });
});
