import * as vscode from 'vscode';
import { AnchorMatch } from './anchorService';
import { generateAnchorsGridHtml } from './anchorsGridWebview';

/**
 * WebviewViewProvider for the Code Anchors grid panel.
 * Displays anchors in a sortable, filterable HTML table
 * in the bottom panel alongside Problems, Output, etc.
 */
export class AnchorsGridProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kat-comment-studio.anchorsGrid';

  private view: vscode.WebviewView | undefined;
  private anchors: AnchorMatch[] = [];
  private scopeLabel = 'Workspace';

  constructor(
    private readonly onNavigate: (filePath: string, lineNumber: number) => void,
    private readonly onRequestScan: () => void,
    private readonly onRequestRefresh: () => void,
    private readonly onRequestExport: () => void,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    const nonce = getNonce();
    webviewView.webview.html = generateAnchorsGridHtml(nonce);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.type) {
        case 'navigateTo':
          this.onNavigate(message.filePath, message.lineNumber);
          break;
        case 'requestScan':
          this.onRequestScan();
          break;
        case 'requestRefresh':
          this.onRequestRefresh();
          // Send current data to webview
          this.pushAnchors();
          break;
        case 'requestExport':
          this.onRequestExport();
          break;
      }
    });

    // When the view becomes visible again, re-send data
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.pushAnchors();
      }
    });

    // Send initial data
    this.pushAnchors();
  }

  /**
   * Updates the grid with new anchor data.
   */
  updateAnchors(anchors: AnchorMatch[]): void {
    this.anchors = anchors;
    this.pushAnchors();
  }

  /**
   * Updates the scope label shown in the toolbar.
   */
  updateScope(scope: string): void {
    this.scopeLabel = scope;
    this.view?.webview.postMessage({ type: 'updateScope', scope });
  }

  private pushAnchors(): void {
    if (this.view?.visible) {
      this.view.webview.postMessage({
        type: 'updateAnchors',
        anchors: this.anchors,
      });
    }
  }

  dispose(): void {
    this.view = undefined;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
