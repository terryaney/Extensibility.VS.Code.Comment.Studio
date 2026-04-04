import * as vscode from 'vscode';
import { findAnchorsInText, BUILTIN_ANCHOR_TYPES } from '../anchors/anchorService';
import { getConfiguration } from '../configuration';

/**
 * Navigate to the next/previous anchor in the current document.
 */
function navigateAnchor(direction: 'next' | 'previous'): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const config = getConfiguration();
  const customTags = config.customTags
    ? config.customTags.split(',').map(t => t.trim().toUpperCase()).filter(t => t)
    : [];
  const tagPrefixes = config.tagPrefixes
    ? config.tagPrefixes.split(',').map(p => p.trim()).filter(p => p)
    : [];
  const allTags = [...BUILTIN_ANCHOR_TYPES.keys(), ...customTags];

  const anchors = findAnchorsInText(
    editor.document.getText(),
    editor.document.uri.fsPath,
    allTags,
    tagPrefixes,
  );

  if (anchors.length === 0) {
    vscode.window.showInformationMessage('No anchors found in this document.');
    return;
  }

  const currentLine = editor.selection.active.line;
  const currentCol = editor.selection.active.character;

  let target: typeof anchors[0] | undefined;

  if (direction === 'next') {
    target = anchors.find(a =>
      a.lineNumber > currentLine || (a.lineNumber === currentLine && a.column > currentCol),
    );
    if (!target) target = anchors[0]; // Wrap around
  } else {
    for (let i = anchors.length - 1; i >= 0; i--) {
      const a = anchors[i];
      if (a.lineNumber < currentLine || (a.lineNumber === currentLine && a.column < currentCol)) {
        target = a;
        break;
      }
    }
    if (!target) target = anchors[anchors.length - 1]; // Wrap around
  }

  if (target) {
    const pos = new vscode.Position(target.lineNumber, target.column);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
}

export function registerAnchorNavigationCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('kat-comment-studio.nextAnchor', () => navigateAnchor('next')),
    vscode.commands.registerCommand('kat-comment-studio.previousAnchor', () => navigateAnchor('previous')),
  );
}
