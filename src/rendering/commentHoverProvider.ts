import * as vscode from 'vscode';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { renderToMarkdown } from './commentRenderer';

/**
 * Provides rich hover tooltips for XML doc comment blocks.
 * Shows full rendered documentation as Markdown when hovering
 * over lines within a doc comment range.
 */
export class CommentHoverProvider implements vscode.HoverProvider {
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!this.enabled) return undefined;

    const lines = document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      document.uri.toString(),
      document.version,
      lines,
      document.languageId,
    );

    if (!blocks || blocks.length === 0) return undefined;

    // Find the block that contains the hover position
    const block = blocks.find(b =>
      position.line >= b.startLine && position.line <= b.endLine,
    );

    if (!block) return undefined;

    const md = renderToMarkdown(block);
    if (!md) return undefined;

    const range = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
    return new vscode.Hover(md, range);
  }
}
