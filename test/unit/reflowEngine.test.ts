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

  it('should handle single-line summary', () => {
    const lines = [
      '<summary>Short.</summary>',
    ];

    const result = reflowXmlContent(lines, 80, '', csharpStyle);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Short.');
  });

  it('should handle param tags', () => {
    const lines = [
      '<param name="value">The value to process which has a very long description that should be wrapped.</param>',
    ];

    const result = reflowXmlContent(lines, 50, '    ', csharpStyle);
    expect(result.length).toBeGreaterThan(1);
  });
});
