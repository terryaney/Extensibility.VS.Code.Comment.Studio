import * as vscode from 'vscode';
import { BUILTIN_ANCHOR_TYPES, AnchorType, buildAnchorPattern } from './anchorService';
import { scanCommentLinesMap } from './commentScanner';
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
  colorOverrides: CommentStudioConfig['colorOverrides'],
): string | vscode.ThemeColor {
  const key = anchorType.tag.toLowerCase();
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
    const colorOverrides = this.config?.colorOverrides;

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
    if (this.config?.customTags?.length) {
      const customTags = this.config.customTags.map(t => t.trim().toUpperCase()).filter(t => t);
      const customColor = this.config.colorOverrides.custom || '#DAA520';
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
    const colorizeMode = this.config?.anchorColorizeMode ?? 'default';

    if (colorizeMode === 'never') {
      this.clearDecorations(editor);
      return;
    }

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

    const tags = this.decorationTypes.map(e => e.tag);
    if (tags.length === 0) return;
    const anchorRegex = new RegExp(buildAnchorPattern(tags, prefixes), 'g');

    for (const [lineIdx, commentStart] of commentMap) {
      const commentPortion = lines[lineIdx].substring(commentStart);

      anchorRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = anchorRegex.exec(commentPortion)) !== null) {
        // Zero-length matches would loop forever; the pattern always consumes a
        // tag, but guard anyway.
        if (match[0].length === 0) {
          anchorRegex.lastIndex++;
          continue;
        }

        const groups = match.groups ?? {};
        const tagText = groups.exact ?? groups.loose ?? '';
        const tag = tagText.toUpperCase();
        const metadataText = groups.metaExact ?? groups.metaLoose;

        // Standalone ANCHOR (no `(name)` syntax) is never colorized.
        if (tag === 'ANCHOR' && !metadataText?.trim()) continue;

        const prefixLen = groups.prefix ? groups.prefix.length : 0;
        const decorationStart = commentStart + match.index;
        const tagEnd = decorationStart + prefixLen + tagText.length;

        const ranges = rangesMap.get(tag);
        if (ranges) {
          ranges.push(new vscode.Range(lineIdx, decorationStart, lineIdx, tagEnd));
        }

        // Colour the metadata container separately, brackets included.
        if (metadataText !== undefined) {
          const openIdx = match[0].search(/[\(\[]/);
          if (openIdx >= 0) {
            metadataRanges.push(
              new vscode.Range(
                lineIdx,
                decorationStart + openIdx,
                lineIdx,
                decorationStart + openIdx + metadataText.length + 2,
              ),
            );
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
