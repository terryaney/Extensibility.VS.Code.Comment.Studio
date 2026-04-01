import * as vscode from 'vscode';
import { BUILTIN_ANCHOR_TYPES, AnchorType } from './anchorService';
import { scanCommentLinesMap } from './commentScanner';
import { CommentStudioConfig } from '../types';

interface AnchorDecorationEntry {
  tag: string;
  decorationType: vscode.TextEditorDecorationType;
}

// Matches optional whitespace then a (…) or […] metadata group at start of string
const METADATA_RE = /^(\s*)([\(\[][^\)\]]*[\)\]])/;

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
  private metadataDecorationType: vscode.TextEditorDecorationType | undefined;
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

    // Anchor metadata decoration — uses the type-name color (light blue by default)
    this.metadataDecorationType = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('katCommentStudio.typeName'),
    });
  }

  updateDecorations(editor: vscode.TextEditor): void {
    if (this.config && !this.config.enableTagHighlighting) {
      this.clearDecorations(editor);
      return;
    }

    const colorizeMode = this.config?.anchorColorizeMode ?? 'caseInsensitive';
    const rangesMap = new Map<string, vscode.Range[]>();
    const metadataRanges: vscode.Range[] = [];
    for (const entry of this.decorationTypes) {
      rangesMap.set(entry.tag, []);
    }

    const lines = editor.document.getText().split(/\r?\n/);
    const commentMap = scanCommentLinesMap(lines);
    const prefixes = this.config?.tagPrefixes
      ? this.config.tagPrefixes.split(',').map(p => p.trim()).filter(p => p)
      : [];

    // Regex that matches optional metadata tokens then colon: e.g. (owner, #issue): or [tokens]:
    const HAS_COLON_RE = /^(?:\s*[\(\[][^\)\]]*[\)\]])?\s*:/;

    for (const [lineIdx, commentStart] of commentMap) {
      const line = lines[lineIdx];
      const commentPortion = line.substring(commentStart);

      for (const entry of this.decorationTypes) {
        const tag = entry.tag;
        const upperPortion = commentPortion.toUpperCase();
        let searchFrom = 0;

        while (true) {
          const tagIdx = upperPortion.indexOf(tag, searchFrom);
          if (tagIdx < 0) break;
          searchFrom = tagIdx + 1; // advance past this match for next iteration

          const absIdx = commentStart + tagIdx;

          // Check for optional prefix character before tag
          let decorationStart = absIdx;
          if (absIdx > 0 && prefixes.includes(line[absIdx - 1])) {
            if (absIdx - 1 === 0 || !isWordChar(line[absIdx - 2])) {
              decorationStart = absIdx - 1;
            } else if (isWordChar(line[absIdx - 1])) {
              continue;
            }
          } else if (absIdx > 0 && isWordChar(line[absIdx - 1])) {
            continue; // Must be preceded by non-word char (word boundary)
          }

          // Must not be immediately followed by a word character (word boundary at end)
          const afterIdx = absIdx + tag.length;
          if (afterIdx < line.length && isWordChar(line[afterIdx])) {
            continue;
          }

          // Check if this match has a colon (with optional metadata tokens) after it
          const textAfterTag = line.substring(afterIdx);
          const hasColon = HAS_COLON_RE.test(textAfterTag);

          if (hasColon) {
            // Always colorize tags followed by a colon (with or without metadata)
            // Extract metadata (…) or […] range if present, for separate coloring
            const metaMatch = METADATA_RE.exec(textAfterTag);
            if (metaMatch) {
              const metaStart = afterIdx + metaMatch[1].length; // skip leading whitespace
              const metaEnd = metaStart + metaMatch[2].length;
              metadataRanges.push(new vscode.Range(lineIdx, metaStart, lineIdx, metaEnd));
            }
          } else if (tag === 'ANCHOR') {
            // Standalone ANCHOR (no (name): syntax) is never colorized per Item 9
            continue;
          } else {
            // Apply colorizeMode for bare tags (no colon)
            if (colorizeMode === 'never') {
              continue;
            } else if (colorizeMode === 'caseSensitive') {
              // Only colorize if source text matches the tag definition exactly
              const sourceText = line.substring(absIdx, absIdx + tag.length);
              if (sourceText !== tag) {
                continue;
              }
            }
            // 'caseInsensitive': colorize regardless (current behavior)
          }

          const ranges = rangesMap.get(tag);
          if (ranges) {
            ranges.push(new vscode.Range(lineIdx, decorationStart, lineIdx, absIdx + tag.length));
          }
        }
      }
    }

    for (const entry of this.decorationTypes) {
      const ranges = rangesMap.get(entry.tag) || [];
      editor.setDecorations(entry.decorationType, ranges);
    }

    if (this.metadataDecorationType) {
      editor.setDecorations(this.metadataDecorationType, metadataRanges);
    }

    // Colorize LINK: keywords in comment portions
    if (this.linkDecorationType) {
      const linkRanges: vscode.Range[] = [];
      const linkRegex = /\bLINK:/g;
      for (const [lineIdx, commentStart] of commentMap) {
        const commentPortion = lines[lineIdx].substring(commentStart);
        linkRegex.lastIndex = 0;
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = linkRegex.exec(commentPortion)) !== null) {
          const absStart = commentStart + linkMatch.index;
          linkRanges.push(new vscode.Range(lineIdx, absStart, lineIdx, absStart + linkMatch[0].length));
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
    if (this.metadataDecorationType) {
      editor.setDecorations(this.metadataDecorationType, []);
    }
  }

  private disposeDecorations(): void {
    for (const entry of this.decorationTypes) {
      entry.decorationType.dispose();
    }
    this.decorationTypes = [];
    this.linkDecorationType?.dispose();
    this.linkDecorationType = undefined;
    this.metadataDecorationType?.dispose();
    this.metadataDecorationType = undefined;
  }

  dispose(): void {
    this.disposeDecorations();
  }
}

function isWordChar(ch: string): boolean {
  return /\w/.test(ch);
}
