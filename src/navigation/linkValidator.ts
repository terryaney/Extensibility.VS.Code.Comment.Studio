import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseLinkAnchors, resolveLinkTarget } from './linkAnchorParser';

/**
 * DiagnosticCollection for LINK: validation.
 * Shows warning squiggles on broken LINK: references.
 */
export class LinkValidator implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('kat-comment-studio-links');

    this.disposables.push(
      this.diagnosticCollection,
      vscode.workspace.onDidChangeTextDocument(event => {
        this.validateDocument(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument(document => {
        this.validateDocument(document);
      }),
      vscode.workspace.onDidOpenTextDocument(document => {
        this.validateDocument(document);
      }),
      vscode.workspace.onDidCloseTextDocument(document => {
        this.diagnosticCollection.delete(document.uri);
      }),
    );

    // Validate all open documents
    for (const document of vscode.workspace.textDocuments) {
      this.validateDocument(document);
    }
  }

  private validateDocument(document: vscode.TextDocument): void {
    const diagnostics: vscode.Diagnostic[] = [];
    const lines = document.getText().split(/\r?\n/);

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const targets = parseLinkAnchors(line);

      for (const target of targets) {
        // Skip local anchors UNLESS they have a syntax error we can flag
        if (target.isLocalAnchor && !target.invalidCombinedSyntax) continue;

        if (target.missingFilePath) {
          const range = new vscode.Range(
            lineNum, target.pathStart,
            lineNum, target.pathStart + target.pathLength,
          );
          const msg = target.invalidCombinedSyntax
            ? 'LINK syntax error: missing file path, and cannot combine a line number with an anchor name. Use file.cs:42 or file.cs#AnchorName.'
            : 'LINK syntax error: missing file path. Use file.cs:42 to navigate to a line, or file.cs#AnchorName for an anchor.';
          const diagnostic = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
          diagnostic.source = 'KAT Comment Studio';
          diagnostic.code = 'invalid-link-syntax';
          diagnostics.push(diagnostic);
          continue;
        }

        if (target.invalidCombinedSyntax) {
          const range = new vscode.Range(
            lineNum, target.pathStart,
            lineNum, target.pathStart + target.pathLength,
          );
          const diagnostic = new vscode.Diagnostic(
            range,
            'LINK syntax error: cannot specify both a line number and an anchor name. Use file.cs:42 or file.cs#AnchorName.',
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = 'KAT Comment Studio';
          diagnostic.code = 'invalid-link-syntax';
          diagnostics.push(diagnostic);
          continue;
        }

        const resolvedPath = resolveLinkTarget(target, document.uri.fsPath);
        if (!fileExists(resolvedPath)) {
          const range = new vscode.Range(
            lineNum, target.pathStart,
            lineNum, target.pathStart + target.pathLength,
          );
          const diagnostic = new vscode.Diagnostic(
            range,
            `LINK target not found: ${target.targetPath}`,
            vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.source = 'KAT Comment Studio';
          diagnostic.code = 'broken-link';
          diagnostics.push(diagnostic);
        }
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}
