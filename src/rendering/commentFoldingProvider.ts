import * as vscode from 'vscode';
import { getCachedCommentBlocks } from '../parsing/commentParser';

export class CommentFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    _token: vscode.CancellationToken,
  ): vscode.FoldingRange[] {
    const lines = document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      document.uri.toString(),
      document.version,
      lines,
      document.languageId,
    );

    if (!blocks || blocks.length === 0) {
      return [];
    }

    const ranges: vscode.FoldingRange[] = [];
    for (const block of blocks) {
      // Only create folding range if the block spans multiple lines
      if (block.endLine > block.startLine) {
        ranges.push(new vscode.FoldingRange(
          block.startLine,
          block.endLine,
          vscode.FoldingRangeKind.Comment,
        ));
      }
    }

    return ranges;
  }
}

/**
 * Folds all doc comment blocks in the given editor.
 * Uses the editor.fold command with specific line numbers.
 */
export async function foldAllDocComments(editor: vscode.TextEditor): Promise<void> {
  const lines = editor.document.getText().split(/\r?\n/);
  const blocks = getCachedCommentBlocks(
    editor.document.uri.toString(),
    editor.document.version,
    lines,
    editor.document.languageId,
  );

  if (!blocks || blocks.length === 0) {
    return;
  }

  // Collect start lines of multi-line blocks
  const foldLines = blocks
    .filter(b => b.endLine > b.startLine)
    .map(b => b.startLine);

  if (foldLines.length === 0) {
    return;
  }

  // Save current selection, fold at the target lines, then restore
  const savedSelections = editor.selections;
  await vscode.commands.executeCommand('editor.fold', {
    selectionLines: foldLines,
    levels: 1,
  });
  editor.selections = savedSelections;
}

/**
 * Unfolds all doc comment blocks in the given editor.
 */
export async function unfoldAllDocComments(editor: vscode.TextEditor): Promise<void> {
  const lines = editor.document.getText().split(/\r?\n/);
  const blocks = getCachedCommentBlocks(
    editor.document.uri.toString(),
    editor.document.version,
    lines,
    editor.document.languageId,
  );

  if (!blocks || blocks.length === 0) {
    return;
  }

  const foldLines = blocks
    .filter(b => b.endLine > b.startLine)
    .map(b => b.startLine);

  if (foldLines.length === 0) {
    return;
  }

  const savedSelections = editor.selections;
  await vscode.commands.executeCommand('editor.unfold', {
    selectionLines: foldLines,
    levels: 1,
  });
  editor.selections = savedSelections;
}
