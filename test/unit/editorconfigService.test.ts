import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(),
  },
  Disposable: { from: vi.fn() },
}));

import { getEditorConfigSettings } from '../../src/services/editorconfigService';

let root: string;

function write(relativePath: string, contents: string): void {
  const full = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, 'utf-8');
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kcs-editorconfig-'));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('editorconfig section matching', () => {
  it('applies a plain extension section', () => {
    write('plain/.editorconfig', 'root = true\n[*.cs]\nmax_line_length = 90\n');
    write('plain/Widget.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'plain', 'Widget.cs')).maxLineLength).toBe(90);
  });

  it('applies a brace-list section to every listed extension', () => {
    write('braces/.editorconfig', 'root = true\n[*.{cs,vb}]\nmax_line_length = 110\n');
    write('braces/A.cs', '');
    write('braces/B.vb', '');
    write('braces/C.ts', '');

    expect(getEditorConfigSettings(path.join(root, 'braces', 'A.cs')).maxLineLength).toBe(110);
    expect(getEditorConfigSettings(path.join(root, 'braces', 'B.vb')).maxLineLength).toBe(110);
    expect(getEditorConfigSettings(path.join(root, 'braces', 'C.ts')).maxLineLength).toBeUndefined();
  });

  it('matches a directory-scoped section against the path relative to the config', () => {
    write('scoped/.editorconfig', 'root = true\n[src/**/*.cs]\nmax_line_length = 70\n');
    write('scoped/src/Deep/Nested.cs', '');
    write('scoped/src/Top.cs', '');
    write('scoped/other/Excluded.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'scoped', 'src', 'Deep', 'Nested.cs')).maxLineLength).toBe(70);
    // `**/` also matches zero directories.
    expect(getEditorConfigSettings(path.join(root, 'scoped', 'src', 'Top.cs')).maxLineLength).toBe(70);
    expect(getEditorConfigSettings(path.join(root, 'scoped', 'other', 'Excluded.cs')).maxLineLength).toBeUndefined();
  });

  it('does not let a bare-name pattern leak across directories', () => {
    write('bare/.editorconfig', 'root = true\n[Special.cs]\nmax_line_length = 60\n');
    write('bare/Special.cs', '');
    write('bare/Other.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'bare', 'Special.cs')).maxLineLength).toBe(60);
    expect(getEditorConfigSettings(path.join(root, 'bare', 'Other.cs')).maxLineLength).toBeUndefined();
  });

  it('honours a leading slash as anchored to the config directory', () => {
    write('anchored/.editorconfig', 'root = true\n[/top.cs]\nmax_line_length = 55\n');
    write('anchored/top.cs', '');
    write('anchored/nested/top.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'anchored', 'top.cs')).maxLineLength).toBe(55);
    expect(getEditorConfigSettings(path.join(root, 'anchored', 'nested', 'top.cs')).maxLineLength).toBeUndefined();
  });

  it('supports ? and character classes', () => {
    write('classes/.editorconfig', 'root = true\n[?ile[0-9].cs]\nmax_line_length = 45\n');
    write('classes/File1.cs', '');
    write('classes/File99.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'classes', 'File1.cs')).maxLineLength).toBe(45);
    expect(getEditorConfigSettings(path.join(root, 'classes', 'File99.cs')).maxLineLength).toBeUndefined();
  });

  it('reads custom anchor tags and prefixes, and honours max_line_length = off', () => {
    write('tags/.editorconfig', [
      'root = true',
      '[*]',
      'max_line_length = off',
      'custom_anchor_tags = SPIKE, DEBT',
      'custom_anchor_tag_prefixes = @, !',
    ].join('\n'));
    write('tags/Any.cs', '');

    const settings = getEditorConfigSettings(path.join(root, 'tags', 'Any.cs'));
    expect(settings.maxLineLength).toBeUndefined();
    expect(settings.customAnchorTags).toEqual(['SPIKE', 'DEBT']);
    expect(settings.customAnchorTagPrefixes).toEqual(['@', '!']);
  });

  it('lets the closest config win and stops walking at root = true', () => {
    write('walk/.editorconfig', 'root = true\n[*]\nmax_line_length = 100\n');
    write('walk/inner/.editorconfig', '[*]\nmax_line_length = 200\n');
    write('walk/inner/File.cs', '');
    write('walk/Outer.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'walk', 'inner', 'File.cs')).maxLineLength).toBe(200);
    expect(getEditorConfigSettings(path.join(root, 'walk', 'Outer.cs')).maxLineLength).toBe(100);
  });

  it('ignores comments and malformed sections instead of throwing', () => {
    write('malformed/.editorconfig', [
      'root = true',
      '# a comment',
      '; another comment',
      '[*.{cs]',
      'max_line_length = 33',
      '[*]',
      'max_line_length = 77',
    ].join('\n'));
    write('malformed/File.cs', '');

    expect(getEditorConfigSettings(path.join(root, 'malformed', 'File.cs')).maxLineLength).toBe(77);
  });

  it('returns nothing when no .editorconfig exists', () => {
    write('none/File.cs', '');
    // A stray root config above would break isolation, so assert the shape only.
    expect(getEditorConfigSettings(path.join(root, 'none', 'File.cs')).customAnchorTags).toBeUndefined();
  });
});
