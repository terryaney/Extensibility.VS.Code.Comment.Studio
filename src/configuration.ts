import * as vscode from 'vscode';
import { CommentStudioConfig } from './types';

const SECTION = 'kat-comment-studio';

export function getConfiguration(): CommentStudioConfig {
  const config = vscode.workspace.getConfiguration(SECTION);
  const pp = config.get<Record<string, string>>('patternProcessing', {});

  const splitTrim = (s: string) => s.split(',').map(v => v.trim()).filter(Boolean);

  return {
    xmlCommentRendering: config.get<boolean>('xmlCommentRendering', true),
    enabledLanguages: splitTrim(pp['enabledLanguages'] ?? 'csharp, vb, fsharp, cpp, c, typescript, javascript, typescriptreact, javascriptreact, razor, sql, powershell'),
    xmlCommentOpacity: config.get<number>('xmlCommentOpacity', 40),

    // Reflow
    reflowLineLength: config.get<number>('reflowLineLength', 120),

    // Anchors
    customTags: splitTrim(pp['customTags'] ?? ''),
    tagPrefixes: pp['tagPrefixes'] ?? '@, $',
    anchorColorizeMode: config.get<'never' | 'fullAnchor' | 'caseSensitive' | 'caseInsensitive'>('anchorColorizeMode', 'caseInsensitive'),
    scanOnLoad: config.get<boolean>('scanOnLoad', true),
    fileExtensionsToScan: (pp['fileExtensions'] ?? 'cs,vb,fs,cpp,c,h,ts,tsx,js,jsx,razor,cshtml,sql,ps1,psm1').replace(/\s+/g, ''),
    foldersToIgnore: (pp['ignoreFolders'] ?? 'node_modules,bin,obj,.git,dist,out,build,.vs,.vscode-test').replace(/\s+/g, ''),

    // Feature toggles
    enablePrefixHighlighting: config.get<boolean>('enablePrefixHighlighting', true),
    enableIssueLinks: config.get<boolean>('enableIssueLinks', true),
    enableReflowOnPaste: config.get<boolean>('enableReflowOnPaste', true),
    enableReflowOnCommentExit: config.get<boolean>('enableReflowOnCommentExit', true),
    collapseXmlWhenRenderingOff: config.get<boolean>('collapseXmlWhenRenderingOff', false),
    interceptF1ForComments: config.get<boolean>('interceptF1ForComments', true),
    showAnchorCountBadges: config.get<boolean>('showAnchorCountBadges', true),

    // Visual
    codeLensSummaryTruncation: config.get<number>('codeLensSummaryTruncation', 205),

    // Color overrides
    colorOverrides: config.get<Record<string, string>>('colorOverrides', {}),
  };
}

export function onConfigurationChanged(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(SECTION)) {
      callback();
    }
  });
}

export async function setRenderingMode(enabled: boolean): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  await config.update('xmlCommentRendering', enabled, vscode.ConfigurationTarget.Global);
}
