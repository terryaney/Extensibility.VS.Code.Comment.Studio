import { describe, it, expect } from 'vitest';
import { parseLinkAnchors } from '../../src/navigation/linkAnchorParser';

describe('parseLinkAnchors', () => {
  it('should parse plain file link', () => {
    const results = parseLinkAnchors('// LINK: file.cs');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('file.cs');
    expect(results[0].isLocalAnchor).toBe(false);
  });

  it('should parse relative path with ./', () => {
    const results = parseLinkAnchors('// LINK: ./Models/User.cs');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('./Models/User.cs');
  });

  it('should parse relative path with ../', () => {
    const results = parseLinkAnchors('// LINK: ../Common/Utils.cs');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('../Common/Utils.cs');
  });

  it('should parse path with line number', () => {
    const results = parseLinkAnchors('// LINK: file.cs:42');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('file.cs');
    expect(results[0].lineNumber).toBe(42);
  });

  it('should parse path with line range', () => {
    const results = parseLinkAnchors('// LINK: file.cs:10-20');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('file.cs');
    expect(results[0].lineNumber).toBe(10);
    expect(results[0].endLineNumber).toBe(20);
  });

  it('should parse path with file anchor', () => {
    const results = parseLinkAnchors('// LINK: file.cs#AnchorName');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('file.cs');
    expect(results[0].anchorName).toBe('AnchorName');
  });

  it('should parse local anchor', () => {
    const results = parseLinkAnchors('// LINK: #local-anchor');
    expect(results).toHaveLength(1);
    expect(results[0].isLocalAnchor).toBe(true);
    expect(results[0].anchorName).toBe('local-anchor');
  });

  it('should parse path with spaces', () => {
    const results = parseLinkAnchors('// LINK: path with spaces/file.cs');
    expect(results).toHaveLength(1);
    expect(results[0].targetPath).toBe('path with spaces/file.cs');
  });

  it('should return empty for no LINK: prefix', () => {
    const results = parseLinkAnchors('// Just a regular comment');
    expect(results).toHaveLength(0);
  });

  it('should find multiple links in text', () => {
    const results = parseLinkAnchors('See LINK: a.cs and LINK: b.cs');
    expect(results).toHaveLength(2);
    expect(results[0].targetPath).toBe('a.cs');
  });
});
