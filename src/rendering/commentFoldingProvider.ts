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
 * Runs a fold/unfold operation without letting the editor scroll.
 *
 * VS Code's `editor.fold` / `editor.unfold` commands reveal the lines named in
 * `selectionLines`, so folding a block that sits above the viewport yanks the
 * editor up to it — usually to the first comment block in the file, which reads
 * as "the editor jumped to the top". Restoring `selections` alone does not undo
 * that, because scroll position is tracked separately.
 *
 * Snapshots the top visible line and the selections, then restores both.
 */
export async function preserveViewport(
  editor: vscode.TextEditor,
  operation: () => Thenable<unknown>,
): Promise<void> {
  const savedSelections = editor.selections;
  const savedTopLine = editor.visibleRanges[0]?.start.line;

  await operation();

  editor.selections = savedSelections;

  if (savedTopLine === undefined) return;
  // The document may have shrunk while the command was in flight.
  const topLine = Math.min(savedTopLine, Math.max(editor.document.lineCount - 1, 0));
  editor.revealRange(
    new vscode.Range(topLine, 0, topLine, 0),
    vscode.TextEditorRevealType.AtTop,
  );
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

  await preserveViewport(editor, () => vscode.commands.executeCommand('editor.fold', {
    selectionLines: foldLines,
    levels: 1,
  }));
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

  await preserveViewport(editor, () => vscode.commands.executeCommand('editor.unfold', {
    selectionLines: foldLines,
    levels: 1,
  }));
}
