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

  it('should always expand single-line remarks to multi-line form', () => {
    const lines = [
      '<remarks>Brief note.</remarks>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result[0]).toBe('<remarks>');
    expect(result[result.length - 1]).toBe('</remarks>');
    expect(result.length).toBe(3);
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

  it('<para> always starts on its own line after </para>', () => {
    // Both <para> blocks use standalone tags (tag alone on its own line).
    // This matches the Issue 3 scenario: two consecutive <para> blocks separated
    // only by their tags, with no blank lines in the source.
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
    // There should be a blank line between </para> and <para>
    expect(result[secondOpen - 1]).toBe('');
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
