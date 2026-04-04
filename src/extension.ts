import * as vscode from 'vscode';
import { DecorationManager } from './rendering/decorationManager';
import { CommentCodeLensProvider } from './rendering/commentCodeLensProvider';
import { CommentHoverProvider } from './rendering/commentHoverProvider';
import { PrefixHighlighter } from './rendering/prefixHighlighter';
import { getConfiguration, onConfigurationChanged } from './configuration';
import { registerReflowProviders } from './reflow/reflowCommands';
import { ReflowCodeActionProvider } from './reflow/reflowCodeAction';
import { SmartPasteHandler } from './reflow/smartPaste';
import { AutoReflowHandler } from './reflow/autoReflow';
import { watchEditorConfig } from './services/editorconfigService';
import { CommentFoldingProvider, foldAllDocComments } from './rendering/commentFoldingProvider';
import { AnchorDecorationManager } from './anchors/anchorDecorationManager';
import { AnchorTreeProvider, AnchorScope } from './anchors/anchorTreeProvider';
import { AnchorCache } from './anchors/anchorCache';
import { scanWorkspace, scanDocument } from './anchors/workspaceScanner';
import { exportAnchorsToFile } from './anchors/anchorExporter';
import { BUILTIN_ANCHOR_TYPES } from './anchors/anchorService';
import { IssueLinkProvider } from './navigation/issueLinkProvider';
import { LinkAnchorLinkProvider, LinkAnchorHoverProvider } from './navigation/linkNavigator';
import { LinkCompletionProvider } from './navigation/linkCompletionProvider';
import { LinkValidator } from './navigation/linkValidator';
import { clearGitCache } from './navigation/gitService';
import { registerCommentRemoverCommands } from './commands/commentRemover';
import { registerAnchorNavigationCommands } from './commands/anchorNavigation';
import { AnchorsGridProvider } from './anchors/anchorsGridProvider';

let decorationManager: DecorationManager | undefined;
let codeLensProvider: CommentCodeLensProvider | undefined;
let hoverProvider: CommentHoverProvider | undefined;
let anchorDecorationManager: AnchorDecorationManager | undefined;
let prefixHighlighter: PrefixHighlighter | undefined;
let smartPasteHandler: SmartPasteHandler | undefined;
let autoReflowHandler: AutoReflowHandler | undefined;
let linkValidator: LinkValidator | undefined;

const SUPPORTED_LANGUAGES: vscode.DocumentSelector = [
  'csharp', 'vb', 'fsharp', 'cpp', 'c',
  'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
  'razor', 'sql', 'powershell',
];

export function activate(context: vscode.ExtensionContext): void {
  const config = getConfiguration();
  decorationManager = new DecorationManager(config);

  // Register CodeLens and Hover providers for XML doc comments
  codeLensProvider = new CommentCodeLensProvider();
  hoverProvider = new CommentHoverProvider();
  decorationManager.setCodeLensProvider(codeLensProvider);

  const isRenderingOn = config.renderingMode === 'on';
  codeLensProvider.setEnabled(isRenderingOn);
  hoverProvider.setEnabled(isRenderingOn);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(SUPPORTED_LANGUAGES, codeLensProvider),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, hoverProvider),
  );

  // Register navigation providers (conditionally based on settings)
  if (config.enableIssueLinks) {
    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(SUPPORTED_LANGUAGES, new IssueLinkProvider()),
    );
  }
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(SUPPORTED_LANGUAGES, new LinkAnchorLinkProvider()),
    vscode.languages.registerHoverProvider(SUPPORTED_LANGUAGES, new LinkAnchorHoverProvider()),
  );

  // Register folding provider for doc comment blocks
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(SUPPORTED_LANGUAGES, new CommentFoldingProvider()),
  );

  // Anchor inline decorations (colorize TODO, HACK, etc.)
  anchorDecorationManager = new AnchorDecorationManager(config);
  context.subscriptions.push(anchorDecorationManager);

  // Prefix highlighting (Better Comments style)
  prefixHighlighter = new PrefixHighlighter(config);
  context.subscriptions.push(prefixHighlighter);

  // Smart paste and auto-reflow
  smartPasteHandler = new SmartPasteHandler();
  context.subscriptions.push(smartPasteHandler);
  autoReflowHandler = new AutoReflowHandler();
  context.subscriptions.push(autoReflowHandler);

  // LINK: validation (diagnostics)
  linkValidator = new LinkValidator();
  context.subscriptions.push(linkValidator);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.toggleRendering', () => {
      decorationManager?.toggleRendering();
    }),
    vscode.commands.registerCommand('kat-comment-studio.cycleRenderingMode', () => {
      decorationManager?.cycleRenderingMode();
    }),
    vscode.commands.registerCommand('kat-comment-studio.reflowComment', () => {
      vscode.commands.executeCommand('editor.action.formatDocument');
    }),
    vscode.commands.registerCommand('kat-comment-studio.toggleCommentFold', async (uri: vscode.Uri, startLine: number) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.uri.toString() === uri.toString()) {
        await decorationManager?.toggleFold(editor, startLine);
      }
    }),
  );

  // Register comment remover commands
  registerCommentRemoverCommands(context);

  // Register anchor navigation commands
  registerAnchorNavigationCommands(context);

  // Set context for keybinding
  vscode.commands.executeCommand('setContext', 'kat-comment-studio.renderingActive', config.renderingMode !== 'off');

  // Listen for configuration changes
  context.subscriptions.push(
    onConfigurationChanged(() => {
      const newConfig = getConfiguration();
      decorationManager?.updateConfiguration(newConfig);
      anchorDecorationManager?.updateConfiguration(newConfig);
      prefixHighlighter?.updateConfiguration(newConfig);

      const renderingOn = newConfig.renderingMode === 'on';
      codeLensProvider?.setEnabled(renderingOn);
      hoverProvider?.setEnabled(renderingOn);

      vscode.commands.executeCommand('setContext', 'kat-comment-studio.renderingActive', newConfig.renderingMode !== 'off');
    })
  );

  // Listen for editor events
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        decorationManager?.updateDecorations(editor);
        anchorDecorationManager?.updateDecorations(editor);
        prefixHighlighter?.updateDecorations(editor);

        // Collapse by default on file open
        const currentConfig = getConfiguration();
        if (currentConfig.collapseByDefault && currentConfig.renderingMode === 'off') {
          foldAllDocComments(editor);
        }
      }
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        decorationManager?.updateDecorations(editor);
        anchorDecorationManager?.updateDecorations(editor);
        prefixHighlighter?.updateDecorations(editor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        decorationManager?.onDocumentChanged(editor, event);
        anchorDecorationManager?.updateDecorations(editor);
        prefixHighlighter?.updateDecorations(editor);
      }
    })
  );

  // Register reflow formatting providers and code action
  registerReflowProviders(context);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(SUPPORTED_LANGUAGES, new ReflowCodeActionProvider(), {
      providedCodeActionKinds: ReflowCodeActionProvider.providedCodeActionKinds,
    }),
  );

  // Watch for .editorconfig changes
  context.subscriptions.push(watchEditorConfig());

  // Initial decoration for active editor
  if (vscode.window.activeTextEditor) {
    decorationManager.updateDecorations(vscode.window.activeTextEditor);
    anchorDecorationManager.updateDecorations(vscode.window.activeTextEditor);
    prefixHighlighter.updateDecorations(vscode.window.activeTextEditor);
  }

  // --- Code Anchors ---
  const anchorCache = new AnchorCache();

  // Register LINK: completion provider (needs anchor cache)
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(SUPPORTED_LANGUAGES, new LinkCompletionProvider(anchorCache), ':', '#', '/'),
  );

  const anchorTreeProvider = new AnchorTreeProvider();
  const treeView = vscode.window.createTreeView('kat-comment-studio.anchorsView', {
    treeDataProvider: anchorTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register anchors grid (bottom panel)
  const anchorsGridProvider = new AnchorsGridProvider(
    // navigateTo
    (filePath, lineNumber) => {
      vscode.window.showTextDocument(vscode.Uri.file(filePath), {
        selection: new vscode.Range(lineNumber, 0, lineNumber, 0),
      });
    },
    // requestScan
    () => { vscode.commands.executeCommand('kat-comment-studio.scanAnchors'); },
    // requestRefresh
    () => { vscode.commands.executeCommand('kat-comment-studio.refreshAnchors'); },
    // requestExport
    () => { vscode.commands.executeCommand('kat-comment-studio.exportAnchors'); },
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AnchorsGridProvider.viewType, anchorsGridProvider),
  );

  // Helper to update both tree and grid views
  function updateAnchorViews(anchors: import('./anchors/anchorService').AnchorMatch[]): void {
    anchorTreeProvider.setAnchors(anchors);
    anchorsGridProvider.updateAnchors(anchors);
  }

  // Resolve scan options from settings
  const scanOptions = {
    fileExtensions: config.fileExtensionsToScan.split(',').map(e => e.trim()).filter(e => e),
    ignoredFolders: config.foldersToIgnore.split(',').map(f => f.trim()).filter(f => f),
    customTags: config.customTags ? config.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined,
    customTagPrefixes: config.tagPrefixes ? config.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined,
  };

  // Auto-scan on activation (non-blocking, respects scanOnLoad setting)
  if (config.scanOnLoad) {
    scanWorkspace(scanOptions).then(results => {
      anchorCache.replaceAll(results);
      updateAnchorViews(results);
      anchorCache.save(context);
    });
  }

  // Scan workspace command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.scanAnchors', async () => {
      const currentConfig = getConfiguration();
      const opts = {
        fileExtensions: currentConfig.fileExtensionsToScan.split(',').map(e => e.trim()).filter(e => e),
        ignoredFolders: currentConfig.foldersToIgnore.split(',').map(f => f.trim()).filter(f => f),
        customTags: currentConfig.customTags ? currentConfig.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined,
        customTagPrefixes: currentConfig.tagPrefixes ? currentConfig.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined,
      };
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for code anchors...', cancellable: true },
        async (progress, token) => {
          const results = await scanWorkspace(opts, token, progress);
          anchorCache.replaceAll(results);
          updateAnchorViews(results);
          await anchorCache.save(context);
          vscode.window.showInformationMessage(`Found ${results.length} code anchors.`);
        },
      );
    }),
  );

  // Export anchors command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.exportAnchors', async () => {
      const anchors = anchorCache.getAll();
      if (anchors.length === 0) {
        vscode.window.showWarningMessage('No anchors to export. Run "Scan Code Anchors" first.');
        return;
      }
      await exportAnchorsToFile(anchors);
    }),
  );

  // Refresh anchors command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.refreshAnchors', () => {
      vscode.commands.executeCommand('kat-comment-studio.scanAnchors');
    }),
  );

  // Show anchors grid command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.showAnchorsGrid', () => {
      vscode.commands.executeCommand('kat-comment-studio.anchorsGrid.focus');
    }),
  );

  // Scope change command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.setAnchorScope', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Workspace', value: 'workspace' as AnchorScope },
          { label: 'Current Folder', value: 'folder' as AnchorScope },
          { label: 'Current Document', value: 'document' as AnchorScope },
          { label: 'Open Documents', value: 'openDocuments' as AnchorScope },
        ],
        { placeHolder: 'Select anchor scope' },
      );
      if (pick) {
        anchorTreeProvider.setScope(pick.value);
      }
    }),
  );

  // Type filter command (include custom tags)
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.filterAnchorTypes', async () => {
      const currentConfig = getConfiguration();
      const allTypes = [...BUILTIN_ANCHOR_TYPES.values()];
      const picks: { label: string; value: string; picked: boolean }[] = allTypes.map(t => ({
        label: t.displayName, value: t.tag, picked: true,
      }));

      // Add custom tags
      if (currentConfig.customTags) {
        const customTags = currentConfig.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t);
        for (const tag of customTags) {
          if (!BUILTIN_ANCHOR_TYPES.has(tag)) {
            picks.push({ label: tag, value: tag, picked: true });
          }
        }
      }

      const selected = await vscode.window.showQuickPick(
        picks,
        { placeHolder: 'Select anchor types to show', canPickMany: true },
      );
      if (selected) {
        const filter = selected.length === picks.length ? undefined : selected.map(p => p.value);
        anchorTreeProvider.setTypeFilter(filter);
      }
    }),
  );

  // Update cache on document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(document => {
      const currentConfig = getConfiguration();
      const customTags = currentConfig.customTags ? currentConfig.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined;
      const tagPrefixes = currentConfig.tagPrefixes ? currentConfig.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined;
      const anchors = scanDocument(document, customTags, tagPrefixes);
      anchorCache.update(document.uri.fsPath, anchors);
      updateAnchorViews(anchorCache.getAll());
    }),
  );
}

export function deactivate(): void {
  clearGitCache();
  decorationManager?.dispose();
  decorationManager = undefined;
  codeLensProvider?.dispose();
  codeLensProvider = undefined;
  hoverProvider = undefined;
  anchorDecorationManager?.dispose();
  anchorDecorationManager = undefined;
  prefixHighlighter?.dispose();
  prefixHighlighter = undefined;
  smartPasteHandler?.dispose();
  smartPasteHandler = undefined;
  autoReflowHandler?.dispose();
  autoReflowHandler = undefined;
  linkValidator?.dispose();
  linkValidator = undefined;
}
