import { describe, it, expect } from 'vitest';
import { findAnchorsInText, buildAnchorRegex, BUILTIN_ANCHOR_TYPES } from '../../src/anchors/anchorService';

describe('anchorService', () => {
  describe('findAnchorsInText', () => {
    it('should find TODO anchor', () => {
      const text = '// TODO: Fix this later';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('TODO');
      expect(results[0].description).toBe('Fix this later');
    });

    it('should find HACK anchor', () => {
      const text = '// HACK: Temporary workaround';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('HACK');
    });

    it('should find BUG anchor', () => {
      const text = '// BUG: This crashes on null input';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('BUG');
    });

    it('should find NOTE anchor', () => {
      const text = '// NOTE: This is important';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
    });

    it('should find FIXME anchor', () => {
      const text = '// FIXME: Needs refactoring';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('FIXME');
    });

    it('should find REVIEW anchor', () => {
      const text = '// REVIEW: Check this algorithm';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('REVIEW');
    });

    it('should find UNDONE anchor', () => {
      const text = '// UNDONE: Reverted this change';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('UNDONE');
    });

    it('should find multiple anchors in text', () => {
      const text = `// TODO: First task
public void Method() { }
// HACK: Workaround
// BUG: Known issue`;
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(3);
      expect(results[0].tag).toBe('TODO');
      expect(results[1].tag).toBe('HACK');
      expect(results[2].tag).toBe('BUG');
    });

    it('should extract owner metadata', () => {
      const text = '// TODO(@john): Fix this';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('john');
    });

    it('should extract issue reference', () => {
      const text = '// TODO [#123]: Fix this bug';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].issueRef).toBe('#123');
    });

    it('should find ANCHOR with name', () => {
      const text = '// ANCHOR(MySection): Start of important section';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('ANCHOR');
      expect(results[0].anchorName).toBe('MySection');
    });

    it('should track line numbers', () => {
      const text = `line 0
// TODO: On line 1
line 2
// BUG: On line 3`;
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(2);
      expect(results[0].lineNumber).toBe(1);
      expect(results[1].lineNumber).toBe(3);
    });

    it('should support custom tags', () => {
      const text = '// PERF: Optimize this loop';
      const results = findAnchorsInText(text, 'test.cs', [...BUILTIN_ANCHOR_TYPES.keys(), 'PERF']);
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('PERF');
    });

    it('should match case-insensitively', () => {
      const text = '// todo: lowercase anchor';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('TODO'); // normalized to uppercase
      expect(results[0].description).toBe('lowercase anchor');
    });

    it('should match mixed-case tags', () => {
      const text = '// Todo: Mixed case tag';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('TODO');
    });

    it('should match lowercase tags with metadata', () => {
      const text = '// hack(@terry): quick fix';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('HACK');
      expect(results[0].owner).toBe('terry');
    });

    it('should skip ANCHOR without name metadata', () => {
      const text = '// ANCHOR: no name provided';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(0);
    });

    it('should match ANCHOR with name (case-insensitive)', () => {
      const text = '// anchor(MySection): start of section';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('ANCHOR');
      expect(results[0].anchorName).toBe('MySection');
    });

    it('should allow optional space before metadata container', () => {
      const text = '// TODO (@terry): spaced metadata';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('terry');
    });

    it('should not match tag without colon', () => {
      const text = '// TODO fix this later';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(0);
    });

    it('should not match tag in string literals', () => {
      const text = "warningSummary = \"Please review the following warnings:\";";
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(0);
    });

    it('should not match tag in non-comment code', () => {
      const text = 'var NOTE = "NOTE: Hello";';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(0);
    });

    // Phase 6: comment-aware scanning — block comments and additional markers
    it('should find anchor inside /* */ single-line block comment', () => {
      const text = '/* NOTE: block comment */';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
    });

    it('should find anchor on interior line of multi-line /* */ block', () => {
      const text = '/*\n  NOTE: interior\n*/';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
      expect(results[0].lineNumber).toBe(1);
    });

    it('should find anchor in SQL -- comment', () => {
      const text = '-- NOTE: sql comment';
      const results = findAnchorsInText(text, 'test.sql');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
    });

    it('should find anchor in HTML <!-- --> comment', () => {
      const text = '<!-- NOTE: html comment -->';
      const results = findAnchorsInText(text, 'test.html');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
    });

    it('should find anchor on interior line of multi-line <!-- --> block', () => {
      const text = '<!--\n  TODO: fix this\n-->';
      const results = findAnchorsInText(text, 'test.html');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('TODO');
      expect(results[0].lineNumber).toBe(1);
    });

    it('should find anchor in PowerShell <# #> block comment', () => {
      const text = '<# NOTE: powershell block #>';
      const results = findAnchorsInText(text, 'test.ps1');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('NOTE');
    });

    it('should find anchor on interior line of multi-line <# #> block', () => {
      const text = '<#\n  HACK: workaround\n#>';
      const results = findAnchorsInText(text, 'test.ps1');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('HACK');
      expect(results[0].lineNumber).toBe(1);
    });

    it('should not find anchor on line after block comment closes', () => {
      const text = '/*\n  NOTE: inside\n*/\nNOTE: outside';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].lineNumber).toBe(1);
    });

    it('should report correct absolute column for inline comment anchor', () => {
      const text = 'x = 1; // NOTE: hello';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      // The match starts at column 10 (position of 'N' in 'NOTE' within the full line)
      expect(results[0].column).toBeGreaterThanOrEqual(10);
    });

    // Phase 4: interchangeable () and [] delimiters
    it('should extract owner from square brackets', () => {
      const text = '// TODO[@terry]: Fix this';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('terry');
    });

    it('should extract issue ref from parens', () => {
      const text = '// TODO(#456): Fix this bug';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].issueRef).toBe('#456');
    });

    it('should extract issue ref from square brackets', () => {
      const text = '// TODO[#789]: Fix this bug';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].issueRef).toBe('#789');
    });

    it('should find ANCHOR with name in square brackets', () => {
      const text = '// ANCHOR[MySection]: Start of section';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].tag).toBe('ANCHOR');
      expect(results[0].anchorName).toBe('MySection');
    });

    it('should extract comma-separated metadata', () => {
      const text = '// TODO(@terry, 2026-03-27): Fix this';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('terry');
      expect(results[0].dueDate).toBe('2026-03-27');
    });

    it('should extract comma-separated metadata in square brackets', () => {
      const text = '// REVIEW[@jane, #42, 2026-04-01]: Check algorithm';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].owner).toBe('jane');
      expect(results[0].issueRef).toBe('#42');
      expect(results[0].dueDate).toBe('2026-04-01');
    });

    it('should extract date metadata from parens', () => {
      const text = '// REVIEW(2026-03-27): Check this';
      const results = findAnchorsInText(text, 'test.cs');
      expect(results).toHaveLength(1);
      expect(results[0].dueDate).toBe('2026-03-27');
    });
  });

  describe('buildAnchorRegex', () => {
    it('should build regex for default tags', () => {
      const regex = buildAnchorRegex([...BUILTIN_ANCHOR_TYPES.keys()]);
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.test('TODO: something')).toBe(true);
      expect(regex.test('HACK: something')).toBe(true);
    });

    it('should handle tag prefixes', () => {
      const regex = buildAnchorRegex(['TODO'], ['@']);
      expect(regex.test('@TODO: something')).toBe(true);
      expect(regex.test('TODO: something')).toBe(true);
    });
  });
});
