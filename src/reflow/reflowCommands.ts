import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';

/**
 * DocumentFormattingEditProvider that reflows XML doc comments.
 * Only modifies comment blocks; passes through to default formatter for code.
 */
export class CommentReflowFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): vscode.TextEdit[] {
    return this.reflowDocument(document, undefined, options);
  }

  provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    _token: vscode.CancellationToken,
  ): vscode.TextEdit[] {
    return this.reflowDocument(document, range, options);
  }

  private reflowDocument(
    document: vscode.TextDocument,
    range: vscode.Range | undefined,
    _formattingOptions: vscode.FormattingOptions,
  ): vscode.TextEdit[] {
    const commentStyle = getLanguageCommentStyle(document.languageId);
    if (!commentStyle) return [];

    const config = getConfiguration();
    if (!config.enabledLanguages.includes(document.languageId)) return [];
    if (!config.enableReflowOnFormat) return [];

    const lines = document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const edits: vscode.TextEdit[] = [];

    // Resolve maxLineWidth: editorconfig > setting > default 120
    const editorConfigSettings = getEditorConfigSettings(document.uri.fsPath);
    const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

    for (const block of blocks) {
      // Skip blocks outside the requested range
      if (range) {
        const blockRange = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
        if (!range.intersection(blockRange)) continue;
      }

      const reflowOptions: ReflowOptions = {
        maxLineWidth,
        commentStyle,
        indentation: block.indentation,
      };

      const reflowedLines = reflowCommentBlock(block, reflowOptions);
      const newText = reflowedLines.join('\n');
      const blockRange = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
      const oldText = document.getText(blockRange);

      // Only create edit if content actually changed
      if (newText !== oldText) {
        edits.push(vscode.TextEdit.replace(blockRange, newText));
      }
    }

    return edits;
  }
}

/**
 * Registers the reflow formatting providers for all supported languages.
 */
export function registerReflowProviders(context: vscode.ExtensionContext): void {
  const config = getConfiguration();
  const provider = new CommentReflowFormattingProvider();

  for (const languageId of config.enabledLanguages) {
    const selector: vscode.DocumentFilter = { language: languageId };

    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(selector, provider),
      vscode.languages.registerDocumentRangeFormattingEditProvider(selector, provider),
    );
  }
}
