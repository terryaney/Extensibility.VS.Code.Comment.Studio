import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface EditorConfigSettings {
  maxLineLength?: number;
  customAnchorTags?: string[];
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
    const fileExt = path.extname(filePath);
    let currentSectionApplies = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;

      // Section header
      if (line.startsWith('[') && line.endsWith(']')) {
        const pattern = line.slice(1, -1).trim();
        currentSectionApplies = matchesEditorConfigPattern(pattern, fileName, fileExt);
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

function matchesEditorConfigPattern(pattern: string, fileName: string, fileExt: string): boolean {
  if (pattern === '*') return true;
  if (pattern === `*${fileExt}`) return true;
  if (pattern === `*.{${fileExt.slice(1)}}`) return true;

  // Simple glob matching
  try {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(fileName);
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
