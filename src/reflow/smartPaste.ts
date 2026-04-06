import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';
import { computeMinimalEditRange } from './reflowUtils';
import { isAutoReflowEdit } from './autoReflow';
import { dbg } from '../diagnostics/debugLog';

export let isSmartPasteEdit = false;

const PASTE_DEBOUNCE_MS = 100;
// Heuristic: paste events insert more than one character at once
const PASTE_MIN_CHARS = 2;

/**
 * Returns true if a line consists entirely of two or more adjacent comment prefixes
 * with no actual text content — indicating a double-injection where both the VS Code
 * language enter-rule and the C# extension inserted a comment prefix on the same line.
 *
 * Example: "\t/// /// " → trimmed to "/// ///" → two "///" prefixes, no text → true.
 * Example: "\t/// some text" → has content after prefix → false.
 */
function isDoubledCommentPrefix(lineText: string): boolean {
  const trimmed = lineText.trim();
  return (
    /^(\/\/\/?[ \t]*){2,}$/.test(trimmed) ||
    /^(#[ \t]*){2,}$/.test(trimmed) ||
    /^(-{2}[ \t]*){2,}$/.test(trimmed) ||
    /^('[ \t]*){2,}$/.test(trimmed)
  );
}

/**
 * Returns true if this change looks like a VS Code enter-rule insertion:
 * a newline followed only by whitespace + a comment prefix, with no content.
 *
 * Handles both LF ("\n") and CRLF ("\r\n") — Windows editors produce CRLF.
 * Example (C# enter rule on Windows): "\r\n\t/// " — just the prefix, nothing after it.
 * Contrasts with a real paste like "\n    /// Some pasted text."
 */
function isEnterRuleInsertion(text: string): boolean {
  const nlIndex = text.indexOf('\n');
  if (nlIndex === -1) return false;
  const afterNewline = text.slice(nlIndex + 1);
  // Only whitespace + a recognized line-comment prefix + optional trailing whitespace
  return /^\s*(\/\/\/?\s*|#\s*|'\s*|--\s*)$/.test(afterNewline);
}

/**
 * Monitors text changes for paste events inside doc comment blocks
 * and automatically reflows the affected block.
 */
export class SmartPasteHandler implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeTextDocument(event => {
      this.handleChange(event).catch(err => {
        dbg('smartPaste', 'handleChange error', { err: String(err) });
      });
    });
  }

  private async handleChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const config = getConfiguration();
    if (!config.enableReflowOnPaste) return;
    if (config.renderingMode !== 'on') return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;
    if (!config.enabledLanguages.includes(event.document.languageId)) return;

    // Guard: ignore our own programmatic edits to prevent infinite self-triggering.
    if (isSmartPasteEdit) {
      dbg('smartPaste', 'handleChange SKIP own-edit');
      return;
    }

    // Guard: ignore auto-reflow / manual-reflow programmatic edits — their multi-line
    // replacements look like pastes but should not trigger a second reflow pass.
    if (isAutoReflowEdit) {
      dbg('smartPaste', 'handleChange SKIP auto-reflow-edit');
      return;
    }

    // Guard: undo/redo operations produce large replacement events that look like
    // pastes (text.length > 10). Re-reflowing on undo would fight the user —
    // they'd be unable to undo past the reflow. Skip both directions.
    if (event.reason === vscode.TextDocumentChangeReason.Undo ||
        event.reason === vscode.TextDocumentChangeReason.Redo) {
      dbg('smartPaste', 'handleChange SKIP undo-redo', { reason: event.reason });
      return;
    }

    // Guard: detect secondary comment-prefix injection from the C# extension.
    // When Enter is pressed in a C# XML doc comment, VS Code's language enter-rule
    // inserts "\r\n\t/// " on the new line (handled above as enter-rule). The C#
    // extension also fires ~100ms later inserting a bare "/// " on that same line,
    // resulting in "\t/// /// " (doubled prefix with no content).
    //
    // Restricted to C# — this race has only been confirmed with the C# extension's
    // XML doc comment continuation. Extend to other languages if the same pattern
    // is observed elsewhere.
    //
    // Detect: single pure insertion of a bare comment prefix (no newline, no content)
    // that produces a doubled-prefix line. Delete the extra prefix immediately.
    if (event.document.languageId === 'csharp' && event.contentChanges.length === 1) {
      const c = event.contentChanges[0];
      if (c.rangeLength === 0 &&
          c.text.indexOf('\n') === -1 &&
          /^\s*(\/\/\/?\s*|#\s*|'\s*|--\s*)$/.test(c.text)) {
        const lineText = event.document.lineAt(c.range.start.line).text;
        if (isDoubledCommentPrefix(lineText)) {
          dbg('smartPaste', 'handleChange REMOVE doubled-prefix', {
            line: c.range.start.line,
            injected: JSON.stringify(c.text),
            lineText: lineText.trim(),
          });
          const deleteRange = new vscode.Range(
            c.range.start,
            c.range.start.translate(0, c.text.length),
          );
          isSmartPasteEdit = true;
          try {
            await editor.edit(
              editBuilder => { editBuilder.delete(deleteRange); },
              { undoStopBefore: false, undoStopAfter: false },
            );
          } finally {
            isSmartPasteEdit = false;
          }
          return;
        }
      }
    }

    // Detect paste: at least one change with multiple characters inserted.
    // Explicitly exclude VS Code enter-rule insertions (newline + comment prefix,
    // no content) so that pressing Enter inside a comment does not trigger reflow.
    const isPaste = event.contentChanges.some(c => {
      if (c.rangeLength === 0 && isEnterRuleInsertion(c.text)) {
        dbg('smartPaste', 'handleChange SKIP enter-rule', { text: c.text.replace(/\n/g, '↵') });
        return false;
      }
      return (c.text.length >= PASTE_MIN_CHARS && c.text.includes('\n')) || c.text.length > 10;
    });
    if (!isPaste) return;

    // Log every change that triggered the paste heuristic so we can see
    // if the C# enter-rule insertion is being misdetected as a paste.
    dbg('smartPaste', 'handleChange paste-detected', {
      changeCount: event.contentChanges.length,
      changes: event.contentChanges.slice(0, 3).map(c => ({
        text: c.text.slice(0, 30).replace(/\n/g, '↵'),
        textLen: c.text.length,
        rangeLength: c.rangeLength,
        startLine: c.range.start.line,
      })),
    });

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

    if (!affectedBlock) {
      dbg('smartPaste', 'handleChange SKIP outside-comment');
      return;
    }

    dbg('smartPaste', 'handleChange SCHEDULE reflow', { block: `${affectedBlock.startLine}-${affectedBlock.endLine}`, delayMs: PASTE_DEBOUNCE_MS });

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
      isSmartPasteEdit = true;
      try {
        await editor.edit(editBuilder => {
          const minimal = computeMinimalEditRange(oldText.split('\n'), newText.split('\n'), refreshedBlock.startLine);
          if (minimal) {
            const r = minimal.range;
            editBuilder.replace(new vscode.Range(r.startLine, r.startChar, r.endLine, r.endChar), minimal.text);
          }
        }, { undoStopBefore: false, undoStopAfter: false });
      } finally {
        isSmartPasteEdit = false;
      }
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposable.dispose();
  }
}
