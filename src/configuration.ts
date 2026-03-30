import * as vscode from 'vscode';
import { CommentStudioConfig, RenderingMode, LeftBorderMode, CodeLensPosition } from './types';

const SECTION = 'kat-comment-studio';

export function getConfiguration(): CommentStudioConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    renderingMode: config.get<RenderingMode>('renderingMode', 'on'),
    enabledLanguages: config.get<string[]>('enabledLanguages', [
      'csharp', 'vb', 'fsharp', 'cpp', 'c',
      'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
      'razor', 'sql', 'powershell',
    ]),
    dimOriginalComments: config.get<boolean>('dimOriginalComments', true),
    dimOpacity: config.get<number>('dimOpacity', 0.4),

    // Reflow
    maxLineLength: config.get<number>('maxLineLength', 120),

    // Anchors
    customTags: config.get<string>('customTags', ''),
    tagPrefixes: config.get<string>('tagPrefixes', '@, $'),
    enableTagHighlighting: config.get<boolean>('enableTagHighlighting', true),
    scanOnLoad: config.get<boolean>('scanOnLoad', true),
    fileExtensionsToScan: config.get<string>('fileExtensionsToScan', 'cs,vb,fs,cpp,c,h,ts,tsx,js,jsx,razor,cshtml,sql,ps1,psm1'),
    foldersToIgnore: config.get<string>('foldersToIgnore', 'node_modules,bin,obj,.git,dist,out,build,.vs,.vscode-test'),

    // Feature toggles
    enablePrefixHighlighting: config.get<boolean>('enablePrefixHighlighting', true),
    enableIssueLinks: config.get<boolean>('enableIssueLinks', true),
    enableReflowOnPaste: config.get<boolean>('enableReflowOnPaste', true),
    enableReflowWhileTyping: config.get<boolean>('enableReflowWhileTyping', true),
    collapseByDefault: config.get<boolean>('collapseByDefault', false),

    // Visual
    preserveBlankLines: config.get<boolean>('preserveBlankLines', true),
    leftBorder: config.get<LeftBorderMode>('leftBorder', 'off'),
    codeLensPosition: config.get<CodeLensPosition>('codeLensPosition', 'inline'),
    codeLensMaxLength: config.get<number>('codeLensMaxLength', 100),

    // Color overrides
    colors: {
      todo: config.get<string>('colors.todo', ''),
      hack: config.get<string>('colors.hack', ''),
      note: config.get<string>('colors.note', ''),
      bug: config.get<string>('colors.bug', ''),
      fixme: config.get<string>('colors.fixme', ''),
      undone: config.get<string>('colors.undone', ''),
      review: config.get<string>('colors.review', ''),
      anchor: config.get<string>('colors.anchor', ''),
      custom: config.get<string>('colors.custom', '#DAA520'),
      renderedText: config.get<string>('colors.renderedText', ''),
      renderedHeading: config.get<string>('colors.renderedHeading', ''),
      renderedCode: config.get<string>('colors.renderedCode', ''),
      renderedLink: config.get<string>('colors.renderedLink', ''),
      prefixAlert: config.get<string>('colors.prefixAlert', ''),
      prefixQuestion: config.get<string>('colors.prefixQuestion', ''),
      prefixHighlight: config.get<string>('colors.prefixHighlight', ''),
      prefixStrikethrough: config.get<string>('colors.prefixStrikethrough', ''),
      prefixDisabled: config.get<string>('colors.prefixDisabled', ''),
      prefixQuote: config.get<string>('colors.prefixQuote', ''),
    },
  };
}

export function onConfigurationChanged(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(SECTION)) {
      callback();
    }
  });
}

export async function setRenderingMode(mode: RenderingMode): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  await config.update('renderingMode', mode, vscode.ConfigurationTarget.Global);
}
