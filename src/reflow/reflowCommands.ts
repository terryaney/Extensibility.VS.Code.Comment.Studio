import * as vscode from 'vscode';
import { getLanguageCommentStyle } from '../parsing/languageConfig';
import { findAllCommentBlocks } from '../parsing/commentParser';
import { reflowCommentBlock, ReflowOptions } from './reflowEngine';
import { getConfiguration } from '../configuration';
import { getEditorConfigSettings } from '../services/editorconfigService';

/**
 * Reflows all XML doc comment blocks in the given document.
 */
export function reflowAllComments(document: vscode.TextDocument): vscode.TextEdit[] {
  const commentStyle = getLanguageCommentStyle(document.languageId);
  if (!commentStyle) return [];

  const config = getConfiguration();
  if (!config.enabledLanguages.includes(document.languageId)) return [];

  const lines = document.getText().split(/\r?\n/);
  const blocks = findAllCommentBlocks(lines, commentStyle);
  const edits: vscode.TextEdit[] = [];

  const editorConfigSettings = getEditorConfigSettings(document.uri.fsPath);
  const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

  for (const block of blocks) {
    const reflowOptions: ReflowOptions = {
      maxLineWidth,
      commentStyle,
      indentation: block.indentation,
    };

    const reflowedLines = reflowCommentBlock(block, reflowOptions);
    const newText = reflowedLines.join('\n');
    const blockRange = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
    const oldText = document.getText(blockRange);

    if (newText !== oldText) {
      edits.push(vscode.TextEdit.replace(blockRange, newText));
    }
  }

  return edits;
}

/**
 * Reflows the single XML doc comment block that contains the cursor line.
 * Returns an empty array if the cursor is not inside a comment block.
 */
export function reflowCurrentComment(document: vscode.TextDocument, cursorLine: number): vscode.TextEdit[] {
  const commentStyle = getLanguageCommentStyle(document.languageId);
  if (!commentStyle) return [];

  const config = getConfiguration();
  if (!config.enabledLanguages.includes(document.languageId)) return [];

  const lines = document.getText().split(/\r?\n/);
  const blocks = findAllCommentBlocks(lines, commentStyle);
  const block = blocks.find(b => cursorLine >= b.startLine && cursorLine <= b.endLine);

  if (!block) return [];

  const editorConfigSettings = getEditorConfigSettings(document.uri.fsPath);
  const maxLineWidth = editorConfigSettings.maxLineLength ?? config.maxLineLength;

  const reflowOptions: ReflowOptions = {
    maxLineWidth,
    commentStyle,
    indentation: block.indentation,
  };

  const reflowedLines = reflowCommentBlock(block, reflowOptions);
  const newText = reflowedLines.join('\n');
  const blockRange = new vscode.Range(block.startLine, 0, block.endLine, lines[block.endLine].length);
  const oldText = document.getText(blockRange);

  if (newText !== oldText) {
    return [vscode.TextEdit.replace(blockRange, newText)];
  }
  return [];
}
