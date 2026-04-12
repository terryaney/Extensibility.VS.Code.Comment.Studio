import * as vscode from 'vscode';

export interface DecorationStyles {
  transparentComment: vscode.TextEditorDecorationType;
}

/**
 * Creates the set of decoration types used by the extension.
 */
export function createDecorationStyles(dimOpacity = 40): DecorationStyles {
  return {
    transparentComment: vscode.window.createTextEditorDecorationType({
      opacity: String(dimOpacity / 100),
    }),
  };
}

/**
 * Disposes all decoration types.
 */
export function disposeDecorationStyles(styles: DecorationStyles): void {
  styles.transparentComment.dispose();
}
