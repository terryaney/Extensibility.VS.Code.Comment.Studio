import * as vscode from 'vscode';
import { BUILTIN_ANCHOR_TYPES } from '../anchors/anchorService';
import { getLanguageCommentStyle } from '../parsing/languageConfig';

interface CommentRange {
  startLine: number;
  endLine: number;
  isDocComment: boolean;
  hasAnchor: boolean;
}

/**
 * Detects all comment ranges in a document.
 */
function findCommentRanges(document: vscode.TextDocument): CommentRange[] {
  const ranges: CommentRange[] = [];
  const lines = document.getText().split(/\r?\n/);
  const commentStyle = getLanguageCommentStyle(document.languageId);

  const anchorTags = [...BUILTIN_ANCHOR_TYPES.keys()];
  const anchorRegex = new RegExp(`\\b(${anchorTags.join('|')}):`);

  let inMultiLineComment = false;
  let multiLineStart = -1;
  let multiLineIsDoc = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inMultiLineComment) {
      const endMarker = commentStyle?.multiLineDocEnd || '*/';
      if (trimmed.includes(endMarker)) {
        const blockText = lines.slice(multiLineStart, i + 1).join('\n');
        ranges.push({
          startLine: multiLineStart,
          endLine: i,
          isDocComment: multiLineIsDoc,
          hasAnchor: anchorRegex.test(blockText),
        });
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
          ranges.push({
            startLine: i, endLine: i,
            isDocComment: true,
            hasAnchor: anchorRegex.test(trimmed),
          });
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
          ranges.push({
            startLine: i, endLine: i,
            isDocComment: false,
            hasAnchor: anchorRegex.test(trimmed),
          });
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
      // Find contiguous block
      let endLine = i;
      while (endLine + 1 < lines.length && lines[endLine + 1].trim().startsWith(docPrefix)) {
        endLine++;
      }
      const blockText = lines.slice(i, endLine + 1).join('\n');
      ranges.push({
        startLine: i, endLine,
        isDocComment: true,
        hasAnchor: anchorRegex.test(blockText),
      });
      i = endLine;
      continue;
    }

    // Regular single-line comment
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith("'")) {
      ranges.push({
        startLine: i, endLine: i,
        isDocComment: false,
        hasAnchor: anchorRegex.test(trimmed),
      });
    }
  }

  return ranges;
}

/**
 * Finds #region / #endregion lines.
 */
function findRegionLines(document: vscode.TextDocument): number[] {
  const lines = document.getText().split(/\r?\n/);
  const result: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^#\s*(region|endregion)\b/i.test(trimmed)) {
      result.push(i);
    }
  }

  return result;
}

type RemovalFilter = (range: CommentRange) => boolean;

async function removeComments(
  editor: vscode.TextEditor,
  filter: RemovalFilter,
  selectionOnly: boolean,
): Promise<void> {
  const document = editor.document;
  const ranges = findCommentRanges(document);

  const linesToDelete = new Set<number>();

  for (const range of ranges) {
    if (!filter(range)) continue;

    if (selectionOnly) {
      const selection = editor.selection;
      if (range.endLine < selection.start.line || range.startLine > selection.end.line) continue;
    }

    for (let i = range.startLine; i <= range.endLine; i++) {
      linesToDelete.add(i);
    }
  }

  if (linesToDelete.size === 0) return;

  await editor.edit(editBuilder => {
    const sortedLines = [...linesToDelete].sort((a, b) => b - a);
    for (const lineNum of sortedLines) {
      const lineRange = document.lineAt(lineNum).rangeIncludingLineBreak;
      editBuilder.delete(lineRange);
    }
  });
}

export function registerCommentRemoverCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.removeAllComments', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeComments(editor, () => true, false);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeCommentsInSelection', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) return;
      await removeComments(editor, () => true, true);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeExceptXmlDoc', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeComments(editor, r => !r.isDocComment, false);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeExceptAnchors', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeComments(editor, r => !r.hasAnchor, false);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeXmlDocOnly', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeComments(editor, r => r.isDocComment, false);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeAnchorsOnly', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      await removeComments(editor, r => r.hasAnchor, false);
    }),

    vscode.commands.registerCommand('kat-comment-studio.removeRegions', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const regionLines = findRegionLines(editor.document);
      if (regionLines.length === 0) return;

      await editor.edit(editBuilder => {
        const sorted = [...regionLines].sort((a, b) => b - a);
        for (const lineNum of sorted) {
          const lineRange = editor.document.lineAt(lineNum).rangeIncludingLineBreak;
          editBuilder.delete(lineRange);
        }
      });
    }),
  );
}
