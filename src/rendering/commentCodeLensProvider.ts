import * as vscode from 'vscode';
import { XmlDocCommentBlock } from '../types';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { getStrippedSummary } from './commentRenderer';

/**
 * Provides CodeLens items above XML doc comment blocks.
 * When folded: shows "📖 {summary text}" — click to unfold.
 * When expanded: shows "📖 Collapse XML Comments" — click to fold.
 */
export class CommentCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Track fold state per document URI → Map of startLine → folded
  private foldState = new Map<string, Map<number, boolean>>();
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Marks a block as folded or unfolded and refreshes CodeLens.
   */
  setFoldState(documentUri: string, startLine: number, folded: boolean): void {
    let docState = this.foldState.get(documentUri);
    if (!docState) {
      docState = new Map();
      this.foldState.set(documentUri, docState);
    }
    docState.set(startLine, folded);
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Sets all blocks in a document as folded.
   */
  setAllFolded(documentUri: string, blocks: XmlDocCommentBlock[]): void {
    const docState = new Map<number, boolean>();
    for (const block of blocks) {
      if (block.endLine > block.startLine) {
        docState.set(block.startLine, true);
      }
    }
    this.foldState.set(documentUri, docState);
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Sets all blocks in a document as unfolded.
   */
  setAllUnfolded(documentUri: string): void {
    this.foldState.delete(documentUri);
    this._onDidChangeCodeLenses.fire();
  }

  isFolded(documentUri: string, startLine: number): boolean {
    return this.foldState.get(documentUri)?.get(startLine) ?? false;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.enabled) return [];

    const lines = document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      document.uri.toString(),
      document.version,
      lines,
      document.languageId,
    );

    if (!blocks || blocks.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    for (const block of blocks) {
      // Only provide CodeLens for multi-line blocks
      if (block.endLine <= block.startLine) continue;

      const range = new vscode.Range(block.startLine, 0, block.startLine, 0);
      const folded = this.isFolded(document.uri.toString(), block.startLine);

      if (folded) {
        const summary = getStrippedSummary(block);
        lenses.push(new vscode.CodeLens(range, {
          title: `📖 ${summary}`,
          command: 'kat-comment-studio.toggleCommentFold',
          arguments: [document.uri, block.startLine],
        }));
      } else {
        lenses.push(new vscode.CodeLens(range, {
          title: '📖 Collapse XML Comments',
          command: 'kat-comment-studio.toggleCommentFold',
          arguments: [document.uri, block.startLine],
        }));
      }
    }

    return lenses;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
    this.foldState.clear();
  }
}
