import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';

const PASTE_DEBOUNCE_MS = 100;
// Heuristic: paste events insert more than one character at once
const PASTE_MIN_CHARS = 2;

/**
 * Monitors text changes for paste events inside doc comment blocks
 * and automatically reflows the affected block.
 */
export class SmartPasteHandler implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeTextDocument(event => {
      this.handleChange(event);
    });
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const config = getConfiguration();
    if (!config.enableReflowOnPaste) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;
    if (!config.enabledLanguages.includes(event.document.languageId)) return;

    // Detect paste: at least one change with multiple characters inserted
    const isPaste = event.contentChanges.some(c =>
      c.text.length >= PASTE_MIN_CHARS && c.text.includes('\n') || c.text.length > 10,
    );
    if (!isPaste) return;

    const commentStyle = getLanguageCommentStyle(event.document.languageId);
    if (!commentStyle) return;

    // Check if any change is within a doc comment block
    const lines = event.document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);

    const affectedBlock = blocks.find(block =>
      event.contentChanges.some(change => {
        const changeLine = change.range.start.line;
        return changeLine >= block.startLine && changeLine <= block.endLine;
      }),
    );

    if (!affectedBlock) return;

    // Debounce to avoid double-triggering
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.reflowBlock(editor, affectedBlock, lines);
    }, PASTE_DEBOUNCE_MS);
  }

  private async reflowBlock(
    editor: vscode.TextEditor,
    block: { startLine: number; endLine: number; indentation: string },
    _originalLines: string[],
  ): Promise<void> {
    // Re-read document since it changed
    const document = editor.document;
    const commentStyle = getLanguageCommentStyle(document.languageId);
    if (!commentStyle) return;

    const lines = document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);

    // Find the block closest to our original block's position
    const refreshedBlock = blocks.find(b =>
      b.startLine >= block.startLine - 2 && b.startLine <= block.startLine + 2,
    );
    if (!refreshedBlock) return;

    const config = getConfiguration();
    const editorConfigSettings = getEditorConfigSettings(document.uri.fsPath);
    const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

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
      await editor.edit(editBuilder => {
        editBuilder.replace(blockRange, newText);
      });
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposable.dispose();
  }
}
