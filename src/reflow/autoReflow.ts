import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';

const AUTO_REFLOW_DELAY_MS = 300;

/**
 * Monitors typing and auto-reflows doc comment blocks when a line exceeds max width.
 */
export class AutoReflowHandler implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeTextDocument(event => {
      this.handleChange(event);
    });
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const config = getConfiguration();
    if (!config.enableReflowWhileTyping) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;
    if (!config.enabledLanguages.includes(event.document.languageId)) return;

    // Only trigger on single-character insertions (typing)
    const isSingleChar = event.contentChanges.length === 1
      && event.contentChanges[0].text.length === 1
      && event.contentChanges[0].rangeLength === 0;
    if (!isSingleChar) return;

    const changeLine = event.contentChanges[0].range.start.line;
    const lineText = event.document.lineAt(changeLine).text;

    const editorConfigSettings = getEditorConfigSettings(event.document.uri.fsPath);
    const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

    // Only trigger if line exceeds max width
    if (lineText.length <= maxLineWidth) return;

    const commentStyle = getLanguageCommentStyle(event.document.languageId);
    if (!commentStyle) return;

    // Check if the edited line is within a doc comment block
    const lines = event.document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const block = blocks.find(b => changeLine >= b.startLine && changeLine <= b.endLine);
    if (!block) return;

    // Debounce
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.reflowBlock(editor, block, maxLineWidth);
    }, AUTO_REFLOW_DELAY_MS);
  }

  private async reflowBlock(
    editor: vscode.TextEditor,
    block: { startLine: number; endLine: number; indentation: string },
    maxLineWidth: number,
  ): Promise<void> {
    const document = editor.document;
    const commentStyle = getLanguageCommentStyle(document.languageId);
    if (!commentStyle) return;

    const lines = document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const refreshedBlock = blocks.find(b =>
      b.startLine >= block.startLine - 2 && b.startLine <= block.startLine + 2,
    );
    if (!refreshedBlock) return;

    const reflowOptions: ReflowOptions = {
      maxLineWidth,
      commentStyle,
      indentation: refreshedBlock.indentation,
    };

    const reflowedLines = reflowCommentBlock(refreshedBlock, reflowOptions);
    const newText = reflowedLines.join('\n');
    const blockRange = new vscode.Range(
      refreshedBlock.startLine, 0,
      refreshedBlock.endLine, lines[refreshedBlock.endLine].length,
    );
    const oldText = document.getText(blockRange);

    if (newText !== oldText) {
      // Save cursor position relative to document
      const savedPos = editor.selection.active;
      await editor.edit(editBuilder => {
        editBuilder.replace(blockRange, newText);
      });
      // Try to keep cursor close to where it was
      const newLines = newText.split('\n');
      const lastNewLine = refreshedBlock.startLine + newLines.length - 1;
      if (savedPos.line <= lastNewLine) {
        const newPos = new vscode.Position(
          Math.min(savedPos.line, lastNewLine),
          Math.min(savedPos.character, (newLines[savedPos.line - refreshedBlock.startLine] || '').length),
        );
        editor.selection = new vscode.Selection(newPos, newPos);
      }
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposable.dispose();
  }
}
