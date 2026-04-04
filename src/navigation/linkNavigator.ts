import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { parseLinkAnchors, resolveLinkTarget, LinkAnchorTarget } from './linkAnchorParser';

/**
 * Provides clickable links for LINK: syntax in comments.
 */
export class LinkAnchorLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const lines = document.getText().split(/\r?\n/);

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const targets = parseLinkAnchors(line);

      for (const target of targets) {
        const range = new vscode.Range(lineNum, target.pathStart, lineNum, target.pathStart + target.pathLength);
        const resolvedPath = resolveLinkTarget(target, document.uri.fsPath);

        let uri: vscode.Uri;
        if (target.isLocalAnchor) {
          // Local anchor - navigate within same file
          uri = document.uri.with({ fragment: `anchor:${target.anchorName}` });
        } else {
          uri = vscode.Uri.file(resolvedPath);
        }

        const link = new vscode.DocumentLink(range, uri);
        link.tooltip = buildTooltip(target, resolvedPath);
        links.push(link);
      }
    }

    return links;
  }
}

/**
 * Provides hover information for LINK: targets.
 */
export class LinkAnchorHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.Hover | undefined {
    const line = document.lineAt(position.line).text;
    const targets = parseLinkAnchors(line);

    for (const target of targets) {
      if (position.character >= target.pathStart && position.character <= target.pathStart + target.pathLength) {
        const resolvedPath = resolveLinkTarget(target, document.uri.fsPath);
        const exists = target.isLocalAnchor || fileExists(resolvedPath);

        const md = new vscode.MarkdownString();
        if (exists) {
          md.appendMarkdown(`**LINK:** ${target.targetPath || '#' + target.anchorName}\n\n`);
          if (target.lineNumber) {
            md.appendMarkdown(`Line ${target.lineNumber}`);
            if (target.endLineNumber) {
              md.appendMarkdown(`-${target.endLineNumber}`);
            }
            md.appendMarkdown('\n\n');
          }
          md.appendMarkdown(`✅ Target exists: \`${path.basename(resolvedPath)}\``);
        } else {
          md.appendMarkdown(`**LINK:** ${target.targetPath}\n\n`);
          md.appendMarkdown(`❌ Target not found: \`${resolvedPath}\``);
        }

        const range = new vscode.Range(position.line, target.pathStart, position.line, target.pathStart + target.pathLength);
        return new vscode.Hover(md, range);
      }
    }

    return undefined;
  }
}

/**
 * Navigates to a LINK: target.
 */
export async function navigateToLinkTarget(target: LinkAnchorTarget, baseFilePath: string): Promise<void> {
  const resolvedPath = resolveLinkTarget(target, baseFilePath);

  if (target.isLocalAnchor && target.anchorName) {
    // Search for ANCHOR(name) in current document
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const text = editor.document.getText();
      const anchorRegex = new RegExp(`\\bANCHOR\\(${escapeRegex(target.anchorName)}\\)`, 'i');
      const match = anchorRegex.exec(text);
      if (match) {
        const pos = editor.document.positionAt(match.index);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }
    return;
  }

  if (!fileExists(resolvedPath)) {
    vscode.window.showWarningMessage(`LINK target not found: ${target.targetPath}`);
    return;
  }

  const doc = await vscode.workspace.openTextDocument(resolvedPath);
  const editor = await vscode.window.showTextDocument(doc);

  if (target.lineNumber) {
    const line = Math.max(0, target.lineNumber - 1);
    const endLine = target.endLineNumber ? Math.max(0, target.endLineNumber - 1) : line;
    const range = new vscode.Range(line, 0, endLine, doc.lineAt(endLine).text.length);
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  } else if (target.anchorName) {
    // Search for ANCHOR(name) in target file
    const text = doc.getText();
    const anchorRegex = new RegExp(`\\bANCHOR\\(${escapeRegex(target.anchorName)}\\)`, 'i');
    const match = anchorRegex.exec(text);
    if (match) {
      const pos = doc.positionAt(match.index);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  }
}

function buildTooltip(target: LinkAnchorTarget, resolvedPath: string): string {
  if (target.isLocalAnchor) {
    return `Navigate to anchor: ${target.anchorName}`;
  }
  let tooltip = `Open: ${path.basename(resolvedPath)}`;
  if (target.lineNumber) {
    tooltip += `:${target.lineNumber}`;
    if (target.endLineNumber) {
      tooltip += `-${target.endLineNumber}`;
    }
  }
  if (target.anchorName) {
    tooltip += `#${target.anchorName}`;
  }
  return tooltip;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
