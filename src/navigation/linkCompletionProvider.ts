import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AnchorCache } from '../anchors/anchorCache';
import { resolvePathBase } from './linkAnchorParser';

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

        // Local anchor completion: LINK: # or empty
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
            const resolved = resolvePathBase(partialPath, document.uri.fsPath);

            if (resolved) {
                const { baseDir, remainingPath, prefix } = resolved;

                // Split remaining path into traversed segments and partial filename
                const segments = remainingPath.split(/[/\\]/).filter(Boolean);
                let currentDir = baseDir;

                // Walk traversed directory segments
                if (segments.length > 1) {
                    const traversed = segments.slice(0, -1);
                    currentDir = path.join(baseDir, ...traversed);
                }
                // If remaining ends with /, all segments are traversed, list dir
                const endsWithSlash = remainingPath.endsWith('/') || remainingPath.endsWith('\\');
                if (endsWithSlash && segments.length > 0) {
                    currentDir = path.join(baseDir, ...segments);
                }

                // Reconstruct the prefix for display (prefix + traversed dirs)
                const traversedSegments = endsWithSlash ? segments : segments.slice(0, -1);
                const displayPrefix = prefix + (traversedSegments.length > 0 ? traversedSegments.join('/') + '/' : '');

                // Calculate the replacement range: from LINK: to cursor
                const linkPrefixStart = textBeforeCursor.lastIndexOf(afterLink);
                const rangeStart = new vscode.Position(position.line, linkPrefixStart);
                const rangeEnd = position;
                const replaceRange = new vscode.Range(rangeStart, rangeEnd);

                try {
                    if (fs.existsSync(currentDir) && fs.statSync(currentDir).isDirectory()) {
                        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

                        for (const entry of entries) {
                            if (entry.name.startsWith('.')) continue;
                            if (entry.isDirectory() && ['node_modules', 'bin', 'obj', '.git', 'dist', 'out'].includes(entry.name)) continue;

                            const isDir = entry.isDirectory();
                            const kind = isDir
                                ? vscode.CompletionItemKind.Folder
                                : vscode.CompletionItemKind.File;

                            const fullLabel = displayPrefix + entry.name + (isDir ? '/' : '');
                            const item = new vscode.CompletionItem(fullLabel, kind);

                            // insertText replaces the entire after-LINK: portion
                            item.insertText = fullLabel;
                            item.filterText = fullLabel;
                            item.range = replaceRange;
                            item.sortText = (isDir ? '0' : '1') + entry.name;

                            // Re-trigger suggestions after accepting a directory
                            if (isDir) {
                                item.command = {
                                    command: 'editor.action.triggerSuggest',
                                    title: 'Re-trigger completions',
                                };
                            }

                            items.push(item);
                        }
                    }
                } catch {
                    // Ignore file system errors
                }
            }
        }

        return items;
    }
}
