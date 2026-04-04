import { LanguageCommentStyle } from '../types';

const languageConfigs: ReadonlyMap<string, LanguageCommentStyle> = new Map([
  // C#
  ['csharp', {
    languageId: 'csharp',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // Visual Basic
  ['vb', {
    languageId: 'vb',
    singleLineDocPrefix: "'''",
    supportsMultiLineDoc: false,
  }],
  // F#
  ['fsharp', {
    languageId: 'fsharp',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '(**',
    multiLineDocEnd: '*)',
    multiLineContinuation: '*',
  }],
  // C++
  ['cpp', {
    languageId: 'cpp',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // C
  ['c', {
    languageId: 'c',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // TypeScript
  ['typescript', {
    languageId: 'typescript',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // JavaScript
  ['javascript', {
    languageId: 'javascript',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // TypeScript React
  ['typescriptreact', {
    languageId: 'typescriptreact',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // JavaScript React
  ['javascriptreact', {
    languageId: 'javascriptreact',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // Razor
  ['razor', {
    languageId: 'razor',
    singleLineDocPrefix: '///',
    supportsMultiLineDoc: true,
    multiLineDocStart: '/**',
    multiLineDocEnd: '*/',
    multiLineContinuation: '*',
  }],
  // SQL
  ['sql', {
    languageId: 'sql',
    singleLineDocPrefix: '---',
    supportsMultiLineDoc: false,
  }],
  // PowerShell
  ['powershell', {
    languageId: 'powershell',
    singleLineDocPrefix: '##',
    supportsMultiLineDoc: true,
    multiLineDocStart: '<#',
    multiLineDocEnd: '#>',
    multiLineContinuation: '',
  }],
]);

/**
 * Gets the comment style configuration for a VS Code language ID.
 * Returns undefined if the language is not supported.
 */
export function getLanguageCommentStyle(languageId: string): LanguageCommentStyle | undefined {
  return languageConfigs.get(languageId);
}

/**
 * Checks if a language ID is supported for comment parsing.
 */
export function isLanguageSupported(languageId: string): boolean {
  return languageConfigs.has(languageId);
}

/**
 * Gets all supported language IDs.
 */
export function getSupportedLanguageIds(): string[] {
  return [...languageConfigs.keys()];
}
