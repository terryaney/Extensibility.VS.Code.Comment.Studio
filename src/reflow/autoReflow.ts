import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';
import { computeMinimalEditRange } from './reflowUtils';
import { dbg, canReflow, resetReflowCycles } from '../diagnostics/debugLog';

export { computeMinimalEditRange } from './reflowUtils';

const AUTO_REFLOW_DELAY_MS = 1500;

// Set true while our own editor.edit() is running so that decorationManager
// can skip clearing decorations and fold-state sync for programmatic edits.
export let isAutoReflowEdit = false;

/**
 * Monitors typing and auto-reflows doc comment blocks when a line exceeds max width.
 */
export class AutoReflowHandler implements vscode.Disposable {
  private debounceTimer: NodeJS.Timeout | undefined;
  private disposable: vscode.Disposable;
  private lastDocUri: string | undefined;

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

    // Reset the reflow cycle cap when the user switches to a different document.
    const docUri = event.document.uri.toString();
    if (docUri !== this.lastDocUri) {
      resetReflowCycles();
      this.lastDocUri = docUri;
    }
    if (!config.enabledLanguages.includes(event.document.languageId)) return;

    // Only trigger on single-character insertions (typing)
    const isSingleChar = event.contentChanges.length === 1
      && event.contentChanges[0].text.length === 1
      && event.contentChanges[0].rangeLength === 0;
    if (!isSingleChar) {
      dbg('autoReflow', 'handleChange SKIP not-single-char', {
        changeCount: event.contentChanges.length,
        text: event.contentChanges[0]?.text.slice(0, 20),
        textLen: event.contentChanges[0]?.text.length,
        rangeLength: event.contentChanges[0]?.rangeLength,
      });
      return;
    }

    const changeLine = event.contentChanges[0].range.start.line;
    const lineText = event.document.lineAt(changeLine).text;

    const editorConfigSettings = getEditorConfigSettings(event.document.uri.fsPath);
    const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

    // Only trigger if line exceeds max width
    if (lineText.length <= maxLineWidth) {
      dbg('autoReflow', 'handleChange SKIP under-limit', { line: changeLine, lineLen: lineText.length, max: maxLineWidth });
      return;
    }

    const commentStyle = getLanguageCommentStyle(event.document.languageId);
    if (!commentStyle) return;

    // Check if the edited line is within a doc comment block
    const lines = event.document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const block = blocks.find(b => changeLine >= b.startLine && changeLine <= b.endLine);
    if (!block) {
      dbg('autoReflow', 'handleChange SKIP outside-comment', { line: changeLine });
      return;
    }

    dbg('autoReflow', 'handleChange SCHEDULE reflow', { block: `${block.startLine}-${block.endLine}`, delayMs: AUTO_REFLOW_DELAY_MS });

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
    if (!canReflow()) return;

    const document = editor.document;
    const commentStyle = getLanguageCommentStyle(document.languageId);
    if (!commentStyle) return;

    const lines = document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const refreshedBlock = blocks.find(b =>
      b.startLine >= block.startLine - 2 && b.startLine <= block.startLine + 2,
    );
    if (!refreshedBlock) {
      dbg('autoReflow', 'reflowBlock SKIP block-not-found', { origStart: block.startLine });
      return;
    }

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

    dbg('autoReflow', 'reflowBlock comparing', {
      block: `${refreshedBlock.startLine}-${refreshedBlock.endLine}`,
      oldLen: oldText.length,
      newLen: newText.length,
      changed: newText !== oldText,
    });

    if (newText !== oldText) {
      dbg('autoReflow', 'reflowBlock EDIT', {
        oldSnippet: oldText.slice(0, 80).replace(/\n/g, '↵'),
        newSnippet: newText.slice(0, 80).replace(/\n/g, '↵'),
      });
      // Save cursor position relative to document
      const savedPos = editor.selection.active;
      isAutoReflowEdit = true;
      try {
        await editor.edit(editBuilder => {
          const minimal = computeMinimalEditRange(oldText.split('\n'), newText.split('\n'), refreshedBlock.startLine);
          if (minimal) {
            const r = minimal.range;
            editBuilder.replace(new vscode.Range(r.startLine, r.startChar, r.endLine, r.endChar), minimal.text);
          }
        }, { undoStopBefore: false, undoStopAfter: false });
      } finally {
        isAutoReflowEdit = false;
      }
      // Restore cursor — if the typed char caused a line wrap, move to start of next line
      const newLines = newText.split('\n');
      const lastNewLine = refreshedBlock.startLine + newLines.length - 1;
      if (savedPos.line <= lastNewLine) {
        const lineIndexInBlock = savedPos.line - refreshedBlock.startLine;
        const newLineText = newLines[lineIndexInBlock] || '';
        let newChar: number;
        let newLine: number;
        if (savedPos.character > newLineText.length && lineIndexInBlock + 1 < newLines.length) {
          // Character wrapped to next line — place cursor at content start of next line
          newLine = refreshedBlock.startLine + lineIndexInBlock + 1;
          const nextLineText = newLines[lineIndexInBlock + 1] || '';
          // Skip past the comment prefix (e.g. "    /// ")
          const prefixMatch = nextLineText.match(/^(\s*(?:\/\/\/|'\/\/\/|\*)\s?)/);
          newChar = prefixMatch ? prefixMatch[1].length : 0;
        } else {
          newLine = Math.min(savedPos.line, lastNewLine);
          newChar = Math.min(savedPos.character, newLineText.length);
        }
        const newPos = new vscode.Position(newLine, newChar);
        dbg('autoReflow', 'reflowBlock cursor', { from: `${savedPos.line}:${savedPos.character}`, to: `${newLine}:${newChar}` });
        editor.selection = new vscode.Selection(newPos, newPos);
      }
    }
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.disposable.dispose();
  }
}

