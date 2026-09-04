import * as vscode from 'vscode';
import { getIssueUrl } from '../types';
import { getRepositoryInfo, getCachedRepositoryInfo } from './gitService';
import { scanAnchorLinesMap, isProseLanguageId } from '../anchors/commentScanner';

const ISSUE_REF_REGEX = /(?<=^|[\s(\[{])#(\d+)\b/g;

/**
 * Provides clickable links for #123 issue references in comments.
 *
 * Only comment portions of a line are searched, so `#123` in a string literal
 * or a preprocessor directive is left alone. Uses the same comment scanner as
 * anchor colorization so the two agree on what counts as a comment.
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
    const prose = isProseLanguageId(document.languageId);
    const commentMap = scanAnchorLinesMap(lines, prose);

    for (const [lineNum, commentStart] of commentMap) {
      const commentPortion = lines[lineNum].substring(commentStart);
      ISSUE_REF_REGEX.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = ISSUE_REF_REGEX.exec(commentPortion)) !== null) {
        // A leading `#` that is itself the comment marker (PowerShell, Python)
        // introduces the comment — it is not an issue reference. Prose has no
        // marker, so the guard does not apply there.
        if (!prose && match.index === 0 && commentPortion.startsWith('#')) continue;

        const issueNumber = parseInt(match[1], 10);
        const url = getIssueUrl(repoInfo, issueNumber);
        if (url) {
          const absStart = commentStart + match.index;
          const range = new vscode.Range(lineNum, absStart, lineNum, absStart + match[0].length);
          const link = new vscode.DocumentLink(range, vscode.Uri.parse(url));
          link.tooltip = `Open issue ${match[0]} on ${repoInfo.provider}`;
          links.push(link);
        }
      }
    }

    return links;
  }
}
