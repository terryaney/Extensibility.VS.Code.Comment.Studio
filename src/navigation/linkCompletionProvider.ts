import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AnchorMatch } from '../anchors/anchorService';
import { AnchorCache } from '../anchors/anchorCache';

/**
 * CompletionItemProvider for LINK: syntax in comments.
 * Provides file path completions and anchor name completions.
 */
export class LinkCompletionProvider implements vscode.CompletionItemProvider {
  private anchorCache: AnchorCache;

  constructor(anchorCache: AnchorCache) {
    this.anchorCache = anchorCache;
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionItem[] | undefined> {
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Only activate inside comments after LINK:
    const linkMatch = textBeforeCursor.match(/\bLINK:\s*(.*)$/);
    if (!linkMatch) return;

    const afterLink = linkMatch[1];
    const items: vscode.CompletionItem[] = [];

    // Local anchor completion: LINK: #
    if (afterLink.startsWith('#') || afterLink === '') {
      const anchors = this.anchorCache.getAll().filter(a => a.anchorName);
      const seenNames = new Set<string>();

      for (const anchor of anchors) {
        if (!anchor.anchorName || seenNames.has(anchor.anchorName)) continue;
        seenNames.add(anchor.anchorName);

        const item = new vscode.CompletionItem(
          `#${anchor.anchorName}`,
          vscode.CompletionItemKind.Reference,
        );
        item.detail = `${anchor.tag} in ${path.basename(anchor.filePath)}:${anchor.lineNumber + 1}`;
        item.documentation = anchor.description;
        items.push(item);
      }
    }

    // File path completion
    if (!afterLink.startsWith('#')) {
      const partialPath = afterLink.trim();
      const baseDir = path.dirname(document.uri.fsPath);
      const resolvedDir = partialPath.includes('/')
        ? path.resolve(baseDir, path.dirname(partialPath))
        : baseDir;

      try {
        if (fs.existsSync(resolvedDir)) {
          const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
          const prefix = partialPath.includes('/')
            ? partialPath.substring(0, partialPath.lastIndexOf('/') + 1)
            : '';

          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            // Skip common non-code directories
            if (entry.isDirectory() && ['node_modules', 'bin', 'obj', '.git', 'dist', 'out'].includes(entry.name)) continue;

            const kind = entry.isDirectory()
              ? vscode.CompletionItemKind.Folder
              : vscode.CompletionItemKind.File;

            const item = new vscode.CompletionItem(
              prefix + entry.name + (entry.isDirectory() ? '/' : ''),
              kind,
            );
            items.push(item);
          }
        }
      } catch {
        // Ignore file system errors
      }
    }

    return items;
  }
}
