import * as vscode from 'vscode';
import { AnchorMatch, BUILTIN_ANCHOR_TYPES } from './anchorService';
import { generateAnchorsGridHtml } from './anchorsGridWebview';
import { AnchorScopeId, AnchorScopeOption, AnchorViewState, createDefaultAnchorViewState } from './anchorViewState';

export interface AnchorsGridModel {
  anchors: AnchorMatch[];
  availableTypes: string[];
  filteredCount: number;
  totalCount: number;
  scopeLabel: string;
  scopeOptions: AnchorScopeOption[];
  state: AnchorViewState;
  scopeRootPath?: string;
}

/**
 * WebviewViewProvider for the Code Anchors grid panel.
 * Displays anchors in a sortable, filterable HTML table
 * in the bottom panel alongside Problems, Output, etc.
 */
export class AnchorsGridProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'kat-comment-studio.anchorsGrid';

  private view: vscode.WebviewView | undefined;
  private _webviewReady = false;
  private _lastBadgeCount = 0;
  private model: AnchorsGridModel = {
    anchors: [],
    availableTypes: [],
    filteredCount: 0,
    totalCount: 0,
    scopeLabel: 'Workspace',
    scopeOptions: [],
    state: createDefaultAnchorViewState(),
    scopeRootPath: undefined,
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onNavigate: (filePath: string, lineNumber: number) => void,
    private readonly onRequestScan: () => void,
    private readonly onRequestRefresh: () => void,
    private readonly onRequestExport: () => void,
    private readonly onScopeChange: (scopeId: AnchorScopeId) => void,
    private readonly onTypeFilterChange: (includedTypes?: string[]) => void,
    private readonly onSearchQueryChange: (searchQuery: string) => void,
    private readonly onPersistGridState: (state: Partial<AnchorViewState>) => void,
    private readonly onCopyRow: (anchor: AnchorMatch) => void,
    private readonly onCopyText: (text: string) => void,
    private readonly log: (message: string) => void = console.log,
    private readonly onViewResolved: () => void = () => {},
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this._webviewReady = false;
    this.log(`[KAT] resolveWebviewView called, model has ${this.model.anchors.length} anchors`);

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons'),
      ],
    };

    const nonce = getNonce();
    const codiconsCssUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
    );
    const cspSource = webviewView.webview.cspSource;
    webviewView.webview.html = generateAnchorsGridHtml(nonce, codiconsCssUri.toString(), cspSource);

    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.type) {
        case 'webviewReady':
          this.log('[KAT] webviewReady received, pushing model');
          this._webviewReady = true;
          this.pushModel();
          break;
        case 'navigateTo':
          this.onNavigate(message.filePath, message.lineNumber);
          break;
        case 'requestScan':
          this.onRequestScan();
          break;
        case 'requestRefresh':
          this.onRequestRefresh();
          break;
        case 'requestExport':
          this.onRequestExport();
          break;
        case 'setScope':
          this.onScopeChange(message.scopeId);
          break;
        case 'setTypeFilter':
          this.onTypeFilterChange(message.includedTypes);
          break;
        case 'showTypeFilter':
          void this.showTypeFilterPicker();
          break;
        case 'setSearchQuery':
          this.log(`[KAT-BADGE] provider received setSearchQuery: '${message.searchQuery ?? ''}'`);
          this.onSearchQueryChange(message.searchQuery ?? '');
          break;
        case 'debugLog':
          this.log(message.message as string);
          break;
        case 'persistGridState':
          this.onPersistGridState(message.state ?? {});
          break;
        case 'copyRow':
          this.onCopyRow(message.anchor);
          break;
        case 'copyCell':
          this.onCopyText(message.text ?? '');
          break;
        case 'openExternal':
          if (message.url && typeof message.url === 'string') {
            void vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.applyBadge(this._lastBadgeCount);
        this.pushModel();
      }
    });

    this.applyViewMetadata();
    this.applyBadge(this._lastBadgeCount);
    this.onViewResolved();
  }

  updateModel(model: AnchorsGridModel): void {
    this.log(`[KAT-BADGE] updateModel called, searchQuery='${model.state.searchQuery}', filteredCount=${model.filteredCount}`);
    this.model = { ...model };
    this.applyViewMetadata();
    this.log(`[KAT-BADGE] pushModel called with searchQuery='${this.model.state.searchQuery}'`);
    this.pushModel();
  }

  get isViewResolved(): boolean {
    return this.view !== undefined;
  }

  dispose(): void {
    this.view = undefined;
  }

  private async showTypeFilterPicker(): Promise<void> {
    const { availableTypes, state } = this.model;
    if (availableTypes.length === 0) {
      void vscode.window.showInformationMessage('No anchor types are available in the current scope.');
      return;
    }

    const currentIncludedTypes = state.includedTypes;
    const picks = availableTypes.map(type => ({
      label: BUILTIN_ANCHOR_TYPES.get(type)?.displayName ?? type,
      value: type,
      picked: !currentIncludedTypes || currentIncludedTypes.includes(type),
    }));

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Select anchor types to show',
      canPickMany: true,
    });

    if (selected) {
      const includedTypes = selected.length === picks.length
        ? undefined
        : selected.map(p => p.value);
      this.onTypeFilterChange(includedTypes);
    }
  }

  private applyViewMetadata(): void {
    if (!this.view) {
      return;
    }

    this.view.title = 'KAT Comment Studio - Code Anchors';

    const isFiltered = this.isFilterActive();

    this.view.description = isFiltered
      ? `⊜ ${this.model.scopeLabel}`
      : this.model.scopeLabel;
  }

  applyBadge(count: number): void {
    this._lastBadgeCount = count;
    if (!this.view) {
      return;
    }

    // Always set a ViewBadge object — never undefined.
    // WebviewView.badge = undefined is unreliable (VS Code doesn't always clear the UI).
    // { value: 0 } causes VS Code to hide the badge naturally.
    const isFiltered = this.isFilterActive();
    this.view.badge = {
      tooltip: count > 0
        ? (isFiltered
            ? `Code Anchors (filtered ${count} of ${this.model.totalCount})`
            : `${count} code anchor${count === 1 ? '' : 's'}`)
        : '',
      value: count,
    };
  }

  private isFilterActive(): boolean {
    const { state } = this.model;
    return state.scopeId !== 'workspace'
      || state.includedTypes !== undefined
      || state.searchQuery.length > 0;
  }

  private pushModel(): void {
    if (!this.view) {
      return;
    }

    void this.view.webview.postMessage({
      type: 'updateModel',
      model: this.model,
    });
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let index = 0; index < 32; index++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
