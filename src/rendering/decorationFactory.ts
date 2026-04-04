import * as vscode from 'vscode';

import { LeftBorderMode } from '../types';

export interface DecorationStyles {
  transparentComment: vscode.TextEditorDecorationType;
  leftBorder: vscode.TextEditorDecorationType | undefined;
}

/**
 * Creates the set of decoration types used by the extension.
 */
export function createDecorationStyles(leftBorder: LeftBorderMode = 'off', dimOpacity = 0.05): DecorationStyles {
  return {
    transparentComment: vscode.window.createTextEditorDecorationType({
      opacity: String(dimOpacity),
    }),
    leftBorder: leftBorder !== 'off'
      ? vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          borderWidth: '0 0 0 3px',
          borderStyle: 'solid',
          borderColor: new vscode.ThemeColor('kat-comment-studio.leftBorderColor'),
        })
      : undefined,
  };
}

/**
 * Disposes all decoration types.
 */
export function disposeDecorationStyles(styles: DecorationStyles): void {
  styles.transparentComment.dispose();
  styles.leftBorder?.dispose();
}
