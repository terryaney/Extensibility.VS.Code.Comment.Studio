import * as vscode from 'vscode';
import { XmlDocCommentBlock, CodeLensPosition } from '../types';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { getStrippedSummary } from './commentRenderer';

/**
 * Provides CodeLens items above XML doc comment blocks.
 * Each block gets two CodeLens items on the same line:
 *   1. "Expand"/"Collapse" — toggles the fold
 *   2. "{summary text}" — plain-text tooltip on hover, click shows rich preview
 */
export class CommentCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  // Track fold state per document URI → Map of startLine → folded
  private foldState = new Map<string, Map<number, boolean>>();
  private enabled = true;
  private codeLensPosition: CodeLensPosition = 'inline';
  private codeLensMaxLength = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this._onDidChangeCodeLenses.fire();
  }

  setCodeLensPosition(position: CodeLensPosition): void {
    this.codeLensPosition = position;
    this._onDidChangeCodeLenses.fire();
  }

  setCodeLensMaxLength(maxLength: number): void {
    this.codeLensMaxLength = maxLength;
    this._onDidChangeCodeLenses.fire();
  }

  setFoldState(documentUri: string, startLine: number, folded: boolean): void {
    let docState = this.foldState.get(documentUri);
    if (!docState) {
      docState = new Map();
      this.foldState.set(documentUri, docState);
    }
    docState.set(startLine, folded);
    this._onDidChangeCodeLenses.fire();
  }

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
      if (block.endLine <= block.startLine) continue;

      const targetLine = this.findCodeLensLine(block, lines, document.lineCount);
      const range = new vscode.Range(targetLine, 0, targetLine, 0);
      const folded = this.isFolded(document.uri.toString(), block.startLine);

      // CodeLens 1: Expand/Collapse toggle
      lenses.push(new vscode.CodeLens(range, {
        title: folded ? 'Expand Xml' : 'Collapse Xml',
        command: 'kat-comment-studio.toggleCommentFold',
        arguments: [document.uri, block.startLine],
      }));

      // CodeLens 2: Summary text — click to show documentation popup
      const rawSummary = getStrippedSummary(block);
      const summary = this.codeLensMaxLength > 0 && rawSummary.length > this.codeLensMaxLength
        ? rawSummary.substring(0, this.codeLensMaxLength) + '...'
        : rawSummary;
      lenses.push(new vscode.CodeLens(range, {
        title: `$(comment-discussion-quote)\u00A0${summary}`,
        tooltip: '',
        command: 'kat-comment-studio.showCommentTooltip',
        arguments: [document.uri, block.startLine],
      }));
    }

    return lenses;
  }

  /**
   * Finds the line where the CodeLens should be placed based on the codeLensPosition setting.
   * Scans forward from the end of the comment block, skipping blank lines and attribute lines,
   * to find the method declaration line.
   */
  private findCodeLensLine(block: XmlDocCommentBlock, lines: string[], lineCount: number): number {
    let declarationLine = block.endLine + 1;
    while (declarationLine < lineCount) {
      const lineText = lines[declarationLine].trim();
      if (lineText === '') {
        declarationLine++;
        continue;
      }
      if (lineText.startsWith('[') && lineText.includes(']')) {
        declarationLine++;
        continue;
      }
      break;
    }

    if (declarationLine >= lineCount) {
      return block.endLine;
    }

    if (this.codeLensPosition === 'inline') {
      return declarationLine;
    }

    const ownLine = declarationLine - 1;
    return ownLine > block.endLine ? ownLine : block.endLine + 1;
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
    this.foldState.clear();
  }
}