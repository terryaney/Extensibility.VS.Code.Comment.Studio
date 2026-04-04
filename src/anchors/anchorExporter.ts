import * as vscode from 'vscode';
import * as path from 'path';
import { AnchorMatch } from './anchorService';

export type ExportFormat = 'tsv' | 'csv' | 'markdown' | 'json';

/**
 * Exports anchors to the specified format.
 */
export function exportAnchors(anchors: AnchorMatch[], format: ExportFormat): string {
  switch (format) {
    case 'tsv': return exportTsv(anchors);
    case 'csv': return exportCsv(anchors);
    case 'markdown': return exportMarkdown(anchors);
    case 'json': return exportJson(anchors);
  }
}

function exportTsv(anchors: AnchorMatch[]): string {
  const header = 'Type\tFile\tLine\tOwner\tIssue\tDue Date\tDescription';
  const rows = anchors.map(a =>
    `${a.tag}\t${relativePath(a.filePath)}\t${a.lineNumber + 1}\t${a.owner || ''}\t${a.issueRef || ''}\t${a.dueDate || ''}\t${a.description}`
  );
  return [header, ...rows].join('\n');
}

function exportCsv(anchors: AnchorMatch[]): string {
  const header = 'Type,File,Line,Owner,Issue,Due Date,Description';
  const rows = anchors.map(a =>
    `${csvEscape(a.tag)},${csvEscape(relativePath(a.filePath))},${a.lineNumber + 1},${csvEscape(a.owner || '')},${csvEscape(a.issueRef || '')},${csvEscape(a.dueDate || '')},${csvEscape(a.description)}`
  );
  return [header, ...rows].join('\n');
}

function exportMarkdown(anchors: AnchorMatch[]): string {
  const lines: string[] = [];
  lines.push('# Code Anchors');
  lines.push('');
  lines.push('| Type | File | Line | Owner | Issue | Due Date | Description |');
  lines.push('|------|------|------|-------|-------|----------|-------------|');
  for (const a of anchors) {
    lines.push(`| ${a.tag} | ${relativePath(a.filePath)} | ${a.lineNumber + 1} | ${a.owner || ''} | ${a.issueRef || ''} | ${a.dueDate || ''} | ${a.description} |`);
  }
  return lines.join('\n');
}

function exportJson(anchors: AnchorMatch[]): string {
  const data = anchors.map(a => ({
    type: a.tag,
    file: relativePath(a.filePath),
    line: a.lineNumber + 1,
    owner: a.owner || null,
    issue: a.issueRef || null,
    anchorName: a.anchorName || null,
    dueDate: a.dueDate || null,
    description: a.description,
  }));
  return JSON.stringify(data, null, 2);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function relativePath(filePath: string): string {
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

/**
 * Prompts the user to save exported anchors.
 */
export async function exportAnchorsToFile(anchors: AnchorMatch[]): Promise<void> {
  const format = await vscode.window.showQuickPick(
    [
      { label: 'TSV (Tab-separated)', value: 'tsv' as ExportFormat },
      { label: 'CSV (Comma-separated)', value: 'csv' as ExportFormat },
      { label: 'Markdown', value: 'markdown' as ExportFormat },
      { label: 'JSON', value: 'json' as ExportFormat },
    ],
    { placeHolder: 'Select export format' },
  );

  if (!format) return;

  const content = exportAnchors(anchors, format.value);
  const ext = format.value === 'markdown' ? 'md' : format.value;

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`code-anchors.${ext}`),
    filters: {
      'All files': ['*'],
    },
  });

  if (uri) {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
    vscode.window.showInformationMessage(`Exported ${anchors.length} anchors to ${path.basename(uri.fsPath)}`);
  }
}
