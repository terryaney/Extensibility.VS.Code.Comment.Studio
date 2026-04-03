import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';

interface CommentRange {
  startLine: number;
  endLine: number;
  isDocComment: boolean;
}

/**
 * Detects all comment ranges in a document.
 */
function findCommentRanges(document: vscode.TextDocument): CommentRange[] {
  const ranges: CommentRange[] = [];
  const lines = document.getText().split(/\r?\n/);
  const commentStyle = getLanguageCommentStyle(document.languageId);

  let inMultiLineComment = false;
  let multiLineStart = -1;
  let multiLineIsDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inMultiLineComment) {
      const endMarker = commentStyle?.multiLineDocEnd || '*/';
      if (trimmed.includes(endMarker)) {
        ranges.push({ startLine: multiLineStart, endLine: i, isDocComment: multiLineIsDoc });
        inMultiLineComment = false;
      }
      continue;
    }

    // Check for multi-line comment start
    if (commentStyle?.supportsMultiLineDoc) {
      const docStart = commentStyle.multiLineDocStart || '/**';
      if (trimmed.startsWith(docStart)) {
        const endMarker = commentStyle.multiLineDocEnd || '*/';
        if (trimmed.includes(endMarker) && trimmed.indexOf(endMarker) > trimmed.indexOf(docStart)) {
          ranges.push({ startLine: i, endLine: i, isDocComment: true });
        } else {
          inMultiLineComment = true;
          multiLineStart = i;
          multiLineIsDoc = true;
        }
        continue;
      }
      // Non-doc multi-line: /* ... */
      if (trimmed.startsWith('/*') && !trimmed.startsWith('/**')) {
        if (trimmed.includes('*/') && trimmed.indexOf('*/') > 2) {
          ranges.push({ startLine: i, endLine: i, isDocComment: false });
        } else {
          inMultiLineComment = true;
          multiLineStart = i;
          multiLineIsDoc = false;
        }
        continue;
      }
    }

    // Single-line doc comment (///, ''', ##, ---)
    const docPrefix = commentStyle?.singleLineDocPrefix;
    if (docPrefix && trimmed.startsWith(docPrefix)) {
      let endLine = i;
      while (endLine + 1 < lines.length && lines[endLine + 1].trim().startsWith(docPrefix)) {
        endLine++;
      }
      ranges.push({ startLine: i, endLine, isDocComment: true });
      i = endLine;
      continue;
    }

    // Regular single-line comment
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith("'")) {
      ranges.push({ startLine: i, endLine: i, isDocComment: false });
    }
  }

  return ranges;
}

async function removeDocComments(
  editor: vscode.TextEditor,
  filter: (range: CommentRange) => boolean,
): Promise<void> {
  const ranges = findCommentRanges(editor.document);
  const linesToDelete = new Set<number>();

  for (const range of ranges) {
    if (!filter(range)) continue;
    for (let i = range.startLine; i <= range.endLine; i++) {
      linesToDelete.add(i);
    }
  }

  if (linesToDelete.size === 0) return;

  await editor.edit(editBuilder => {
    [...linesToDelete].sort((a, b) => b - a).forEach(lineNum => {
      editBuilder.delete(editor.document.lineAt(lineNum).rangeIncludingLineBreak);
    });
  });
}

export function registerCommentRemoverCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.removeCurrentXmlComment', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const commentStyle = getLanguageCommentStyle(editor.document.languageId);
      if (!commentStyle) return;
      const cursorLine = editor.selection.active.line;
      const lines = editor.document.getText().split(/\r?\n/);
      const blocks = findAllCommentBlocks(lines, commentStyle);
      const currentBlock = blocks.find(b => cursorLine >= b.startLine && cursorLine <= b.endLine);
      if (!currentBlock) {
        vscode.window.showInformationMessage('No XML doc comment at cursor position.');
        return;
      }
      await editor.edit(editBuilder => {
        for (let i = currentBlock.endLine; i >= currentBlock.startLine; i--) {
          editBuilder.delete(editor.document.lineAt(i).rangeIncludingLineBreak);
        }
      });
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeXmlDocOnly', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeDocComments(editor, r => r.isDocComment);
    }),
  );
}
