import { describe, it, expect } from 'vitest';
import { computeMinimalEditRange } from '../../src/reflow/reflowUtils';

describe('computeMinimalEditRange', () => {
  it('returns null when old and new lines are identical', () => {
    const lines = ['/// <summary>', '/// Short text.', '/// </summary>'];
    expect(computeMinimalEditRange(lines, lines, 0)).toBeNull();
  });

  it('returns the full range when all lines changed', () => {
    const oldLines = ['/// <summary>', '/// Old text.', '/// </summary>'];
    const newLines = ['/// <summary>', '/// New text.', '/// </summary>'];
    const result = computeMinimalEditRange(oldLines, newLines, 10);
    expect(result).not.toBeNull();
    // Only the middle line changed
    expect(result!.range.startLine).toBe(11);
    expect(result!.range.endLine).toBe(11);
    expect(result!.text).toBe('/// New text.');
  });

  it('covers only the changed tail when last line changes', () => {
    const oldLines = ['/// <summary>', '/// Text.', '/// </summary>old'];
    const newLines = ['/// <summary>', '/// Text.', '/// </summary>new'];
    const result = computeMinimalEditRange(oldLines, newLines, 0);
    expect(result).not.toBeNull();
    expect(result!.range.startLine).toBe(2);
    expect(result!.range.endLine).toBe(2);
    expect(result!.text).toBe('/// </summary>new');
  });

  it('covers only the changed head when first line changes', () => {
    const oldLines = ['/// <summary>old', '/// Text.', '/// </summary>'];
    const newLines = ['/// <summary>new', '/// Text.', '/// </summary>'];
    const result = computeMinimalEditRange(oldLines, newLines, 5);
    expect(result).not.toBeNull();
    expect(result!.range.startLine).toBe(5);
    expect(result!.range.endLine).toBe(5);
    expect(result!.text).toBe('/// <summary>new');
  });

  it('handles line count growing (wrap produced new line)', () => {
    const oldLines = [
      '/// <summary>',
      '/// This is a single long line that was not wrapped.',
      '/// </summary>',
    ];
    const newLines = [
      '/// <summary>',
      '/// This is a single long line that',
      '/// was not wrapped.',
      '/// </summary>',
    ];
    const result = computeMinimalEditRange(oldLines, newLines, 0);
    expect(result).not.toBeNull();
    // Change starts at line 1 and ends at line 1 in the old text
    expect(result!.range.startLine).toBe(1);
    expect(result!.range.endLine).toBe(1);
    // Replacement covers two new lines
    expect(result!.text).toBe('/// This is a single long line that\n/// was not wrapped.');
  });

  it('handles line count shrinking (merge produced fewer lines)', () => {
    const oldLines = [
      '/// <summary>',
      '/// Short',
      '/// text.',
      '/// </summary>',
    ];
    const newLines = [
      '/// <summary>',
      '/// Short text.',
      '/// </summary>',
    ];
    const result = computeMinimalEditRange(oldLines, newLines, 0);
    expect(result).not.toBeNull();
    expect(result!.range.startLine).toBe(1);
    // Old range covers lines 1-2 (the two short lines)
    expect(result!.range.endLine).toBe(2);
    // Replacement is the single merged line
    expect(result!.text).toBe('/// Short text.');
  });

  it('respects blockStartLine offset', () => {
    const oldLines = ['/// A', '/// B'];
    const newLines = ['/// A', '/// B changed'];
    const result = computeMinimalEditRange(oldLines, newLines, 20);
    expect(result).not.toBeNull();
    expect(result!.range.startLine).toBe(21);
    expect(result!.range.endLine).toBe(21);
  });
});
