import * as vscode from 'vscode';
import { CommentStudioConfig, RenderingMode, XmlDocCommentBlock } from '../types';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { createDecorationStyles, disposeDecorationStyles, DecorationStyles } from './decorationFactory';
import { setRenderingMode } from '../configuration';
import { foldAllDocComments, unfoldAllDocComments } from './commentFoldingProvider';
import { CommentCodeLensProvider } from './commentCodeLensProvider';

// Delay before auto-re-folding after cursor leaves a comment block (ms)
const AUTO_REFOLD_DELAY = 500;
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
  // Currently expanded blocks (docUri → Set of startLines)
  private expandedBlocks = new Map<string, Set<number>>();
  private selectionDisposable: vscode.Disposable | undefined;
  private codeLensProvider: CommentCodeLensProvider | undefined;

  constructor(config: CommentStudioConfig) {
    this.config = config;
    this.styles = createDecorationStyles(config.leftBorder);

    if (config.renderingMode === 'on') {
      this.startCursorTracking();
    }
  }

  setCodeLensProvider(provider: CommentCodeLensProvider): void {
    this.codeLensProvider = provider;
  }

  updateConfiguration(config: CommentStudioConfig): void {
    const oldMode = this.config.renderingMode;
    disposeDecorationStyles(this.styles);
    this.config = config;
    this.styles = createDecorationStyles(config.leftBorder);

    // If mode changed, handle folding transitions
    if (oldMode !== config.renderingMode) {
      this.autoFoldedEditors.clear();
      this.clearAllRefoldTimers();
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

  cycleRenderingMode(): void {
    const modes: RenderingMode[] = ['off', 'on'];
    const currentIndex = modes.indexOf(this.config.renderingMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    setRenderingMode(nextMode);
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
    const docKey = editor.document.uri.toString();

    // Suppress decorations temporarily during editing
    this.suppressedEditors.add(docKey);
    this.clearDecorations(editor);

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
    const leftBorderDecorations: vscode.DecorationOptions[] = [];
    const expanded = this.expandedBlocks.get(docKey) ?? new Set();

    for (const block of blocks) {
      const isMultiline = block.endLine > block.startLine;

      // Left border
      if (this.styles.leftBorder) {
        const shouldApply =
          this.config.leftBorder === 'always' ||
          (this.config.leftBorder === 'multilineOnly' && isMultiline) ||
          (this.config.leftBorder === 'inlineOnly' && !isMultiline);
        if (shouldApply) {
          for (let line = block.startLine; line <= block.endLine; line++) {
            leftBorderDecorations.push({
              range: new vscode.Range(line, 0, line, lines[line].length),
            });
          }
        }
      }

      // Apply transparent decoration to folded multi-line blocks
      // (only lines after the first, since the first line is visible when folded)
      if (isMultiline && !expanded.has(block.startLine)) {
        for (let line = block.startLine + 1; line <= block.endLine; line++) {
          transparentDecorations.push({
            range: new vscode.Range(line, 0, line, lines[line].length),
          });
        }
      }
    }

    editor.setDecorations(this.styles.transparentComment, transparentDecorations);
    if (this.styles.leftBorder) {
      editor.setDecorations(this.styles.leftBorder, leftBorderDecorations);
    }
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

      // If block is folded, unfold it
      if (!expanded.has(containingBlock.startLine)) {
        expanded.add(containingBlock.startLine);
        this.expandedBlocks.set(docKey, expanded);

        // Unfold in the editor
        const savedSelections = editor.selections;
        vscode.commands.executeCommand('editor.unfold', {
          selectionLines: [containingBlock.startLine],
          levels: 1,
        }).then(() => {
          editor.selections = savedSelections;
        });

        // Update CodeLens
        this.codeLensProvider?.setFoldState(docKey, containingBlock.startLine, false);

        // Re-apply decorations to remove transparency
        this.updateDecorations(editor);
      }
    }

    // Start refold timers for any expanded blocks the cursor has left
    for (const startLine of expanded) {
      const block = blocks.find(b => b.startLine === startLine);
      if (!block) continue;

      const cursorInBlock = cursorLine >= block.startLine && cursorLine <= block.endLine;
      if (!cursorInBlock) {
        this.startRefoldTimer(editor, docKey, block);
      }
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

  private clearAllRefoldTimers(): void {
    for (const docTimers of this.refoldTimers.values()) {
      for (const timer of docTimers.values()) {
        clearTimeout(timer);
      }
    }
    this.refoldTimers.clear();
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

      const savedSelections = editor.selections;
      await vscode.commands.executeCommand('editor.fold', {
        selectionLines: [startLine],
        levels: 1,
      });
      editor.selections = savedSelections;

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
  }

  private stopCursorTracking(): void {
    this.selectionDisposable?.dispose();
    this.selectionDisposable = undefined;
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.styles.transparentComment, []);
    if (this.styles.leftBorder) {
      editor.setDecorations(this.styles.leftBorder, []);
    }
  }

  dispose(): void {
    this.stopCursorTracking();
    this.clearAllRefoldTimers();
    for (const timer of this.editTimers.values()) {
      clearTimeout(timer);
    }
    this.editTimers.clear();
    this.suppressedEditors.clear();
    this.expandedBlocks.clear();
    disposeDecorationStyles(this.styles);
  }
}
