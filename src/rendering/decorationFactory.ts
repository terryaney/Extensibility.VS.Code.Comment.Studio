import * as vscode from 'vscode';

export interface DecorationStyles {
  transparentComment: vscode.TextEditorDecorationType;
}

/**
 * Creates the set of decoration types used by the extension.
 */
export function createDecorationStyles(dimOpacity = 0.05): DecorationStyles {
  return {
    transparentComment: vscode.window.createTextEditorDecorationType({
      opacity: String(dimOpacity),
    }),
  };
}

/**
 * Disposes all decoration types.
 */
export function disposeDecorationStyles(styles: DecorationStyles): void {
  styles.transparentComment.dispose();
}
