import * as vscode from 'vscode';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { renderToMarkdown } from './commentRenderer';

/**
 * Provides rich hover tooltips for XML doc comment blocks.
 * Only shows content when explicitly triggered via CodeLens click
 * (setPendingHover sets the target, provideHover checks it).
 */
export class CommentHoverProvider implements vscode.HoverProvider {
  private enabled = true;
  private _pendingUri: string | undefined;
  private _pendingStartLine: number | undefined;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Arms the hover provider for a specific comment block.
   * The next provideHover call matching this location will return content
   * and clear the pending state.
   */
  setPendingHover(uri: vscode.Uri, startLine: number): void {
    this._pendingUri = uri.toString();
    this._pendingStartLine = startLine;
  }

  /** Clears any pending hover without showing it. */
  clearPending(): void {
    this._pendingUri = undefined;
    this._pendingStartLine = undefined;
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!this.enabled) {
      this.clearPending();
      return undefined;
    }

    // Only respond when armed via CodeLens click
    if (this._pendingUri === undefined || this._pendingStartLine === undefined) return undefined;
    if (document.uri.toString() !== this._pendingUri) {
      this.clearPending();
      return undefined;
    }

    const lines = document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      document.uri.toString(),
      document.version,
      lines,
      document.languageId,
    );

    if (!blocks || blocks.length === 0) {
      this.clearPending();
      return undefined;
    }

    // Find the block matching the pending startLine
    const block = blocks.find(b => b.startLine === this._pendingStartLine);
    if (!block) {
      this.clearPending();
      return undefined;
    }

    // Validate that the hover position is within the target block range
    if (position.line < block.startLine || position.line > block.endLine) {
      this.clearPending();
      return undefined;
    }

    // Clear pending state (one-shot)
    this.clearPending();

    const md = renderToMarkdown(block);
    if (!md) return undefined;

    const range = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
    return new vscode.Hover(md, range);
  }
}
