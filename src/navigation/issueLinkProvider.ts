import * as vscode from 'vscode';
import { getIssueUrl } from '../types';
import { getRepositoryInfo, getCachedRepositoryInfo } from './gitService';

const ISSUE_REF_REGEX = /(?<=^|[\s(\[{])#(\d+)\b/g;

/**
 * Provides clickable links for #123 issue references in comments.
 */
export class IssueLinkProvider implements vscode.DocumentLinkProvider {
  async provideDocumentLinks(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
    // Try cached first, then async
    let repoInfo = getCachedRepositoryInfo(document.uri.fsPath);
    if (!repoInfo) {
      repoInfo = await getRepositoryInfo(document.uri.fsPath);
    }
    if (!repoInfo) return [];

    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      ISSUE_REF_REGEX.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = ISSUE_REF_REGEX.exec(line)) !== null) {
        const issueNumber = parseInt(match[1], 10);
        const url = getIssueUrl(repoInfo, issueNumber);
        if (url) {
          const range = new vscode.Range(lineNum, match.index, lineNum, match.index + match[0].length);
          const link = new vscode.DocumentLink(range, vscode.Uri.parse(url));
          link.tooltip = `Open issue ${match[0]} on ${repoInfo.provider}`;
          links.push(link);
        }
      }
    }

    return links;
  }
}
