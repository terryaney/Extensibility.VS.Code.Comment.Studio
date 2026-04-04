import * as vscode from 'vscode';
import * as path from 'path';
import { AnchorMatch, BUILTIN_ANCHOR_TYPES } from './anchorService';

export type AnchorScope = 'workspace' | 'folder' | 'document' | 'openDocuments';

export class AnchorTreeItem extends vscode.TreeItem {
  constructor(
    public readonly anchor?: AnchorMatch,
    public readonly isFileGroup?: boolean,
    label?: string,
    collapsibleState?: vscode.TreeItemCollapsibleState,
  ) {
    super(label || '', collapsibleState);

    if (anchor && !isFileGroup) {
      this.label = `${anchor.tag}: ${anchor.description || '(no description)'}`;
      this.description = [
        anchor.owner ? `@${anchor.owner}` : undefined,
        anchor.dueDate,
      ].filter(Boolean).join(' · ') || undefined;
      this.tooltip = this.buildTooltip(anchor);

      const anchorType = BUILTIN_ANCHOR_TYPES.get(anchor.tag);
      if (anchorType) {
        this.iconPath = new vscode.ThemeIcon(anchorType.icon, new vscode.ThemeColor(anchorType.themeColorId));
      } else {
        // Custom tag — use tag icon with custom color
        this.iconPath = new vscode.ThemeIcon('tag', new vscode.ThemeColor('katCommentStudio.anchorCustom'));
      }

      this.command = {
        command: 'vscode.open',
        title: 'Go to Anchor',
        arguments: [
          vscode.Uri.file(anchor.filePath),
          { selection: new vscode.Range(anchor.lineNumber, anchor.column, anchor.lineNumber, anchor.column + anchor.fullText.length) },
        ],
      };

      this.contextValue = 'anchor';
    }
  }

  private buildTooltip(anchor: AnchorMatch): vscode.MarkdownString {
    const anchorType = BUILTIN_ANCHOR_TYPES.get(anchor.tag);
    const icon = anchorType?.icon || 'tag';

    const md = new vscode.MarkdownString();
    md.supportThemeIcons = true;

    md.appendMarkdown(`$(${icon}) **${anchor.tag}:**`);
    if (anchor.owner) md.appendMarkdown(` *@${anchor.owner}*`);
    if (anchor.issueRef) md.appendMarkdown(` ${anchor.issueRef}`);
    if (anchor.dueDate) {
      const now = new Date();
      const due = new Date(anchor.dueDate + 'T00:00:00');
      const isOverdue = due < now;
      const dateIcon = isOverdue ? '$(warning)' : '$(calendar)';
      md.appendMarkdown(` ${dateIcon} ${anchor.dueDate}`);
      if (isOverdue) md.appendMarkdown(' *(overdue)*');
    }
    md.appendMarkdown('\n\n');
    md.appendMarkdown(anchor.description || '(no description)');
    md.appendMarkdown(`\n\n---\n$(file) *${path.basename(anchor.filePath)}:${anchor.lineNumber + 1}*`);
    return md;
  }
}

export class AnchorTreeProvider implements vscode.TreeDataProvider<AnchorTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AnchorTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private anchors: AnchorMatch[] = [];
  private scope: AnchorScope = 'workspace';
  private typeFilter: Set<string> | undefined;
  private searchQuery = '';

  setAnchors(anchors: AnchorMatch[]): void {
    this.anchors = anchors;
    this._onDidChangeTreeData.fire(undefined);
  }

  setScope(scope: AnchorScope): void {
    this.scope = scope;
    this._onDidChangeTreeData.fire(undefined);
  }

  setTypeFilter(types: string[] | undefined): void {
    this.typeFilter = types ? new Set(types) : undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query.toLowerCase();
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: AnchorTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnchorTreeItem): AnchorTreeItem[] {
    if (!element) {
      // Root level: group by file
      return this.getFileGroups();
    }

    if (element.isFileGroup && element.label) {
      // File group: show anchors in this file
      const filePath = typeof element.label === 'string' ? element.label : '';
      return this.getFilteredAnchors()
        .filter(a => this.getRelativePath(a.filePath) === filePath)
        .map(a => new AnchorTreeItem(a, false));
    }

    return [];
  }

  private getFileGroups(): AnchorTreeItem[] {
    const filtered = this.getFilteredAnchors();
    const byFile = new Map<string, AnchorMatch[]>();

    for (const anchor of filtered) {
      const relPath = this.getRelativePath(anchor.filePath);
      const existing = byFile.get(relPath) || [];
      existing.push(anchor);
      byFile.set(relPath, existing);
    }

    return [...byFile.entries()].map(([filePath, anchors]) => {
      const item = new AnchorTreeItem(
        undefined,
        true,
        filePath,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.description = `(${anchors.length})`;
      item.iconPath = vscode.ThemeIcon.File;
      return item;
    });
  }

  private getFilteredAnchors(): AnchorMatch[] {
    let filtered = this.anchors;

    if (this.typeFilter) {
      filtered = filtered.filter(a => this.typeFilter!.has(a.tag));
    }

    if (this.searchQuery) {
      filtered = filtered.filter(a =>
        a.description.toLowerCase().includes(this.searchQuery) ||
        a.tag.toLowerCase().includes(this.searchQuery) ||
        (a.owner && a.owner.toLowerCase().includes(this.searchQuery)),
      );
    }

    return filtered;
  }

  private getRelativePath(filePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        if (filePath.startsWith(folder.uri.fsPath)) {
          return path.relative(folder.uri.fsPath, filePath);
        }
      }
    }
    return filePath;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
