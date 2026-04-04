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
  private linkDecorationType: vscode.TextEditorDecorationType | undefined;
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

    // LINK: keyword decoration
    this.linkDecorationType = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('textLink.foreground'),
      fontWeight: 'bold',
    });
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
        const tagIdx = commentPortion.toUpperCase().indexOf(tag);
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

        // Must be immediately followed by ':' or optional metadata group then ':'
        const afterIdx = absIdx + tag.length;
        let colonIdx = afterIdx;

        // Skip optional whitespace before metadata container (consistent with regex \s?)
        if (colonIdx < line.length && line[colonIdx] === ' ') {
          colonIdx++;
        }

        let hasMetadata = false;

        // Skip optional (...) or [...] metadata group before colon
        if (colonIdx < line.length && (line[colonIdx] === '(' || line[colonIdx] === '[')) {
          const openIdx = colonIdx;
          const closeChar = line[colonIdx] === '(' ? ')' : ']';
          const closeIdx = line.indexOf(closeChar, colonIdx + 1);
          if (closeIdx >= 0) {
            hasMetadata = closeIdx > openIdx + 1; // empty () or [] doesn't count
            colonIdx = closeIdx + 1;
          }
        }

        if (colonIdx >= line.length || line[colonIdx] !== ':') continue;

        // ANCHOR without metadata group is invalid (requires a name)
        if (tag === 'ANCHOR' && !hasMetadata) continue;

        // Colorize prefix + TAG(metadata): through the colon
        const ranges = rangesMap.get(tag);
        if (ranges) {
          ranges.push(new vscode.Range(i, decorationStart, i, colonIdx + 1));
        }
      }
    }

    for (const entry of this.decorationTypes) {
      const ranges = rangesMap.get(entry.tag) || [];
      editor.setDecorations(entry.decorationType, ranges);
    }

    // Colorize LINK: keywords in comment portions
    if (this.linkDecorationType) {
      const linkRanges: vscode.Range[] = [];
      const linkRegex = /\bLINK:/g;
      for (let i = 0; i < lines.length; i++) {
        const commentIdx = findCommentStart(lines[i]);
        if (commentIdx < 0) continue;
        const commentPortion = lines[i].substring(commentIdx);
        linkRegex.lastIndex = 0;
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = linkRegex.exec(commentPortion)) !== null) {
          const absStart = commentIdx + linkMatch.index;
          linkRanges.push(new vscode.Range(i, absStart, i, absStart + linkMatch[0].length));
        }
      }
      editor.setDecorations(this.linkDecorationType, linkRanges);
    }
  }

  clearDecorations(editor: vscode.TextEditor): void {
    for (const entry of this.decorationTypes) {
      editor.setDecorations(entry.decorationType, []);
    }
    if (this.linkDecorationType) {
      editor.setDecorations(this.linkDecorationType, []);
    }
  }

  private disposeDecorations(): void {
    for (const entry of this.decorationTypes) {
      entry.decorationType.dispose();
    }
    this.decorationTypes = [];
    this.linkDecorationType?.dispose();
    this.linkDecorationType = undefined;
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
