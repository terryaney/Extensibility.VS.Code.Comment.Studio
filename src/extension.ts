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
import { AnchorTreeProvider } from './anchors/anchorTreeProvider';
import { AnchorCache } from './anchors/anchorCache';
import { scanWorkspace, scanDocument } from './anchors/workspaceScanner';
import { exportAnchorsToFile } from './anchors/anchorExporter';
import { BUILTIN_ANCHOR_TYPES } from './anchors/anchorService';
import { IssueLinkProvider } from './navigation/issueLinkProvider';
import { LinkAnchorLinkProvider, LinkAnchorHoverProvider, navigateToLinkTarget } from './navigation/linkNavigator';
import { LinkCompletionProvider } from './navigation/linkCompletionProvider';
import { LinkValidator } from './navigation/linkValidator';
import { clearGitCache } from './navigation/gitService';
import { registerCommentRemoverCommands } from './commands/commentRemover';
import { registerAnchorNavigationCommands } from './commands/anchorNavigation';
import { AnchorsGridProvider } from './anchors/anchorsGridProvider';
import { discoverWorkspaceProjects, enrichAnchorsWithMetadata } from './anchors/anchorMetadata';
import {
  AnchorFilterContext,
  AnchorScopeId,
  AnchorScopeOption,
  AnchorViewState,
  buildAnchorScopeOptions,
  createDefaultAnchorViewState,
  ensureValidScopeId,
  filterAnchors,
  formatAnchorCopyRow,
  getAvailableAnchorTypes,
  getScopeLabel,
  normalizeAnchorViewState,
  resolveScopeRootPath,
} from './anchors/anchorViewState';

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
  const anchorViewStateStorageKey = 'kat-comment-studio.anchorViewState';
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

  // Register LINK: navigation command (wires DocumentLinks to navigateToLinkTarget)
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.navigateLink', (target, baseFilePath) => {
      void navigateToLinkTarget(target, baseFilePath);
    }),
  );

  // Set context for keybinding
  vscode.commands.executeCommand('setContext', 'kat-comment-studio.renderingActive', config.renderingMode !== 'off');

  // Status bar rendering toggle
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'kat-comment-studio.toggleRendering';
  function updateStatusBar(renderingMode: string): void {
    const isOn = renderingMode !== 'off';
    statusBarItem.text = `$(comment-discussion) ${isOn ? 'ON' : 'OFF'}`;
    statusBarItem.tooltip = `KAT Comment Studio XML Comment Rendering: ${isOn ? 'ON' : 'OFF'} — Click to toggle`;
  }
  updateStatusBar(config.renderingMode);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

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

      updateStatusBar(newConfig.renderingMode);
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

      refreshAnchorPresentation();
    }),
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        decorationManager?.updateDecorations(editor);
        anchorDecorationManager?.updateDecorations(editor);
        prefixHighlighter?.updateDecorations(editor);
      }

      refreshAnchorPresentation();
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        decorationManager?.onDocumentChanged(editor, event);
        anchorDecorationManager?.updateDecorations(editor);
        prefixHighlighter?.updateDecorations(editor);

        // Debounced anchor re-scan for pane refresh on edit
        if (event.document.uri.scheme === 'file') {
          debouncedAnchorRescan(event.document);
        }
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
  let anchorViewState = normalizeAnchorViewState(
    context.workspaceState.get<Partial<AnchorViewState>>(anchorViewStateStorageKey) ?? createDefaultAnchorViewState(),
  );
  let currentIgnoredFolders = config.foldersToIgnore.split(',').map(folder => folder.trim()).filter(folder => folder);
  let discoveredProjects: Awaited<ReturnType<typeof discoverWorkspaceProjects>> = [];
  let isRefreshingAnchorPresentation = false;

  // Debounced anchor re-scan on document change (500ms)
  let anchorRescanTimer: ReturnType<typeof setTimeout> | undefined;
  function debouncedAnchorRescan(document: vscode.TextDocument): void {
    if (anchorRescanTimer) {
      clearTimeout(anchorRescanTimer);
    }
    anchorRescanTimer = setTimeout(() => {
      anchorRescanTimer = undefined;
      const currentConfig = getConfiguration();
      const customTags = currentConfig.customTags ? currentConfig.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined;
      const tagPrefixes = currentConfig.tagPrefixes ? currentConfig.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined;
      const anchors = scanDocument(document, customTags, tagPrefixes);
      void (async () => {
        if (discoveredProjects.length === 0) {
          discoveredProjects = await discoverWorkspaceProjects(currentIgnoredFolders);
        }
        const enrichedAnchors = await enrichAnchorsWithMetadata(anchors, discoveredProjects);
        anchorCache.update(document.uri.fsPath, enrichedAnchors);
        refreshAnchorPresentation();
      })();
    }, 500);
  }

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
    context.extensionUri,
    // navigateTo
    (filePath, lineNumber) => {
      void vscode.window.showTextDocument(vscode.Uri.file(filePath), {
        selection: new vscode.Range(lineNumber, 0, lineNumber, 0),
      });
    },
    // requestScan
    () => { void vscode.commands.executeCommand('kat-comment-studio.scanAnchors'); },
    // requestRefresh
    () => { void vscode.commands.executeCommand('kat-comment-studio.refreshAnchors'); },
    // requestExport
    () => { void vscode.commands.executeCommand('kat-comment-studio.exportAnchors'); },
    // scope change
    (scopeId) => {
      updateAnchorViewState({ scopeId });
    },
    // type filter change
    (includedTypes) => {
      updateAnchorViewState({ includedTypes });
    },
    // search query change
    (searchQuery) => {
      updateAnchorViewState({ searchQuery });
    },
    // grid preference persistence
    (state) => {
      updateAnchorViewState(state, false);
    },
    // copy row
    (anchor) => {
      const displayPath = vscode.workspace.asRelativePath(anchor.filePath, false) || anchor.filePath;
      void vscode.env.clipboard.writeText(formatAnchorCopyRow(anchor, displayPath));
    },
    // copy cell
    (text) => {
      void vscode.env.clipboard.writeText(text);
    },
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AnchorsGridProvider.viewType, anchorsGridProvider),
  );

  function getCurrentAnchorFilterContext(): AnchorFilterContext {
    return {
      activeFilePath: vscode.window.activeTextEditor?.document.uri.scheme === 'file'
        ? vscode.window.activeTextEditor.document.uri.fsPath
        : undefined,
      openDocumentPaths: [...new Set(
        vscode.workspace.textDocuments
          .filter(document => document.uri.scheme === 'file')
          .map(document => document.uri.fsPath),
      )],
      workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(folder => ({
        name: folder.name,
        path: folder.uri.fsPath,
      })),
    };
  }

  function getAnchorScopeOptions(): AnchorScopeOption[] {
    return buildAnchorScopeOptions(anchorCache.getAll(), getCurrentAnchorFilterContext());
  }

  function persistAnchorViewState(): Thenable<void> {
    return context.workspaceState.update(anchorViewStateStorageKey, anchorViewState);
  }

  function updateAnchorViewState(state: Partial<AnchorViewState>, refreshPresentation = true): void {
    anchorViewState = normalizeAnchorViewState({
      ...anchorViewState,
      ...state,
    });

    void persistAnchorViewState();

    if (refreshPresentation) {
      refreshAnchorPresentation();
    }
  }

  function refreshAnchorPresentation(): void {
    if (isRefreshingAnchorPresentation) {
      return;
    }

    isRefreshingAnchorPresentation = true;
    try {
      const allAnchors = anchorCache.getAll();
      const filterContext = getCurrentAnchorFilterContext();
      const scopeOptions = buildAnchorScopeOptions(allAnchors, filterContext);
      const scopeId = ensureValidScopeId(anchorViewState.scopeId, scopeOptions);

      if (scopeId !== anchorViewState.scopeId) {
        anchorViewState = {
          ...anchorViewState,
          scopeId,
        };
        void persistAnchorViewState();
      }

      const effectiveState = {
        ...anchorViewState,
        scopeId,
      };
      const scopeOnlyAnchors = filterAnchors(allAnchors, {
        scopeId,
        includedTypes: undefined,
        searchQuery: '',
      }, filterContext);
      const filteredAnchors = filterAnchors(allAnchors, effectiveState, filterContext);
      const scopeLabel = getScopeLabel(scopeId, scopeOptions);

      anchorTreeProvider.setAnchors(allAnchors);
      anchorTreeProvider.updateViewState(effectiveState, filterContext);

      treeView.title = 'KAT Comment Studio';
      treeView.description = filteredAnchors.length === allAnchors.length
        ? `${filteredAnchors.length}`
        : `${filteredAnchors.length}/${allAnchors.length}`;

      anchorsGridProvider.updateModel({
        anchors: scopeOnlyAnchors,
        availableTypes: getAvailableAnchorTypes(scopeOnlyAnchors),
        filteredCount: filteredAnchors.length,
        totalCount: allAnchors.length,
        scopeLabel,
        scopeOptions,
        state: effectiveState,
        scopeRootPath: resolveScopeRootPath(scopeId, filterContext, allAnchors),
      });
    } finally {
      isRefreshingAnchorPresentation = false;
    }
  }

  // Resolve scan options from settings
  const scanOptions = {
    fileExtensions: config.fileExtensionsToScan.split(',').map(e => e.trim()).filter(e => e),
    ignoredFolders: config.foldersToIgnore.split(',').map(f => f.trim()).filter(f => f),
    customTags: config.customTags ? config.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined,
    customTagPrefixes: config.tagPrefixes ? config.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined,
  };

  anchorCache.load(context);
  refreshAnchorPresentation();

  // Auto-scan on activation (non-blocking, respects scanOnLoad setting)
  if (config.scanOnLoad) {
    void Promise.all([
      scanWorkspace(scanOptions),
      discoverWorkspaceProjects(scanOptions.ignoredFolders),
    ]).then(async ([results, projects]) => {
      currentIgnoredFolders = scanOptions.ignoredFolders;
      discoveredProjects = projects;
      const enrichedAnchors = await enrichAnchorsWithMetadata(results, projects);
      anchorCache.replaceAll(enrichedAnchors);
      refreshAnchorPresentation();
      await anchorCache.save(context);
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
      currentIgnoredFolders = opts.ignoredFolders;
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for code anchors...', cancellable: true },
        async (progress, token) => {
          const [results, projects] = await Promise.all([
            scanWorkspace(opts, token, progress),
            discoverWorkspaceProjects(opts.ignoredFolders),
          ]);
          discoveredProjects = projects;
          const enrichedAnchors = await enrichAnchorsWithMetadata(results, projects);
          anchorCache.replaceAll(enrichedAnchors);
          refreshAnchorPresentation();
          await anchorCache.save(context);
          vscode.window.showInformationMessage(`Found ${enrichedAnchors.length} code anchors.`);
        },
      );
    }),
  );

  // Export anchors command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.exportAnchors', async () => {
      const allAnchors = anchorCache.getAll();
      if (allAnchors.length === 0) {
        vscode.window.showWarningMessage('No anchors to export. Run "Scan Code Anchors" first.');
        return;
      }
      const filtered = filterAnchors(allAnchors, anchorViewState, getCurrentAnchorFilterContext());
      if (filtered.length === 0) {
        vscode.window.showWarningMessage('No anchors match the current filters.');
        return;
      }
      await exportAnchorsToFile(filtered);
    }),
  );

  // Refresh anchors command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.refreshAnchors', () => {
      void vscode.commands.executeCommand('kat-comment-studio.scanAnchors');
    }),
  );

  // Show anchors grid command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.showAnchorsGrid', () => {
      void vscode.commands.executeCommand('kat-comment-studio.anchorsGrid.focus');
    }),
  );

  // Scope change command
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.setAnchorScope', async () => {
      const scopeOptions = getAnchorScopeOptions();
      const pick = await vscode.window.showQuickPick(
        scopeOptions.map(option => ({
          label: option.label,
          value: option.id,
          description: option.id === anchorViewState.scopeId ? 'Current' : option.description,
          detail: option.enabled ? undefined : 'Unavailable in the current editor/workspace state',
        })),
        { placeHolder: 'Select anchor scope' },
      );
      if (pick) {
        const option = scopeOptions.find(candidate => candidate.id === pick.value);
        if (!option?.enabled) {
          void vscode.window.showInformationMessage('That scope is unavailable until the required editor/workspace context exists.');
          return;
        }

        updateAnchorViewState({ scopeId: pick.value as AnchorScopeId });
      }
    }),
  );

  // Type filter command (include custom tags)
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.filterAnchorTypes', async () => {
      const filterContext = getCurrentAnchorFilterContext();
      const scopeAnchors = filterAnchors(anchorCache.getAll(), {
        scopeId: ensureValidScopeId(anchorViewState.scopeId, buildAnchorScopeOptions(anchorCache.getAll(), filterContext)),
        includedTypes: undefined,
        searchQuery: '',
      }, filterContext);
      const availableTypes = getAvailableAnchorTypes(scopeAnchors);
      if (availableTypes.length === 0) {
        void vscode.window.showInformationMessage('No anchor types are available in the current scope.');
        return;
      }

      const currentIncludedTypes = anchorViewState.includedTypes;
      const picks: { label: string; value: string; picked: boolean }[] = availableTypes.map(type => ({
        label: BUILTIN_ANCHOR_TYPES.get(type)?.displayName ?? type,
        value: type,
        picked: !currentIncludedTypes || currentIncludedTypes.includes(type),
      }));

      const selected = await vscode.window.showQuickPick(
        picks,
        { placeHolder: 'Select anchor types to show', canPickMany: true },
      );
      if (selected) {
        const includedTypes = selected.length === picks.length
          ? undefined
          : selected.map(pickItem => pickItem.value);
        updateAnchorViewState({ includedTypes });
      }
    }),
  );

  // Update cache on document save
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(() => {
      refreshAnchorPresentation();
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      refreshAnchorPresentation();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      refreshAnchorPresentation();
    }),
    vscode.workspace.onDidSaveTextDocument(async document => {
      if (document.uri.scheme !== 'file') {
        return;
      }

      const currentConfig = getConfiguration();
      currentIgnoredFolders = currentConfig.foldersToIgnore.split(',').map(folder => folder.trim()).filter(folder => folder);

      if (document.uri.fsPath.toLowerCase().endsWith('.csproj')) {
        discoveredProjects = await discoverWorkspaceProjects(currentIgnoredFolders);
        const enrichedAnchors = await enrichAnchorsWithMetadata(anchorCache.getAll(), discoveredProjects);
        anchorCache.replaceAll(enrichedAnchors);
        refreshAnchorPresentation();
        await anchorCache.save(context);
        return;
      }

      const customTags = currentConfig.customTags ? currentConfig.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t) : undefined;
      const tagPrefixes = currentConfig.tagPrefixes ? currentConfig.tagPrefixes.split(',').map(p => p.trim()).filter(p => p) : undefined;
      const anchors = scanDocument(document, customTags, tagPrefixes);
      if (discoveredProjects.length === 0) {
        discoveredProjects = await discoverWorkspaceProjects(currentIgnoredFolders);
      }
      const enrichedAnchors = await enrichAnchorsWithMetadata(anchors, discoveredProjects);
      anchorCache.update(document.uri.fsPath, enrichedAnchors);
      refreshAnchorPresentation();
      await anchorCache.save(context);
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
