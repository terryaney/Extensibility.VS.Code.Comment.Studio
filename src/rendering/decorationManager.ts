import * as vscode from 'vscode';
import { CommentStudioConfig, RenderingMode, XmlDocCommentBlock } from '../types';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { createDecorationStyles, disposeDecorationStyles, DecorationStyles } from './decorationFactory';
import { setRenderingMode } from '../configuration';
import { foldAllDocComments, unfoldAllDocComments } from './commentFoldingProvider';
import { CommentCodeLensProvider } from './commentCodeLensProvider';
import { isAutoReflowEdit } from '../reflow/autoReflow';
import { isSmartPasteEdit } from '../reflow/smartPaste';
import { dbg, DEBUG } from '../diagnostics/debugLog';

// Delay before auto-re-folding after cursor leaves a comment block (ms)
const AUTO_REFOLD_DELAY = 500;
// Delay before auto-expanding when cursor enters a folded comment block (ms)
const AUTO_EXPAND_DELAY = 500;
// Debounce delay for edit suppression (ms)
const EDIT_SUPPRESSION_DELAY = 1500;

export class DecorationManager implements vscode.Disposable {
  private config: CommentStudioConfig;
  private styles: DecorationStyles;
  private editTimers = new Map<string, NodeJS.Timeout>();
  private suppressedEditors = new Set<string>();
  // Track which editors have been auto-folded so we don't re-fold on every update
  private autoFoldedEditors = new Set<string>();
  // Track expanded blocks for auto-re-fold (docUri → startLine → timer)
  private refoldTimers = new Map<string, Map<number, NodeJS.Timeout>>();
  // Pending expand timers (docUri → startLine → timer)
  private expandTimers = new Map<string, Map<number, NodeJS.Timeout>>();
  // Currently expanded blocks (docUri → Set of startLines)
  private expandedBlocks = new Map<string, Set<number>>();
  private selectionDisposable: vscode.Disposable | undefined;
  private visibleRangesDisposable: vscode.Disposable | undefined;
  private visibleRangesDebounceTimer: NodeJS.Timeout | undefined;
  private codeLensProvider: CommentCodeLensProvider | undefined;
  private _suppressAutoExpand = false;

  constructor(config: CommentStudioConfig) {
    this.config = config;
    this.styles = createDecorationStyles(config.dimOpacity);

    if (config.renderingMode === 'on') {
      this.startCursorTracking();
    }
  }

  setCodeLensProvider(provider: CommentCodeLensProvider): void {
    this.codeLensProvider = provider;
  }

  /** Suppresses the next auto-expand triggered by cursor movement. One-shot. */
  suppressNextAutoExpand(): void {
    this._suppressAutoExpand = true;
  }

  updateConfiguration(config: CommentStudioConfig): void {
    const oldMode = this.config.renderingMode;
    disposeDecorationStyles(this.styles);
    this.config = config;
    this.styles = createDecorationStyles(config.dimOpacity);

    // If mode changed, handle folding transitions
    if (oldMode !== config.renderingMode) {
      this.autoFoldedEditors.clear();
      this.clearAllRefoldTimers();
      this.clearAllExpandTimersFull();
      this.expandedBlocks.clear();

      if (config.renderingMode === 'on') {
        this.startCursorTracking();
        for (const editor of vscode.window.visibleTextEditors) {
          this.handleModeTransition(editor, oldMode, config.renderingMode);
        }
      } else {
        this.stopCursorTracking();
        for (const editor of vscode.window.visibleTextEditors) {
          this.handleModeTransition(editor, oldMode, config.renderingMode);
        }
      }
    }

    // Re-apply to all visible editors
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  toggleRendering(): void {
    if (this.config.renderingMode === 'off') {
      setRenderingMode('on');
    } else {
      setRenderingMode('off');
    }
  }

  private async handleModeTransition(
    editor: vscode.TextEditor,
    oldMode: RenderingMode,
    newMode: RenderingMode,
  ): Promise<void> {
    if (newMode === 'on') {
      await foldAllDocComments(editor);
      this.markAllBlocksFolded(editor);
    } else if (oldMode === 'on') {
      await unfoldAllDocComments(editor);
      this.codeLensProvider?.setAllUnfolded(editor.document.uri.toString());
    }
  }

  onDocumentChanged(editor: vscode.TextEditor, event: vscode.TextDocumentChangeEvent): void {
    // Skip decoration clearing for our own programmatic reflow edits — they are
    // whitespace-only reformatting of comments and should not disturb decoration state.
    if (isAutoReflowEdit || isSmartPasteEdit) {
      dbg('decorMgr', 'onDocumentChanged SKIP own-edit', { isAutoReflow: isAutoReflowEdit, isSmartPaste: isSmartPasteEdit });
      return;
    }

    if (this.config.renderingMode === 'off') return;

    const docKey = editor.document.uri.toString();

    // Only suppress decorations when the edit is actually inside a comment block.
    // Edits in the method body (outside all comment blocks) must not disturb the
    // transparent decoration on unrelated comment blocks — that causes the
    // transparent → opaque → transparent flicker the user sees while typing code.
    if (event.contentChanges.length === 0) return;
    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(docKey, editor.document.version, lines, editor.document.languageId);
    // Use interval overlap: a change starting before a block ends AND ending after a block starts.
    // This handles range.start outside/range.end inside and vice versa, not just single-line changes.
    const editInsideComment = blocks?.some(b =>
      event.contentChanges.some(c => c.range.start.line <= b.endLine && c.range.end.line >= b.startLine)
    ) ?? false;
    if (!editInsideComment) {
      dbg('decorMgr', 'onDocumentChanged SKIP outside-comment', {
        changes: event.contentChanges.slice(0, 3).map(c => ({
          startLine: c.range.start.line,
          endLine: c.range.end.line,
          text: c.text.slice(0, 15).replace(/\n/g, '↵'),
        })),
        blockRanges: blocks?.map(b => `${b.startLine}-${b.endLine}`) ?? [],
      });
      return;
    }

    dbg('decorMgr', 'onDocumentChanged CLEAR-AND-SUPPRESS', {
      changes: event.contentChanges.slice(0, 3).map(c => ({
        startLine: c.range.start.line,
        endLine: c.range.end.line,
        text: c.text.slice(0, 15).replace(/\n/g, '↵'),
      })),
    });

    // Suppress decorations during editing inside a comment block.
    // Only call clearDecorations() on the first keystroke of a typing burst —
    // if already suppressed, decorations are already gone, so skip the redundant
    // editor.setDecorations() API call on every subsequent keystroke.
    const alreadySuppressed = this.suppressedEditors.has(docKey);
    this.suppressedEditors.add(docKey);
    if (!alreadySuppressed) {
      this.clearDecorations(editor);
    }

    // Clear existing timer
    const existingTimer = this.editTimers.get(docKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer to re-apply decorations
    const timer = setTimeout(() => {
      this.suppressedEditors.delete(docKey);
      this.editTimers.delete(docKey);
      if (vscode.window.activeTextEditor?.document.uri.toString() === docKey) {
        dbg('decorMgr', 'onDocumentChanged suppression-expired → updateDecorations');
        this.updateDecorations(vscode.window.activeTextEditor);
      }
    }, EDIT_SUPPRESSION_DELAY);

    this.editTimers.set(docKey, timer);
  }

  updateDecorations(editor: vscode.TextEditor): void {
    if (this.config.renderingMode === 'off') {
      this.clearDecorations(editor);
      return;
    }

    const docKey = editor.document.uri.toString();
    if (this.suppressedEditors.has(docKey)) {
      return;
    }

    const languageId = editor.document.languageId;
    if (!this.config.enabledLanguages.includes(languageId)) {
      return;
    }

    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      editor.document.uri.toString(),
      editor.document.version,
      lines,
      languageId,
    );

    if (!blocks || blocks.length === 0) {
      this.clearDecorations(editor);
      return;
    }

    // Auto-fold on first visit in on mode
    if (!this.autoFoldedEditors.has(docKey)) {
      this.autoFoldedEditors.add(docKey);
      foldAllDocComments(editor);
      this.markAllBlocksFolded(editor);
    }

    const transparentDecorations: vscode.DecorationOptions[] = [];
    const expanded = this.expandedBlocks.get(docKey) ?? new Set();

    for (const block of blocks) {
      const isMultiline = block.endLine > block.startLine;

      // Apply dim decoration to all lines of folded multi-line blocks
      if (isMultiline && !expanded.has(block.startLine)) {
        for (let line = block.startLine; line <= block.endLine; line++) {
          transparentDecorations.push({
            range: new vscode.Range(line, 0, line, lines[line].length),
          });
        }
      }
    }

    editor.setDecorations(this.styles.transparentComment, transparentDecorations);
  }

  private markAllBlocksFolded(editor: vscode.TextEditor): void {
    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      editor.document.uri.toString(),
      editor.document.version,
      lines,
      editor.document.languageId,
    );
    if (blocks) {
      this.codeLensProvider?.setAllFolded(editor.document.uri.toString(), blocks);
      // Clear expanded set since everything is now folded
      this.expandedBlocks.delete(editor.document.uri.toString());
    }
  }

  /**
   * Called when cursor position changes. Detects if cursor enters/leaves a comment block.
   */
  private onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
    if (this.config.renderingMode !== 'on') return;

    const editor = event.textEditor;
    const docKey = editor.document.uri.toString();
    const cursorLine = event.selections[0]?.active.line;
    if (cursorLine === undefined) return;

    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      docKey,
      editor.document.version,
      lines,
      editor.document.languageId,
    );
    if (!blocks || blocks.length === 0) return;

    const expanded = this.expandedBlocks.get(docKey) ?? new Set();

    // Check if cursor is inside a comment block
    const containingBlock = blocks.find(b =>
      cursorLine >= b.startLine && cursorLine <= b.endLine && b.endLine > b.startLine,
    );

    if (containingBlock) {
      // Cancel any refold timer for this block
      this.cancelRefoldTimer(docKey, containingBlock.startLine);

      // If block is folded, start a debounced expand timer (unless suppressed)
      if (!expanded.has(containingBlock.startLine) && !this._suppressAutoExpand) {
        this.startExpandTimer(editor, docKey, containingBlock);
      }
      this._suppressAutoExpand = false;
    } else {
      // Cursor is outside all comment blocks — cancel any pending expand timers
      this.cancelAllExpandTimers(docKey);
    }

    // Start refold timers for any expanded blocks the cursor has left
    // and cancel expand timers for blocks the cursor is no longer in
    for (const startLine of expanded) {
      const block = blocks.find(b => b.startLine === startLine);
      if (!block) continue;

      const cursorInBlock = cursorLine >= block.startLine && cursorLine <= block.endLine;
      if (!cursorInBlock) {
        this.cancelExpandTimer(docKey, startLine);
        this.startRefoldTimer(editor, docKey, block);
      }
    }
  }

  /**
   * Debounced handler for visible range changes. Detects when folds are toggled
   * via the editor gutter and syncs our internal state.
   */
  private onVisibleRangesChanged(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (this.config.renderingMode !== 'on') return;
    // Skip fold-state sync during our own programmatic edits — the transient
    // visible-range change from editor.edit() would be misread as a gutter fold.
    if (isAutoReflowEdit || isSmartPasteEdit) return;

    // Debounce to avoid thrashing during scroll
    if (this.visibleRangesDebounceTimer) {
      clearTimeout(this.visibleRangesDebounceTimer);
    }
    this.visibleRangesDebounceTimer = setTimeout(() => {
      this.visibleRangesDebounceTimer = undefined;
      this.syncFoldStateFromVisibleRanges(event.textEditor);
    }, 100);
  }

  private syncFoldStateFromVisibleRanges(editor: vscode.TextEditor): void {
    const docKey = editor.document.uri.toString();
    const languageId = editor.document.languageId;
    if (!this.config.enabledLanguages.includes(languageId)) return;

    const lines = editor.document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(docKey, editor.document.version, lines, languageId);
    if (!blocks || blocks.length === 0) return;

    const visibleRanges = editor.visibleRanges;
    const expanded = this.expandedBlocks.get(docKey) ?? new Set();
    let stateChanged = false;

    for (const block of blocks) {
      if (block.endLine <= block.startLine) continue;

      // Check if the block's interior lines (startLine+1 through endLine) are visible
      const interiorVisible = visibleRanges.some(vr => {
        // At least one interior line is within a visible range
        const interiorStart = block.startLine + 1;
        return interiorStart <= block.endLine && vr.start.line <= interiorStart && vr.end.line >= interiorStart;
      });

      const wasExpanded = expanded.has(block.startLine);

      if (interiorVisible && !wasExpanded) {
        // Block was folded but interior is now visible → gutter unfold detected
        expanded.add(block.startLine);
        this.codeLensProvider?.setFoldState(docKey, block.startLine, false);
        stateChanged = true;
      } else if (!interiorVisible && wasExpanded) {
        // Only treat as gutter-fold if the start line IS visible but interior is NOT.
        // If the start line is also off-screen, the block is just scrolled away — don't change state.
        const startLineVisible = visibleRanges.some(vr =>
          vr.start.line <= block.startLine && vr.end.line >= block.startLine,
        );
        if (startLineVisible) {
          // Block was expanded but interior is no longer visible → gutter fold detected
          expanded.delete(block.startLine);
          this.codeLensProvider?.setFoldState(docKey, block.startLine, true);
          // Cancel any pending expand timer
          this.cancelExpandTimer(docKey, block.startLine);
          stateChanged = true;
        }
      }
    }

    if (stateChanged) {
      if (expanded.size === 0) {
        this.expandedBlocks.delete(docKey);
      } else {
        this.expandedBlocks.set(docKey, expanded);
      }
      this.updateDecorations(editor);
    }
  }

  private startRefoldTimer(editor: vscode.TextEditor, docKey: string, block: XmlDocCommentBlock): void {
    // Don't start if one already exists
    const docTimers = this.refoldTimers.get(docKey);
    if (docTimers?.has(block.startLine)) return;

    const timer = setTimeout(() => {
      // Remove from expanded set
      const expanded = this.expandedBlocks.get(docKey);
      if (expanded) {
        expanded.delete(block.startLine);
        if (expanded.size === 0) {
          this.expandedBlocks.delete(docKey);
        }
      }

      // Remove timer
      const timers = this.refoldTimers.get(docKey);
      if (timers) {
        timers.delete(block.startLine);
        if (timers.size === 0) {
          this.refoldTimers.delete(docKey);
        }
      }

      // Re-fold in the editor
      const savedSelections = editor.selections;
      vscode.commands.executeCommand('editor.fold', {
        selectionLines: [block.startLine],
        levels: 1,
      }).then(() => {
        editor.selections = savedSelections;
      });

      // Update CodeLens
      this.codeLensProvider?.setFoldState(docKey, block.startLine, true);

      // Re-apply decorations
      this.updateDecorations(editor);
    }, AUTO_REFOLD_DELAY);

    if (!this.refoldTimers.has(docKey)) {
      this.refoldTimers.set(docKey, new Map());
    }
    this.refoldTimers.get(docKey)!.set(block.startLine, timer);
  }

  private cancelRefoldTimer(docKey: string, startLine: number): void {
    const timer = this.refoldTimers.get(docKey)?.get(startLine);
    if (timer) {
      clearTimeout(timer);
      this.refoldTimers.get(docKey)!.delete(startLine);
    }
  }

  private startExpandTimer(editor: vscode.TextEditor, docKey: string, block: XmlDocCommentBlock): void {
    // Don't start if one already exists for this block
    if (this.expandTimers.get(docKey)?.has(block.startLine)) return;

    const timer = setTimeout(() => {
      // Remove timer
      const timers = this.expandTimers.get(docKey);
      if (timers) {
        timers.delete(block.startLine);
        if (timers.size === 0) {
          this.expandTimers.delete(docKey);
        }
      }

      // Add to expanded set
      const expanded = this.expandedBlocks.get(docKey) ?? new Set();
      expanded.add(block.startLine);
      this.expandedBlocks.set(docKey, expanded);

      // Unfold in the editor
      const savedSelections = editor.selections;
      vscode.commands.executeCommand('editor.unfold', {
        selectionLines: [block.startLine],
        levels: 1,
      }).then(() => {
        editor.selections = savedSelections;
      });

      // Update CodeLens
      this.codeLensProvider?.setFoldState(docKey, block.startLine, false);

      // Re-apply decorations to remove dim
      this.updateDecorations(editor);
    }, AUTO_EXPAND_DELAY);

    if (!this.expandTimers.has(docKey)) {
      this.expandTimers.set(docKey, new Map());
    }
    this.expandTimers.get(docKey)!.set(block.startLine, timer);
  }

  private cancelExpandTimer(docKey: string, startLine: number): void {
    const timer = this.expandTimers.get(docKey)?.get(startLine);
    if (timer) {
      clearTimeout(timer);
      this.expandTimers.get(docKey)!.delete(startLine);
    }
  }

  private cancelAllExpandTimers(docKey: string): void {
    const docTimers = this.expandTimers.get(docKey);
    if (docTimers) {
      for (const timer of docTimers.values()) {
        clearTimeout(timer);
      }
      this.expandTimers.delete(docKey);
    }
  }

  private clearAllRefoldTimers(): void {
    for (const docTimers of this.refoldTimers.values()) {
      for (const timer of docTimers.values()) {
        clearTimeout(timer);
      }
    }
    this.refoldTimers.clear();
  }

  private clearAllExpandTimersFull(): void {
    for (const docTimers of this.expandTimers.values()) {
      for (const timer of docTimers.values()) {
        clearTimeout(timer);
      }
    }
    this.expandTimers.clear();
  }

  /**
   * Toggles fold state for a specific comment block.
   * Called by the CodeLens toggle command.
   */
  async toggleFold(editor: vscode.TextEditor, startLine: number): Promise<void> {
    const docKey = editor.document.uri.toString();
    const expanded = this.expandedBlocks.get(docKey) ?? new Set();

    if (expanded.has(startLine)) {
      // Currently expanded → fold it
      expanded.delete(startLine);
      if (expanded.size === 0) {
        this.expandedBlocks.delete(docKey);
      }

      // Look up the block to find endLine for cursor placement
      const lines = editor.document.getText().split(/\r?\n/);
      const blocks = getCachedCommentBlocks(docKey, editor.document.version, lines, editor.document.languageId);
      const block = blocks?.find(b => b.startLine === startLine);

      await vscode.commands.executeCommand('editor.fold', {
        selectionLines: [startLine],
        levels: 1,
      });

      // Move cursor outside the comment block so auto-expand doesn't retrigger
      if (block) {
        let targetLine: number;
        if (block.endLine + 1 < editor.document.lineCount) {
          targetLine = block.endLine + 1;
        } else if (block.startLine > 0) {
          targetLine = block.startLine - 1;
        } else {
          targetLine = block.startLine; // entire file is one comment — nowhere to escape
        }
        editor.selections = [new vscode.Selection(targetLine, 0, targetLine, 0)];
      }

      this.codeLensProvider?.setFoldState(docKey, startLine, true);
    } else {
      // Currently folded → expand it
      expanded.add(startLine);
      this.expandedBlocks.set(docKey, expanded);

      const savedSelections = editor.selections;
      await vscode.commands.executeCommand('editor.unfold', {
        selectionLines: [startLine],
        levels: 1,
      });
      editor.selections = savedSelections;

      this.codeLensProvider?.setFoldState(docKey, startLine, false);
    }

    this.updateDecorations(editor);
  }

  private startCursorTracking(): void {
    if (this.selectionDisposable) return;
    this.selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
      event => this.onSelectionChanged(event),
    );
    this.visibleRangesDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(
      event => this.onVisibleRangesChanged(event),
    );
  }

  private stopCursorTracking(): void {
    this.selectionDisposable?.dispose();
    this.selectionDisposable = undefined;
    this.visibleRangesDisposable?.dispose();
    this.visibleRangesDisposable = undefined;
    if (this.visibleRangesDebounceTimer) {
      clearTimeout(this.visibleRangesDebounceTimer);
      this.visibleRangesDebounceTimer = undefined;
    }
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    if (DEBUG) {
      const caller = new Error().stack?.split('\n').slice(2, 4).map(l => l.trim()).join(' | ') ?? '?';
      dbg('decorMgr', 'clearDecorations', { caller });
    }
    editor.setDecorations(this.styles.transparentComment, []);
  }

  dispose(): void {
    this.stopCursorTracking();
    this.clearAllRefoldTimers();
    this.clearAllExpandTimersFull();
    for (const timer of this.editTimers.values()) {
      clearTimeout(timer);
    }
    this.editTimers.clear();
    this.suppressedEditors.clear();
    this.expandedBlocks.clear();
    disposeDecorationStyles(this.styles);
  }
}
