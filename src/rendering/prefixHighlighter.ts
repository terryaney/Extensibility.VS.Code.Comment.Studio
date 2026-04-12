import * as vscode from 'vscode';
import { CommentStudioConfig } from '../types';

interface PrefixDecorationEntry {
  prefix: string;
  decorationType: vscode.TextEditorDecorationType;
}

interface PrefixDefinition {
  /** The character(s) after the comment marker */
  prefix: string;
  /** ThemeColor ID */
  themeColorId: string;
  /** Config color key */
  colorKey: string;
  /** Optional CSS font style */
  fontStyle?: string;
  /** Optional CSS text-decoration */
  textDecoration?: string;
}

const PREFIX_DEFINITIONS: PrefixDefinition[] = [
  { prefix: '!', themeColorId: 'katCommentStudio.prefixAlert', colorKey: 'prefixAlert' },
  { prefix: '?', themeColorId: 'katCommentStudio.prefixQuestion', colorKey: 'prefixQuestion' },
  { prefix: '*', themeColorId: 'katCommentStudio.prefixHighlight', colorKey: 'prefixHighlight' },
  { prefix: '//', themeColorId: 'katCommentStudio.prefixStrikethrough', colorKey: 'prefixStrikethrough', textDecoration: 'line-through' },
  { prefix: '-', themeColorId: 'katCommentStudio.prefixDisabled', colorKey: 'prefixDisabled' },
  { prefix: '>', themeColorId: 'katCommentStudio.prefixQuote', colorKey: 'prefixQuote', fontStyle: 'italic' },
];

export class PrefixHighlighter implements vscode.Disposable {
  private entries: PrefixDecorationEntry[] = [];
  private config: CommentStudioConfig;

  constructor(config: CommentStudioConfig) {
    this.config = config;
    this.rebuildDecorations();
  }

  updateConfiguration(config: CommentStudioConfig): void {
    this.config = config;
    this.disposeDecorations();
    this.rebuildDecorations();
  }

  private rebuildDecorations(): void {
    for (const def of PREFIX_DEFINITIONS) {
      const colorOverride = this.config.colorOverrides[def.colorKey];
      const color: string | vscode.ThemeColor = colorOverride || new vscode.ThemeColor(def.themeColorId);

      const options: vscode.DecorationRenderOptions = { color };
      if (def.fontStyle) options.fontStyle = def.fontStyle;
      if (def.textDecoration) options.textDecoration = def.textDecoration;

      this.entries.push({
        prefix: def.prefix,
        decorationType: vscode.window.createTextEditorDecorationType(options),
      });
    }
  }

  updateDecorations(editor: vscode.TextEditor): void {
    if (!this.config.enablePrefixHighlighting) {
      this.clearDecorations(editor);
      return;
    }

    const rangesMap = new Map<string, vscode.Range[]>();
    for (const entry of this.entries) {
      rangesMap.set(entry.prefix, []);
    }

    const lines = editor.document.getText().split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentInfo = findRegularCommentStart(line);
      if (!commentInfo) continue;

      const afterMarker = line.substring(commentInfo.contentStart);
      // Check for prefix — must be first non-space character after comment marker
      const trimmedAfter = afterMarker.trimStart();
      if (!trimmedAfter) continue;

      // Try to match each prefix (longest first — '//' before '/')
      for (const entry of this.entries) {
        if (trimmedAfter.startsWith(entry.prefix)) {
          // Must be followed by space (or end of line) for single-char prefixes
          const charAfterPrefix = trimmedAfter[entry.prefix.length];
          if (entry.prefix.length === 1 && charAfterPrefix !== undefined && charAfterPrefix !== ' ') continue;

          // Highlight the entire comment text (from comment marker to end of line)
          const ranges = rangesMap.get(entry.prefix);
          if (ranges) {
            ranges.push(new vscode.Range(i, commentInfo.markerStart, i, line.length));
          }
          break; // Only match first prefix
        }
      }
    }

    for (const entry of this.entries) {
      const ranges = rangesMap.get(entry.prefix) || [];
      editor.setDecorations(entry.decorationType, ranges);
    }
  }

  clearDecorations(editor: vscode.TextEditor): void {
    for (const entry of this.entries) {
      editor.setDecorations(entry.decorationType, []);
    }
  }

  private disposeDecorations(): void {
    for (const entry of this.entries) {
      entry.decorationType.dispose();
    }
    this.entries = [];
  }

  dispose(): void {
    this.disposeDecorations();
  }
}

interface CommentStartInfo {
  markerStart: number;
  contentStart: number;
}

/**
 * Finds the start of a regular (non-doc) comment.
 * Returns marker position and content start position (after // or # or ').
 * Skips doc comments (///, /**, etc.).
 */
function findRegularCommentStart(line: string): CommentStartInfo | null {
  // Check for // comments (but not /// doc comments)
  const doubleSlash = line.indexOf('//');
  if (doubleSlash >= 0) {
    // Skip /// doc comments
    if (line[doubleSlash + 2] === '/') return null;
    // Skip /** multi-line doc start
    if (line[doubleSlash + 2] === '*') return null;
    return { markerStart: doubleSlash, contentStart: doubleSlash + 2 };
  }

  // Check for # comments (Python/PowerShell — but not ## doc comments)
  const hash = line.indexOf('#');
  if (hash >= 0) {
    if (line[hash + 1] === '#') return null; // ## is doc comment
    return { markerStart: hash, contentStart: hash + 1 };
  }

  // Check for ' comments (VB — but not ''' doc comments)
  const quote = line.indexOf("'");
  if (quote >= 0) {
    if (line[quote + 1] === "'" && line[quote + 2] === "'") return null; // ''' is doc comment
    return { markerStart: quote, contentStart: quote + 1 };
  }

  return null;
}
