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

  it('should bridge a single blank line between /// chunks', () => {
    const lines = [
      '/// <summary>',
      '/// First chunk.',
      '',
      '/// Second chunk.',
      '/// </summary>',
      'public void Method() { }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].endLine).toBe(4);
    expect(blocks[0].xmlContent).toContain('First chunk.');
    expect(blocks[0].xmlContent).toContain('Second chunk.');
  });

  it('should bridge multiple consecutive blank lines between /// chunks', () => {
    const lines = [
      '/// <summary>',
      '',
      '',
      '/// Gets the value.',
      '/// </summary>',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].endLine).toBe(4);
  });

  it('should NOT bridge a blank line when only code follows', () => {
    const lines = [
      '/// <summary>First.</summary>',
      '',
      'public void Method() { }',
    ];

    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].endLine).toBe(0);
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

const typescriptStyle: LanguageCommentStyle = {
  languageId: 'typescript',
  supportsMultiLineDoc: true,
  multiLineDocStart: '/**',
  multiLineDocEnd: '*/',
  multiLineContinuation: '*',
};

const javascriptStyle: LanguageCommentStyle = {
  languageId: 'javascript',
  supportsMultiLineDoc: true,
  multiLineDocStart: '/**',
  multiLineDocEnd: '*/',
  multiLineContinuation: '*',
};

describe('JSDoc language configs (no /// prefix)', () => {
  it('should NOT parse /// triple-slash lines as TypeScript doc comment', () => {
    const lines = [
      '/// <reference path="./types.d.ts" />',
      'export function foo() {}',
    ];
    const blocks = findAllCommentBlocks(lines, typescriptStyle);
    expect(blocks).toHaveLength(0);
  });

  it('should NOT parse /// triple-slash lines as JavaScript doc comment', () => {
    const lines = [
      '/// Some comment',
      'function bar() {}',
    ];
    const blocks = findAllCommentBlocks(lines, javascriptStyle);
    expect(blocks).toHaveLength(0);
  });

  it('should parse /** ... */ block as TypeScript doc comment', () => {
    const lines = [
      '/**',
      ' * Does a thing.',
      ' * @param {string} name - The name.',
      ' */',
      'export function doThing(name: string) {}',
    ];
    const blocks = findAllCommentBlocks(lines, typescriptStyle);
    expect(blocks).toHaveLength(1);
  });

  it('should attach languageId to TypeScript comment block', () => {
    const lines = [
      '/**',
      ' * Does a thing.',
      ' */',
      'export function doThing() {}',
    ];
    const blocks = findAllCommentBlocks(lines, typescriptStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].languageId).toBe('typescript');
  });

  it('should attach languageId to JavaScript comment block', () => {
    const lines = [
      '/**',
      ' * Does a thing.',
      ' */',
      'function doThing() {}',
    ];
    const blocks = findAllCommentBlocks(lines, javascriptStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].languageId).toBe('javascript');
  });
});

import { extractMemberName, extractMemberNameFromLines } from '../../src/parsing/commentParser';

describe('extractMemberName', () => {
  describe('JavaScript/TypeScript', () => {
    it('extracts name from let declaration', () => {
      expect(extractMemberName('let currentNexgenNavTarget = undefined;', 'javascript')).toBe('currentNexgenNavTarget');
    });

    it('extracts name from const declaration', () => {
      expect(extractMemberName('const MY_CONST = 42;', 'typescript')).toBe('MY_CONST');
    });

    it('extracts name from var declaration', () => {
      expect(extractMemberName('var oldVar = null;', 'javascript')).toBe('oldVar');
    });

    it('extracts name from function declaration', () => {
      expect(extractMemberName('function navigate(dest) {}', 'javascript')).toBe('navigate');
    });

    it('extracts name from async function declaration', () => {
      expect(extractMemberName('async function fetchData() {}', 'typescript')).toBe('fetchData');
    });

    it('extracts name from export function', () => {
      expect(extractMemberName('export function renderComponent() {}', 'typescript')).toBe('renderComponent');
    });

    it('extracts name from class declaration', () => {
      expect(extractMemberName('export class MyComponent {}', 'typescript')).toBe('MyComponent');
    });

    it('extracts name from interface declaration', () => {
      expect(extractMemberName('export interface IService {}', 'typescript')).toBe('IService');
    });

    it('extracts name from type alias', () => {
      expect(extractMemberName('export type Handler = () => void;', 'typescript')).toBe('Handler');
    });

    it('extracts name from enum declaration', () => {
      expect(extractMemberName('export enum Status {}', 'typescript')).toBe('Status');
    });

    it('extracts name from class method', () => {
      expect(extractMemberName('  async fetchData(url: string) {', 'typescript')).toBe('fetchData');
    });

    it('extracts name from getter', () => {
      expect(extractMemberName('  get value() {', 'typescript')).toBe('value');
    });
  });

  describe('C#', () => {
    it('extracts name from simple C# method', () => {
      expect(extractMemberName('public string GetName()', 'csharp')).toBe('GetName');
    });

    it('extracts name from async C# method', () => {
      expect(extractMemberName('public async Task<string> FetchAsync()', 'csharp')).toBe('FetchAsync');
    });

    it('extracts name from generic C# method (Foo<T>)', () => {
      expect(extractMemberName('public T GetItem<T>(int id)', 'csharp')).toBe('GetItem');
    });

    it('extracts name from C# class', () => {
      expect(extractMemberName('public class DateTimeExtensions', 'csharp')).toBe('DateTimeExtensions');
    });

    it('extracts name from C# interface', () => {
      expect(extractMemberName('public interface IRepository<T>', 'csharp')).toBe('IRepository');
    });

    it('extracts name from C# enum', () => {
      expect(extractMemberName('public enum Status', 'csharp')).toBe('Status');
    });

    it('extracts name from C# enum member', () => {
      expect(extractMemberName('Active = 1,', 'csharp')).toBe('Active');
    });

    it('extracts name from C# property', () => {
      expect(extractMemberName('public string Name { get; set; }', 'csharp')).toBe('Name');
    });

    it('extracts name from C# field', () => {
      expect(extractMemberName('private readonly int _count;', 'csharp')).toBe('_count');
    });

    it('extracts name from expression-bodied member', () => {
      expect(extractMemberName('public int Count => _list.Count;', 'csharp')).toBe('Count');
    });

    it('extracts name from C# record', () => {
      expect(extractMemberName('public record Point(int X, int Y)', 'csharp')).toBe('Point');
    });
  });

  describe('edge cases', () => {
    it('returns undefined for blank line', () => {
      expect(extractMemberName('', 'csharp')).toBeUndefined();
    });

    it('does not return void as a member name', () => {
      // "void" is a skip name; should fall through to method name
      expect(extractMemberName('public void DoWork()', 'csharp')).toBe('DoWork');
    });
  });
});

describe('extractMemberNameFromLines', () => {
  it('extracts name from JS let declaration after JSDoc block', () => {
    const lines = [
      '/**',
      ' * @type {HTMLElement | undefined}',
      ' */',
      'let currentNexgenNavTarget = undefined;',
    ];
    // block ends at line 2 (the */ line)
    expect(extractMemberNameFromLines(lines, 2, 'javascript')).toBe('currentNexgenNavTarget');
  });

  it('skips blank lines between comment and declaration', () => {
    const lines = [
      '/// <summary>Does thing.</summary>',
      '',
      'public void DoThing() {}',
    ];
    expect(extractMemberNameFromLines(lines, 0, 'csharp')).toBe('DoThing');
  });

  it('skips C# attribute lines', () => {
    const lines = [
      '/// <summary>Handle request.</summary>',
      '[HttpGet("{id}")]',
      'public async Task<IActionResult> Get(int id)',
    ];
    expect(extractMemberNameFromLines(lines, 0, 'csharp')).toBe('Get');
  });

  it('skips multi-line C# attributes', () => {
    const lines = [
      '/// <summary>Handle request.</summary>',
      '[ProducesResponseType(typeof(ApiError),',
      '  StatusCodes.Status400BadRequest)]',
      'public async Task<IActionResult> Get(int id)',
    ];
    expect(extractMemberNameFromLines(lines, 0, 'csharp')).toBe('Get');
  });

  it('skips TypeScript decorators', () => {
    const lines = [
      '/**',
      ' * Creates the component.',
      ' */',
      '@Component({ selector: "app-root" })',
      'export class AppComponent {}',
    ];
    expect(extractMemberNameFromLines(lines, 2, 'typescript')).toBe('AppComponent');
  });

  it('returns undefined if no declaration found within window', () => {
    const lines = [
      '/// <summary>Does thing.</summary>',
    ];
    expect(extractMemberNameFromLines(lines, 0, 'csharp')).toBeUndefined();
  });

  it('sets memberName on blocks parsed by findAllCommentBlocks', () => {
    const lines = [
      '/**',
      ' * @type {HTMLElement | undefined}',
      ' */',
      'let currentNexgenNavTarget = undefined;',
    ];
    const blocks = findAllCommentBlocks(lines, javascriptStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].memberName).toBe('currentNexgenNavTarget');
  });

  it('sets memberName for C# method via findAllCommentBlocks', () => {
    const lines = [
      '/// <summary>Gets name.</summary>',
      'public string GetName()',
    ];
    const blocks = findAllCommentBlocks(lines, csharpStyle);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].memberName).toBe('GetName');
  });
});
