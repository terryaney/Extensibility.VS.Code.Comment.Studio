import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';
import { computeMinimalEditRange } from './reflowUtils';
import { dbg, canReflow, resetReflowCycles } from '../diagnostics/debugLog';

export { computeMinimalEditRange } from './reflowUtils';

// Set true while our own editor.edit() is running so that decorationManager
// can skip clearing decorations and fold-state sync for programmatic edits.
export let isAutoReflowEdit = false;

interface BlockTracker {
  /** Start line of the last known block the cursor was in, or undefined if outside all blocks. */
  lastBlockStart: number | undefined;
  /** True if at least one edit was made while the cursor was in lastBlockStart's block. */
  isDirty: boolean;
}

/**
 * Monitors typing and auto-reflows doc comment blocks when the cursor leaves
 * a block that was edited. Reflow only fires on cursor-exit, not on every keystroke.
 */
export class AutoReflowHandler implements vscode.Disposable {
  private changeListener: vscode.Disposable;
  private selectionListener: vscode.Disposable;
  private docTrackers = new Map<string, BlockTracker>();
  private lastDocUri: string | undefined;

  constructor() {
    this.changeListener = vscode.workspace.onDidChangeTextDocument(event => {
      this.handleChange(event);
    });
    this.selectionListener = vscode.window.onDidChangeTextEditorSelection(event => {
      this.handleSelectionChange(event);
    });
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const config = getConfiguration();
    if (!config.enableReflowWhileTyping) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;

    // Skip our own programmatic edits to avoid marking the block dirty again.
    if (isAutoReflowEdit) return;

    const docUri = event.document.uri.toString();

    // Reset the reflow cycle cap when the user switches to a different document.
    if (docUri !== this.lastDocUri) {
      resetReflowCycles();
      this.lastDocUri = docUri;
    }
    if (!config.enabledLanguages.includes(event.document.languageId)) return;

    const changeLine = event.contentChanges[0]?.range.start.line;
    if (changeLine === undefined) return;

    const commentStyle = getLanguageCommentStyle(event.document.languageId);
    if (!commentStyle) return;

    const lines = event.document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const block = blocks.find(b => changeLine >= b.startLine && changeLine <= b.endLine);
    if (!block) {
      dbg('autoReflow', 'handleChange SKIP outside-comment', { line: changeLine });
      return;
    }

    dbg('autoReflow', 'handleChange MARK dirty', { block: `${block.startLine}-${block.endLine}` });

    let tracker = this.docTrackers.get(docUri);
    if (!tracker) {
      tracker = { lastBlockStart: block.startLine, isDirty: true };
      this.docTrackers.set(docUri, tracker);
    } else {
      tracker.lastBlockStart = block.startLine;
      tracker.isDirty = true;
    }
  }

  private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    const config = getConfiguration();
    if (!config.enableReflowWhileTyping) return;

    const editor = event.textEditor;
    if (!config.enabledLanguages.includes(editor.document.languageId)) return;

    const docUri = editor.document.uri.toString();
    const tracker = this.docTrackers.get(docUri);
    if (!tracker) return;

    const commentStyle = getLanguageCommentStyle(editor.document.languageId);
    if (!commentStyle) return;

    const cursorLine = editor.selection.active.line;
    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = findAllCommentBlocks(lines, commentStyle);
    const currentBlock = blocks.find(b => cursorLine >= b.startLine && cursorLine <= b.endLine);
    const currentBlockStart = currentBlock?.startLine;

    if (tracker.isDirty && tracker.lastBlockStart !== undefined && currentBlockStart !== tracker.lastBlockStart) {
      // Cursor moved out of the dirty block — trigger reflow now.
      const dirtyBlockStart = tracker.lastBlockStart;
      tracker.isDirty = false;
      tracker.lastBlockStart = currentBlockStart;

      const dirtyBlock = blocks.find(b => b.startLine === dirtyBlockStart);
      if (dirtyBlock) {
        dbg('autoReflow', 'handleSelectionChange TRIGGER reflow on exit', { block: `${dirtyBlock.startLine}-${dirtyBlock.endLine}` });
        const editorConfigSettings = getEditorConfigSettings(editor.document.uri.fsPath);
        const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;
        this.reflowBlock(editor, dirtyBlock, maxLineWidth).catch(err => {
          dbg('autoReflow', 'handleSelectionChange reflowBlock error', { err: String(err) });
        });
      }
    } else {
      tracker.lastBlockStart = currentBlockStart;
    }
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
    }
  }

  dispose(): void {
    this.changeListener.dispose();
    this.selectionListener.dispose();
  }
}

