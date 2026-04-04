import * as vscode from 'vscode';
import { AnchorMatch, findAnchorsInText, BUILTIN_ANCHOR_TYPES } from './anchorService';

export interface ScanOptions {
  fileExtensions: string[];
  ignoredFolders: string[];
  customTags?: string[];
  customTagPrefixes?: string[];
}

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  fileExtensions: ['cs', 'vb', 'fs', 'cpp', 'c', 'h', 'ts', 'tsx', 'js', 'jsx', 'razor', 'cshtml', 'sql', 'ps1', 'psm1'],
  ignoredFolders: ['node_modules', 'bin', 'obj', '.git', 'dist', 'out', 'build', '.vs', '.vscode-test'],
};

/**
 * Scans the workspace for anchor comments.
 */
export async function scanWorkspace(
  options?: Partial<ScanOptions>,
  token?: vscode.CancellationToken,
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
): Promise<AnchorMatch[]> {
  const mergedOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };
  const allMatches: AnchorMatch[] = [];

  const extensionGlob = `**/*.{${mergedOptions.fileExtensions.join(',')}}`;
  const ignoreGlob = `{${mergedOptions.ignoredFolders.map(f => `**/${f}/**`).join(',')}}`;

  const files = await vscode.workspace.findFiles(extensionGlob, ignoreGlob);
  const totalFiles = files.length;

  if (totalFiles === 0) return [];

  const allTags = [...BUILTIN_ANCHOR_TYPES.keys()];
  if (mergedOptions.customTags) {
    allTags.push(...mergedOptions.customTags);
  }

  // Process files in batches for responsiveness
  const batchSize = 50;
  let processed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    if (token?.isCancellationRequested) break;

    const batch = files.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const content = await readFileText(file);
          return findAnchorsInText(content, file.fsPath, allTags, mergedOptions.customTagPrefixes);
        } catch {
          return [];
        }
      }),
    );

    for (const results of batchResults) {
      allMatches.push(...results);
    }

    processed += batch.length;
    progress?.report({
      message: `Scanning files... (${processed}/${totalFiles})`,
      increment: (batch.length / totalFiles) * 100,
    });
  }

  return allMatches;
}

/**
 * Scans a single document for anchors.
 */
export function scanDocument(
  document: vscode.TextDocument,
  customTags?: string[],
  customTagPrefixes?: string[],
): AnchorMatch[] {
  const allTags = [...BUILTIN_ANCHOR_TYPES.keys()];
  if (customTags) {
    allTags.push(...customTags);
  }
  return findAnchorsInText(document.getText(), document.uri.fsPath, allTags, customTagPrefixes);
}

async function readFileText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf-8');
}
