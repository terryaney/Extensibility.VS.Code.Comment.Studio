import { describe, it, expect } from 'vitest';
import { scanCommentLines, scanCommentLinesMap } from '../../src/anchors/commentScanner';

describe('commentScanner', () => {
  describe('single-line markers', () => {
    it('detects // comment', () => {
      const results = scanCommentLines(['// hello']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('detects -- comment', () => {
      const results = scanCommentLines(['-- hello']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('detects # comment', () => {
      const results = scanCommentLines(['# hello']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it("detects ' comment", () => {
      const results = scanCommentLines(["' hello"]);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('returns commentStart at inline position', () => {
      const results = scanCommentLines(['x = 1; // inline']);
      expect(results).toHaveLength(1);
      expect(results[0].commentStart).toBe(7);
    });

    it('returns nothing for non-comment line', () => {
      const results = scanCommentLines(['var x = 42;']);
      expect(results).toHaveLength(0);
    });

    it('skips empty lines', () => {
      const results = scanCommentLines(['']);
      expect(results).toHaveLength(0);
    });
  });

  describe('/* */ block comments', () => {
    it('detects single-line block comment', () => {
      const results = scanCommentLines(['/* hello */']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('detects block comment open line', () => {
      const lines = ['/*', '  interior', '*/'];
      const results = scanCommentLines(lines);
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
      expect(results[1]).toEqual({ lineIndex: 1, commentStart: 0 });
      expect(results[2]).toEqual({ lineIndex: 2, commentStart: 0 });
    });

    it('correctly marks interior lines with commentStart 0', () => {
      const lines = ['code', '/*', '  NOTE: hello', '*/', 'more code'];
      const map = scanCommentLinesMap(lines);
      expect(map.has(0)).toBe(false);
      expect(map.get(1)).toBe(0);
      expect(map.get(2)).toBe(0);
      expect(map.get(3)).toBe(0);
      expect(map.has(4)).toBe(false);
    });

    it('handles block comment that opens and closes on same line', () => {
      const lines = ['/* block */ code', 'next line'];
      const map = scanCommentLinesMap(lines);
      expect(map.get(0)).toBe(0);
      expect(map.has(1)).toBe(false);
    });

    it('does not bleed block state past closing */', () => {
      const lines = ['/*', 'inside', '*/', '// single'];
      const results = scanCommentLines(lines);
      expect(results).toHaveLength(4);
      expect(results[3]).toEqual({ lineIndex: 3, commentStart: 0 });
    });
  });

  describe('<!-- --> block comments', () => {
    it('detects single-line HTML comment', () => {
      const results = scanCommentLines(['<!-- NOTE: hello -->']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('detects multi-line HTML comment interior', () => {
      const lines = ['<!--', '  NOTE: hello', '-->'];
      const map = scanCommentLinesMap(lines);
      expect(map.get(0)).toBe(0);
      expect(map.get(1)).toBe(0);
      expect(map.get(2)).toBe(0);
    });

    it('prefers <!-- over -- at same position', () => {
      // <!-- starts with --, but should be identified as the block opener
      const lines = ['<!--', 'interior', '-->'];
      const results = scanCommentLines(lines);
      // All three lines should be comment lines; block should close after -->
      expect(results).toHaveLength(3);
      // Line after --> should not be in a block
      const linesExtra = ['<!--', 'interior', '-->', 'code'];
      const map = scanCommentLinesMap(linesExtra);
      expect(map.has(3)).toBe(false);
    });
  });

  describe('<# #> PowerShell block comments', () => {
    it('detects single-line PowerShell block comment', () => {
      const results = scanCommentLines(['<# NOTE: hello #>']);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ lineIndex: 0, commentStart: 0 });
    });

    it('detects multi-line PowerShell block interior', () => {
      const lines = ['<#', '  NOTE: hello', '#>'];
      const map = scanCommentLinesMap(lines);
      expect(map.get(0)).toBe(0);
      expect(map.get(1)).toBe(0);
      expect(map.get(2)).toBe(0);
    });
  });

  describe('scanCommentLinesMap', () => {
    it('returns a Map keyed by line index', () => {
      const map = scanCommentLinesMap(['code', '// comment', 'code']);
      expect(map.size).toBe(1);
      expect(map.get(1)).toBe(0);
    });

    it('returns correct inline comment start', () => {
      const map = scanCommentLinesMap(['x = 1; -- note']);
      expect(map.get(0)).toBe(7);
    });
  });

  describe('mixed content', () => {
    it('handles multiple comment lines correctly', () => {
      const lines = [
        'var x = 1;',
        '// single line',
        '/* block start',
        '   interior',
        '*/',
        '-- sql comment',
        'plain code',
      ];
      const map = scanCommentLinesMap(lines);
      expect(map.has(0)).toBe(false);
      expect(map.get(1)).toBe(0);
      expect(map.get(2)).toBe(0);
      expect(map.get(3)).toBe(0);
      expect(map.get(4)).toBe(0);
      expect(map.get(5)).toBe(0);
      expect(map.has(6)).toBe(false);
    });
  });
});
