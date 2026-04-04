import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';

/**
 * CodeActionProvider that offers "Reflow comment" as a light bulb action
 * when the cursor is inside an XML doc comment block.
 */
export class ReflowCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] | undefined {
    const commentStyle = getLanguageCommentStyle(document.languageId);
    if (!commentStyle) return;

    const lines = document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const cursorLine = range.start.line;

    // Find the block containing the cursor
    const block = blocks.find(b => cursorLine >= b.startLine && cursorLine <= b.endLine);
    if (!block) return;

    const config = getConfiguration();
    const editorConfigSettings = getEditorConfigSettings(document.uri.fsPath);
    const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

    const reflowOptions: ReflowOptions = {
      maxLineWidth,
      commentStyle,
      indentation: block.indentation,
    };

    const reflowedLines = reflowCommentBlock(block, reflowOptions);
    const newText = reflowedLines.join('\n');
    const blockRange = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
    const oldText = document.getText(blockRange);

    // Only offer if reflow would change something
    if (newText === oldText) return;

    const action = new vscode.CodeAction('Reflow comment', vscode.CodeActionKind.RefactorRewrite);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, blockRange, newText);
    action.isPreferred = false;

    return [action];
  }
}
