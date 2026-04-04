import * as path from 'path';
import * as vscode from 'vscode';
import { AnchorMatch, BUILTIN_ANCHOR_TYPES } from './anchorService';
import { AnchorFilterContext, AnchorScopeId, AnchorViewState, createDefaultAnchorViewState, filterAnchors } from './anchorViewState';

export type AnchorScope = AnchorScopeId;

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
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<AnchorTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private anchors: AnchorMatch[] = [];
  private viewState = createDefaultAnchorViewState();
  private context: AnchorFilterContext = {
    activeFilePath: undefined,
    openDocumentPaths: [],
    workspaceFolders: [],
  };

  setAnchors(anchors: AnchorMatch[]): void {
    this.anchors = anchors;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  updateViewState(state: Pick<AnchorViewState, 'scopeId' | 'includedTypes' | 'searchQuery'>, context: AnchorFilterContext): void {
    this.viewState = {
      ...this.viewState,
      ...state,
    };
    this.context = context;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: AnchorTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AnchorTreeItem): AnchorTreeItem[] {
    if (!element) {
      return this.getFileGroups();
    }

    if (element.isFileGroup && element.label) {
      const relativePath = typeof element.label === 'string' ? element.label : '';
      return this.getFilteredAnchors()
        .filter(anchor => this.getRelativePath(anchor.filePath) === relativePath)
        .sort((left, right) => left.lineNumber - right.lineNumber)
        .map(anchor => new AnchorTreeItem(anchor, false));
    }

    return [];
  }

  private getFileGroups(): AnchorTreeItem[] {
    const byFile = new Map<string, AnchorMatch[]>();

    for (const anchor of this.getFilteredAnchors()) {
      const relativePath = this.getRelativePath(anchor.filePath);
      const fileAnchors = byFile.get(relativePath) ?? [];
      fileAnchors.push(anchor);
      byFile.set(relativePath, fileAnchors);
    }

    return [...byFile.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([relativePath, anchors]) => {
        const item = new AnchorTreeItem(
          undefined,
          true,
          relativePath,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.description = `(${anchors.length})`;
        item.iconPath = vscode.ThemeIcon.File;
        return item;
      });
  }

  private getFilteredAnchors(): AnchorMatch[] {
    return filterAnchors(this.anchors, this.viewState, this.context);
  }

  private getRelativePath(filePath: string): string {
    const workspaceRelativePath = vscode.workspace.asRelativePath(filePath, false);
    return workspaceRelativePath || filePath;
  }

  dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }
}
