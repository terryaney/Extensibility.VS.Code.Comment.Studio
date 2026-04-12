import * as vscode from 'vscode';
import { getCachedCommentBlocks } from '../parsing/commentParser';
import { renderToMarkdown, SignatureInfo } from './commentRenderer';
import { detectEnumMember } from './signatureUtils';

/**
 * Provides rich hover tooltips for XML doc comment blocks.
 * Only shows content when explicitly triggered via CodeLens click
 * (setPendingHover sets the target, provideHover checks it).
 */
export class CommentHoverProvider implements vscode.HoverProvider {
  private enabled = true;
  private _pendingUri: string | undefined;
  private _pendingStartLine: number | undefined;
  private _pendingClearTimer: ReturnType<typeof setTimeout> | undefined;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Arms the hover provider for a specific comment block.
   * The next provideHover call for the same document will return the comment content
   * regardless of cursor position, then clear the pending state (one-shot).
   * A 500ms safety timeout ensures the state never leaks to an unrelated subsequent hover.
   */
  setPendingHover(uri: vscode.Uri, startLine: number): void {
    if (this._pendingClearTimer !== undefined) clearTimeout(this._pendingClearTimer);
    this._pendingUri = uri.toString();
    this._pendingStartLine = startLine;
    this._pendingClearTimer = setTimeout(() => this.clearPending(), 500);
  }

  /** Clears any pending hover without showing it. */
  clearPending(): void {
    if (this._pendingClearTimer !== undefined) {
      clearTimeout(this._pendingClearTimer);
      this._pendingClearTimer = undefined;
    }
    this._pendingUri = undefined;
    this._pendingStartLine = undefined;
  }

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!this.enabled) {
      this.clearPending();
      return undefined;
    }

    // Only respond when armed via CodeLens click
    if (this._pendingUri === undefined || this._pendingStartLine === undefined) return undefined;
    if (document.uri.toString() !== this._pendingUri) {
      this.clearPending();
      return undefined;
    }

    const lines = document.getText().split(/\r?\n/);
    const blocks = getCachedCommentBlocks(
      document.uri.toString(),
      document.version,
      lines,
      document.languageId,
    );

    if (!blocks || blocks.length === 0) {
      this.clearPending();
      return undefined;
    }

    // Find the block matching the pending startLine
    const block = blocks.find(b => b.startLine === this._pendingStartLine);
    if (!block) {
      this.clearPending();
      return undefined;
    }

    // Clear pending state (one-shot)
    this.clearPending();

    const signatureInfo = extractSignatureInfo(document, block.endLine);
    const md = renderToMarkdown(block, undefined, signatureInfo);
    if (!md) return undefined;

    const range = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
    return new vscode.Hover(md, range);
  }
}

/**
 * Scans backward from `beforeLine` (inclusive) looking for the C# `enum TypeName`
 * declaration that encloses the current position.  Returns the type name, or
 * `undefined` if no enum declaration is found within a reasonable search window.
 */
function findEnclosingEnumName(document: vscode.TextDocument, beforeLine: number): string | undefined {
  for (let i = beforeLine; i >= Math.max(0, beforeLine - 100); i--) {
    const m = /\benum\s+(\w+)/.exec(document.lineAt(i).text);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Scans lines after the comment block's end to extract the method/property/class
 * declaration as a signature string. Skips blank lines and attribute lines
 * (e.g. [HttpGet]), then collects lines until hitting the opening brace or
 * a semicolon (abstract/interface members).
 *
 * Special case: when the first meaningful line is recognised as an enum member,
 * returns `EnumType.MemberName [= value]` instead of the raw source text.
 */
function extractSignatureInfo(document: vscode.TextDocument, afterLine: number): SignatureInfo | undefined {
  const lineCount = document.lineCount;
  const sigLines: string[] = [];
  let started = false;

  for (let i = afterLine + 1; i < Math.min(afterLine + 12, lineCount); i++) {
    const trimmed = document.lineAt(i).text.trim();

    if (!started) {
      if (trimmed.length === 0) continue;
      if (trimmed.startsWith('[')) continue; // skip attributes
      started = true;

      // Detect enum member before any other checks
      const enumMember = detectEnumMember(trimmed);
      if (enumMember) {
        const enumName = findEnclosingEnumName(document, afterLine);
        if (enumName) {
          const valueClause = enumMember.value !== undefined ? ` = ${enumMember.value}` : '';
          return {
            text: `${enumName}.${enumMember.name}${valueClause}`,
            languageId: document.languageId,
          };
        }
        // No enclosing enum found — fall through to normal extraction
      }
    }

    // Stop at closing brace (e.g. end of enum body) to prevent spillover
    if (trimmed === '}' || trimmed === '},') break;

    const braceIdx = trimmed.indexOf('{');
    if (braceIdx !== -1) {
      // Take everything before the opening brace
      const before = trimmed.substring(0, braceIdx).trimEnd();
      if (before) sigLines.push(before);
      break;
    }

    if (trimmed.endsWith(';')) {
      sigLines.push(trimmed);
      break;
    }

    // Expression-bodied member (e.g. "public int Foo =>" on its own line)
    if (trimmed.endsWith('=>')) {
      sigLines.push(trimmed);
      break;
    }

    sigLines.push(trimmed);
  }

  if (sigLines.length === 0) return undefined;

  return {
    text: sigLines.join('\n'),
    languageId: document.languageId,
  };
}
