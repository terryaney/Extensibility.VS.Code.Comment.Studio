import * as vscode from 'vscode';
import { CommentStudioConfig } from '../types';
import { findCommentOpener } from '../anchors/commentScanner';

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
 * Skips doc comments (///, /**, ##, ''').
 *
 * Markers inside string and character literals are ignored, so `var s = "don't";`
 * and `var url = "http://x";` are not treated as comments. Block comments and
 * SQL `--` carry no prefix highlighting, so scanning continues past them.
 */
function findRegularCommentStart(line: string): CommentStartInfo | null {
  let from = 0;

  while (from < line.length) {
    const opener = findCommentOpener(line, from);
    if (!opener) return null;

    const { index, marker } = opener;

    if (marker === '//') {
      if (line[index + 2] === '/') return null; // /// doc comment
      if (line[index + 2] === '*') return null; // /** doc comment
      return { markerStart: index, contentStart: index + 2 };
    }

    if (marker === '#') {
      if (line[index + 1] === '#') return null; // ## doc comment
      return { markerStart: index, contentStart: index + 1 };
    }

    if (marker === "'") {
      if (line[index + 1] === "'" && line[index + 2] === "'") return null; // ''' doc comment
      return { markerStart: index, contentStart: index + 1 };
    }

    from = index + marker.length;
  }

  return null;
}
