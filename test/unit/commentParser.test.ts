import { describe, it, expect } from 'vitest';
import { findAllCommentBlocks, isValidDocCommentStart } from '../../src/parsing/commentParser';
import { LanguageCommentStyle } from '../../src/types';

const csharpStyle: LanguageCommentStyle = {
  languageId: 'csharp',
  singleLineDocPrefix: '///',
  supportsMultiLineDoc: true,
  multiLineDocStart: '/**',
  multiLineDocEnd: '*/',
  multiLineContinuation: '*',
};

const vbStyle: LanguageCommentStyle = {
  languageId: 'vb',
  singleLineDocPrefix: "'''",
  supportsMultiLineDoc: false,
};

describe('isValidDocCommentStart', () => {
  it('should accept valid triple-slash comment', () => {
    expect(isValidDocCommentStart('/// <summary>', '///')).toBe(true);
  });

  it('should reject four-slash comment', () => {
    expect(isValidDocCommentStart('//// commented out', '///')).toBe(false);
  });

  it('should accept VB triple-apostrophe', () => {
    expect(isValidDocCommentStart("''' <summary>", "'''")).toBe(true);
  });

  it('should reject VB four-apostrophe', () => {
    expect(isValidDocCommentStart("'''' commented out", "'''")).toBe(false);
  });

  it('should accept prefix with space after', () => {
    expect(isValidDocCommentStart('/// text', '///')).toBe(true);
  });

  it('should accept prefix alone', () => {
    expect(isValidDocCommentStart('///', '///')).toBe(true);
  });
});

describe('findAllCommentBlocks', () => {
  it('should find single-line doc comment block', () => {
    const lines = [
      '/// <summary>',
      '/// Gets the value.',
      '/// </summary>',
      'public int Value { get; }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(2);
    expect(blocks[0].xmlContent).toContain('<summary>');
    expect(blocks[0].xmlContent).toContain('Gets the value.');
    expect(blocks[0].isMultiLineStyle).toBe(false);
  });

  it('should find multiline doc comment block', () => {
    const lines = [
      '/**',
      ' * <summary>',
      ' * Gets the value.',
      ' * </summary>',
      ' */',
      'public int Value { get; }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(4);
    expect(blocks[0].xmlContent).toContain('<summary>');
    expect(blocks[0].isMultiLineStyle).toBe(true);
  });

  it('should find single-line multiline comment', () => {
    const lines = [
      '/** <summary>Gets the value.</summary> */',
      'public int Value { get; }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(0);
    expect(blocks[0].xmlContent).toContain('<summary>');
    expect(blocks[0].isMultiLineStyle).toBe(true);
  });

  it('should find multiple comment blocks', () => {
    const lines = [
      '/// <summary>First method.</summary>',
      'public void First() { }',
      '',
      '/// <summary>Second method.</summary>',
      'public void Second() { }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(2);
  });

  it('should skip regular comments with four slashes', () => {
    const lines = [
      '//// This is not a doc comment',
      '/// <summary>This is a doc comment.</summary>',
      'public void Method() { }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(1);
  });

  it('should handle indented comments', () => {
    const lines = [
      '    /// <summary>',
      '    /// Indented comment.',
      '    /// </summary>',
      '    public void Method() { }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].indentation).toBe('    ');
  });

  it('should handle VB doc comments', () => {
    const lines = [
      "''' <summary>",
      "''' Gets the value.",
      "''' </summary>",
      'Public ReadOnly Property Value As Integer',
    ];

    const blocks = findAllCommentBlocks(lines, vbStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].xmlContent).toContain('Gets the value.');
  });

  it('should strip leading space after prefix', () => {
    const lines = [
      '/// <summary>',
      '/// Hello world.',
      '/// </summary>',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    // Content should have the space after /// removed
    expect(blocks[0].xmlContent).toBe('<summary>\nHello world.\n</summary>');
  });

  it('should return empty array for file with no doc comments', () => {
    const lines = [
      '// Regular comment',
      'public class Foo { }',
      '/* Block comment */',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(0);
  });
});
