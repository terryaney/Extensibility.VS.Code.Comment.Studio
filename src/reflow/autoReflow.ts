import * as vscode from 'vscode';
import { getLanguageCommentStyle, isLanguageSupported } from '../parsing/languageConfig';
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

/** Sets the auto-reflow-edit flag. Use to bracket manual reflow commands so
 *  the change listener doesn't mark the block dirty and trigger a second pass. */
export function setAutoReflowEdit(value: boolean): void {
  isAutoReflowEdit = value;
}

// Singleton reference so extension.ts can call clearDirty without holding
// an AutoReflowHandler instance directly.
let activeHandler: AutoReflowHandler | undefined;

interface BlockTracker {
  /** Start line of the last known block the cursor was in, or undefined if outside all blocks. */
  lastBlockStart: number | undefined;
  /** True if at least one edit was made while the cursor was in lastBlockStart's block. */
  isDirty: boolean;
}

/** A reflow that has been queued on comment exit but not yet applied. */
interface PendingReflow {
  timer: ReturnType<typeof setTimeout>;
  /** Start line of the block awaiting reflow, used to detect the user coming back. */
  blockStart: number;
}

/**
 * Monitors typing and auto-reflows doc comment blocks when the cursor leaves
 * a block that was edited. Reflow only fires on cursor-exit, not on every keystroke.
 */
export class AutoReflowHandler implements vscode.Disposable {
  private changeListener: vscode.Disposable;
  private selectionListener: vscode.Disposable;
  private docTrackers = new Map<string, BlockTracker>();
  private pendingReflows = new Map<string, PendingReflow>();
  private lastDocUri: string | undefined;

  constructor() {
    activeHandler = this;
    this.changeListener = vscode.workspace.onDidChangeTextDocument(event => {
      this.handleChange(event);
    });
    this.selectionListener = vscode.window.onDidChangeTextEditorSelection(event => {
      this.handleSelectionChange(event);
    });
  }

  /** Clear dirty flag for a document so auto-reflow won't fire after a manual reflow. */
  clearDirty(docUri: string): void {
    this.cancelPendingReflow(docUri);
    const tracker = this.docTrackers.get(docUri);
    if (tracker) {
      tracker.isDirty = false;
    }
  }

  /** Drop a queued exit-reflow, e.g. because the caret came back or a manual reflow ran. */
  private cancelPendingReflow(docUri: string): void {
    const pending = this.pendingReflows.get(docUri);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingReflows.delete(docUri);
    dbg('autoReflow', 'cancelPendingReflow', { blockStart: pending.blockStart });
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    const config = getConfiguration();
    if (!config.xmlCommentRendering) return;
    if (!config.enableReflowOnCommentExit) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;

    // Skip our own programmatic edits to avoid marking the block dirty again.
    if (isAutoReflowEdit) return;

    // Skip undo/redo: re-marking the block dirty here causes a reflow to fire the
    // moment the cursor leaves, which silently re-applies what the user just undid.
    if (event.reason === vscode.TextDocumentChangeReason.Undo ||
        event.reason === vscode.TextDocumentChangeReason.Redo) {
      dbg('autoReflow', 'handleChange SKIP undo-redo', { reason: event.reason });
      const undoTracker = this.docTrackers.get(event.document.uri.toString());
      if (undoTracker) undoTracker.isDirty = false;
      return;
    }

    const docUri = event.document.uri.toString();

    // Reset the reflow cycle cap when the user switches to a different document.
    if (docUri !== this.lastDocUri) {
      resetReflowCycles();
      this.lastDocUri = docUri;
    }
    if (!isLanguageSupported(event.document.languageId)) return;

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
    if (!config.xmlCommentRendering) return;
    if (!config.enableReflowOnCommentExit) return;

    const editor = event.textEditor;
    if (!isLanguageSupported(editor.document.languageId)) return;

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

    // The caret came back into a block whose reflow is still queued. Cancel it and
    // restore the dirty flag so the reflow is re-queued when they leave again.
    const pending = this.pendingReflows.get(docUri);
    if (pending && currentBlockStart !== undefined && currentBlockStart === pending.blockStart) {
      this.cancelPendingReflow(docUri);
      tracker.isDirty = true;
      tracker.lastBlockStart = currentBlockStart;
      return;
    }

    if (tracker.isDirty && tracker.lastBlockStart !== undefined && currentBlockStart !== tracker.lastBlockStart) {
      // Cursor left the dirty block. Hold the reflow until the collapse delay has
      // elapsed so the block isn't rewritten under a caret that may come straight back.
      const dirtyBlockStart = tracker.lastBlockStart;
      tracker.isDirty = false;
      tracker.lastBlockStart = currentBlockStart;

      const dirtyBlock = blocks.find(b => b.startLine === dirtyBlockStart);
      if (dirtyBlock) {
        const editorConfigSettings = getEditorConfigSettings(editor.document.uri.fsPath);
        const maxLineWidth = editorConfigSettings.maxLineLength ?? config.reflowLineLength;
        this.schedulePendingReflow(docUri, dirtyBlock, maxLineWidth, config.autoCollapseDelay);
      }
    } else {
      tracker.lastBlockStart = currentBlockStart;
    }
  }

  /**
   * Queue a reflow to run once the caret has stayed outside the block for the
   * auto-collapse delay, so editing is never interrupted by a rewrite.
   */
  private schedulePendingReflow(
    docUri: string,
    block: { startLine: number; endLine: number; indentation: string },
    maxLineWidth: number,
    delayMs: number,
  ): void {
    this.cancelPendingReflow(docUri);

    const delay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
    dbg('autoReflow', 'schedulePendingReflow', { block: `${block.startLine}-${block.endLine}`, delay });

    const timer = setTimeout(() => {
      this.pendingReflows.delete(docUri);

      // Only reflow if this document is still the one being edited; otherwise the
      // ranges we captured may no longer line up with what the user sees.
      const active = vscode.window.activeTextEditor;
      if (!active || active.document.uri.toString() !== docUri) {
        dbg('autoReflow', 'pendingReflow SKIP editor-changed', { docUri });
        return;
      }

      // The caret may have returned to the block after this timer was queued.
      const commentStyle = getLanguageCommentStyle(active.document.languageId);
      if (commentStyle) {
        const cursorLine = active.selection.active.line;
        const currentLines = active.document.getText().split(/\r?\n/);
        const currentBlock = findAllCommentBlocks(currentLines, commentStyle)
          .find(b => cursorLine >= b.startLine && cursorLine <= b.endLine);
        if (currentBlock && currentBlock.startLine === block.startLine) {
          dbg('autoReflow', 'pendingReflow SKIP caret-returned', { block: block.startLine });
          return;
        }
      }

      dbg('autoReflow', 'pendingReflow TRIGGER reflow', { block: `${block.startLine}-${block.endLine}` });
      this.reflowBlock(active, block, maxLineWidth).catch(err => {
        dbg('autoReflow', 'pendingReflow reflowBlock error', { err: String(err) });
      });
    }, delay);

    this.pendingReflows.set(docUri, { timer, blockStart: block.startLine });
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
        }, { undoStopBefore: true, undoStopAfter: true });
      } finally {
        isAutoReflowEdit = false;
      }
    }
  }

  dispose(): void {
    this.changeListener.dispose();
    this.selectionListener.dispose();
    for (const pending of this.pendingReflows.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingReflows.clear();
    if (activeHandler === this) activeHandler = undefined;
  }
}

/** Clear the dirty tracker for a document so auto-reflow won't fire after manual reflow. */
export function clearAutoReflowDirty(docUri: string): void {
  activeHandler?.clearDirty(docUri);
}

