import * as vscode from 'vscode';
import { BUILTIN_ANCHOR_TYPES, AnchorType } from './anchorService';
import { CommentStudioConfig } from '../types';

interface AnchorDecorationEntry {
  tag: string;
  decorationType: vscode.TextEditorDecorationType;
}

/**
 * Resolves the color for an anchor type: hex setting override > ThemeColor default.
 */
function resolveAnchorColor(
  anchorType: AnchorType,
  colorOverrides: CommentStudioConfig['colors'],
): string | vscode.ThemeColor {
  const key = anchorType.tag.toLowerCase() as keyof CommentStudioConfig['colors'];
  const override = colorOverrides[key];
  if (override) return override;
  return new vscode.ThemeColor(anchorType.themeColorId);
}

export class AnchorDecorationManager implements vscode.Disposable {
  private decorationTypes: AnchorDecorationEntry[] = [];
  private config: CommentStudioConfig | undefined;

  constructor(config?: CommentStudioConfig) {
    this.config = config;
    this.rebuildDecorations();
  }

  updateConfiguration(config: CommentStudioConfig): void {
    this.config = config;
    this.disposeDecorations();
    this.rebuildDecorations();
  }

  private rebuildDecorations(): void {
    const colorOverrides = this.config?.colors;

    // Built-in anchor types
    for (const [, anchorType] of BUILTIN_ANCHOR_TYPES) {
      const color = colorOverrides ? resolveAnchorColor(anchorType, colorOverrides) : new vscode.ThemeColor(anchorType.themeColorId);
      this.decorationTypes.push({
        tag: anchorType.tag,
        decorationType: vscode.window.createTextEditorDecorationType({
          color,
          fontWeight: 'bold',
          overviewRulerColor: color,
          overviewRulerLane: vscode.OverviewRulerLane.Right,
        }),
      });
    }

    // Custom tags
    if (this.config?.customTags) {
      const customTags = this.config.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
      const customColor = this.config.colors.custom || '#DAA520';
      for (const tag of customTags) {
        if (BUILTIN_ANCHOR_TYPES.has(tag)) continue; // Don't duplicate built-ins
        this.decorationTypes.push({
          tag,
          decorationType: vscode.window.createTextEditorDecorationType({
            color: customColor,
            fontWeight: 'bold',
            overviewRulerColor: customColor,
            overviewRulerLane: vscode.OverviewRulerLane.Right,
          }),
        });
      }
    }
  }

  updateDecorations(editor: vscode.TextEditor): void {
    if (this.config && !this.config.enableTagHighlighting) {
      this.clearDecorations(editor);
      return;
    }

    const rangesMap = new Map<string, vscode.Range[]>();
    for (const entry of this.decorationTypes) {
      rangesMap.set(entry.tag, []);
    }

    const lines = editor.document.getText().split(/\r?\n/);
    const prefixes = this.config?.tagPrefixes
      ? this.config.tagPrefixes.split(',').map(p => p.trim()).filter(p => p)
      : [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const commentIdx = findCommentStart(line);
      if (commentIdx < 0) continue;

      const commentPortion = line.substring(commentIdx);
      for (const entry of this.decorationTypes) {
        const tag = entry.tag;
        // Case-sensitive search for ALL-CAPS tag
        const tagIdx = commentPortion.indexOf(tag);
        if (tagIdx < 0) continue;

        const absIdx = commentIdx + tagIdx;

        // Check for optional prefix character before tag
        let decorationStart = absIdx;
        if (absIdx > 0 && prefixes.includes(line[absIdx - 1])) {
          // Prefix char found — include it in decoration range if preceded by non-word char
          if (absIdx - 1 === 0 || !isWordChar(line[absIdx - 2])) {
            decorationStart = absIdx - 1;
          } else if (isWordChar(line[absIdx - 1])) {
            continue; // Word char before prefix, not a valid anchor
          }
        } else if (absIdx > 0 && isWordChar(line[absIdx - 1])) {
          continue; // Must be preceded by non-word char (word boundary)
        }

        // Must be immediately followed by ':'
        const afterIdx = absIdx + tag.length;
        if (afterIdx >= line.length || line[afterIdx] !== ':') continue;

        // Colorize prefix + TAG: (tag + colon)
        const ranges = rangesMap.get(tag);
        if (ranges) {
          ranges.push(new vscode.Range(i, decorationStart, i, afterIdx + 1));
        }
      }
    }

    for (const entry of this.decorationTypes) {
      const ranges = rangesMap.get(entry.tag) || [];
      editor.setDecorations(entry.decorationType, ranges);
    }
  }

  clearDecorations(editor: vscode.TextEditor): void {
    for (const entry of this.decorationTypes) {
      editor.setDecorations(entry.decorationType, []);
    }
  }

  private disposeDecorations(): void {
    for (const entry of this.decorationTypes) {
      entry.decorationType.dispose();
    }
    this.decorationTypes = [];
  }

  dispose(): void {
    this.disposeDecorations();
  }
}

function findCommentStart(line: string): number {
  const hash = line.indexOf('#');
  const doubleSlash = line.indexOf('//');
  const singleQuote = line.indexOf("'");

  const candidates = [hash, doubleSlash, singleQuote].filter(i => i >= 0);
  return candidates.length > 0 ? Math.min(...candidates) : -1;
}

function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}
