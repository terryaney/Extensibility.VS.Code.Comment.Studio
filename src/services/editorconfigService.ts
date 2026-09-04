import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface EditorConfigSettings {
  maxLineLength?: number;
  /**
   * Parsed from `custom_anchor_tags` but not consumed anywhere yet — anchor
   * tags come from the `patternProcessing` setting. Wire this through the
   * anchor services before documenting it as supported.
   */
  customAnchorTags?: string[];
  /** Parsed from `custom_anchor_tag_prefixes`; unused, as above. */
  customAnchorTagPrefixes?: string[];
}

const editorConfigCache = new Map<string, { mtime: number; settings: EditorConfigSettings }>();

/**
 * Gets Comment Studio-specific settings from .editorconfig for a file.
 * Walks up the directory tree looking for .editorconfig files.
 */
export function getEditorConfigSettings(filePath: string): EditorConfigSettings {
  const result: EditorConfigSettings = {};

  try {
    const configs = findEditorConfigs(filePath);
    for (const configPath of configs) {
      const settings = parseEditorConfigFile(configPath, filePath);
      // Merge (closest config wins, so later entries override)
      if (settings.maxLineLength !== undefined) {
        result.maxLineLength = settings.maxLineLength;
      }
      if (settings.customAnchorTags) {
        result.customAnchorTags = settings.customAnchorTags;
      }
      if (settings.customAnchorTagPrefixes) {
        result.customAnchorTagPrefixes = settings.customAnchorTagPrefixes;
      }
    }
  } catch {
    // Silently ignore editorconfig errors
  }

  return result;
}

function findEditorConfigs(filePath: string): string[] {
  const configs: string[] = [];
  let dir = path.dirname(filePath);
  let isRoot = false;

  while (!isRoot) {
    const configPath = path.join(dir, '.editorconfig');
    if (fs.existsSync(configPath)) {
      configs.unshift(configPath); // Root configs first
      // Check if this config has root = true
      const content = readConfigCached(configPath);
      if (content && /^\s*root\s*=\s*true\s*$/mi.test(content)) {
        isRoot = true;
      }
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }

  return configs;
}

function readConfigCached(configPath: string): string | undefined {
  try {
    const stat = fs.statSync(configPath);
    const cached = editorConfigCache.get(configPath);
    if (cached && cached.mtime === stat.mtimeMs) {
      return undefined; // Already parsed
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return content;
  } catch {
    return undefined;
  }
}

function parseEditorConfigFile(configPath: string, filePath: string): EditorConfigSettings {
  const result: EditorConfigSettings = {};

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const fileName = path.basename(filePath);
    // Patterns containing a slash are matched against the path relative to the
    // .editorconfig, per the EditorConfig spec.
    const relativePath = path
      .relative(path.dirname(configPath), filePath)
      .split(path.sep)
      .join('/');
    let currentSectionApplies = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;

      // Section header
      if (line.startsWith('[') && line.endsWith(']')) {
        const pattern = line.slice(1, -1).trim();
        currentSectionApplies = matchesEditorConfigPattern(pattern, relativePath, fileName);
        continue;
      }

      if (!currentSectionApplies) continue;

      const eqIndex = line.indexOf('=');
      if (eqIndex < 0) continue;

      const key = line.substring(0, eqIndex).trim().toLowerCase();
      const value = line.substring(eqIndex + 1).trim();

      switch (key) {
        case 'max_line_length':
          if (value !== 'off') {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              result.maxLineLength = num;
            }
          }
          break;
        case 'custom_anchor_tags':
          result.customAnchorTags = value.split(',').map(t => t.trim()).filter(t => t);
          break;
        case 'custom_anchor_tag_prefixes':
          result.customAnchorTagPrefixes = value.split(',').map(t => t.trim()).filter(t => t);
          break;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return result;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/;

function escapeLiteral(ch: string): string {
  return REGEX_SPECIALS.test(ch) ? `\\${ch}` : ch;
}

/**
 * Translates an EditorConfig glob into a regular expression source string.
 * Supports `**`, `*`, `?`, `{a,b}` alternation and `[seq]` / `[!seq]` classes.
 * Numeric `{n..m}` ranges are not supported.
 */
function globToRegex(pattern: string): string {
  let out = '';
  let depth = 0;

  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i];

    if (ch === '\\') {
      const next = pattern[i + 1];
      out += next === undefined ? '\\\\' : escapeLiteral(next);
      i += next === undefined ? 1 : 2;
      continue;
    }

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` also matches zero directories, so `**/*.cs` matches `a.cs`.
        if (pattern[i + 2] === '/') { out += '(?:.*/)?'; i += 3; }
        else { out += '.*'; i += 2; }
      } else {
        out += '[^/]*';
        i += 1;
      }
      continue;
    }

    if (ch === '?') { out += '[^/]'; i += 1; continue; }
    if (ch === '{') { out += '(?:'; depth++; i += 1; continue; }
    if (ch === '}' && depth > 0) { out += ')'; depth--; i += 1; continue; }
    if (ch === ',' && depth > 0) { out += '|'; i += 1; continue; }

    if (ch === '[') {
      let j = i + 1;
      const negated = pattern[j] === '!';
      if (negated) j++;
      let body = '';
      while (j < pattern.length && pattern[j] !== ']') {
        body += pattern[j] === '\\' ? '\\\\' : pattern[j];
        j++;
      }
      if (j < pattern.length && body) {
        out += `[${negated ? '^' : ''}${body}]`;
        i = j + 1;
        continue;
      }
      out += '\\[';
      i += 1;
      continue;
    }

    out += escapeLiteral(ch);
    i += 1;
  }

  // Unbalanced `{` would produce an invalid expression; reject the section.
  return depth === 0 ? out : '(?!)';
}

function matchesEditorConfigPattern(pattern: string, relativePath: string, fileName: string): boolean {
  if (pattern === '*') return true;

  // A pattern with no separator matches the file name in any subdirectory;
  // otherwise it is anchored to the .editorconfig directory.
  const anchored = pattern.includes('/');
  const normalized = anchored && pattern.startsWith('/') ? pattern.slice(1) : pattern;

  try {
    return new RegExp(`^${globToRegex(normalized)}$`).test(anchored ? relativePath : fileName);
  } catch {
    return false;
  }
}

/**
 * Clears the editorconfig cache. Call when files change.
 */
export function clearEditorConfigCache(): void {
  editorConfigCache.clear();
}

/**
 * Creates a file system watcher for .editorconfig changes.
 */
export function watchEditorConfig(): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher('**/.editorconfig');

  const disposables = [
    watcher,
    watcher.onDidChange(() => clearEditorConfigCache()),
    watcher.onDidCreate(() => clearEditorConfigCache()),
    watcher.onDidDelete(() => clearEditorConfigCache()),
  ];

  return vscode.Disposable.from(...disposables);
}
