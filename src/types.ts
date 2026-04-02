/** Rendering mode for XML doc comments */
export type RenderingMode = 'off' | 'on';

/** Prefix highlight style configuration */
export interface PrefixStyle {
  prefix: string;
  color: string;
  themeColorId: string;
  fontStyle?: string;
  textDecoration?: string;
}

/** CodeLens placement relative to the comment block */
export type CodeLensPosition = 'inline' | 'ownLine';

/** Extension configuration */
export interface CommentStudioConfig {
  renderingMode: RenderingMode;
  enabledLanguages: string[];
  dimOriginalComments: boolean;
  dimOpacity: number;

  // Reflow settings
  maxLineLength: number;

  // Anchor settings
  customTags: string;
  tagPrefixes: string;
  enableTagHighlighting: boolean;
  anchorColorizeMode: 'never' | 'caseSensitive' | 'caseInsensitive';
  scanOnLoad: boolean;
  fileExtensionsToScan: string;
  foldersToIgnore: string;

  // Feature toggles
  enablePrefixHighlighting: boolean;
  enableIssueLinks: boolean;
  enableReflowOnPaste: boolean;
  enableReflowWhileTyping: boolean;
  collapseByDefault: boolean;

  // Visual settings
  preserveBlankLines: boolean;
  codeLensPosition: CodeLensPosition;
  codeLensMaxLength: number;

  // Color overrides(empty string = use ThemeColor default)
  colors: {
    // Anchor type colors
    todo: string;
    hack: string;
    note: string;
    bug: string;
    fixme: string;
    undone: string;
    review: string;
    anchor: string;
    custom: string;
    // Rendered comment colors
    renderedText: string;
    renderedHeading: string;
    renderedCode: string;
    renderedLink: string;
    // Prefix highlight colors
    prefixAlert: string;
    prefixQuestion: string;
    prefixHighlight: string;
    prefixStrikethrough: string;
    prefixDisabled: string;
    prefixQuote: string;
  };
}

/** Represents a type of rendered segment */
export enum SegmentType {
  Text = 'text',
  Bold = 'bold',
  Italic = 'italic',
  Code = 'code',
  Link = 'link',
  ParamRef = 'paramRef',
  TypeParamRef = 'typeParamRef',
  TypeRef = 'typeRef',
  Heading = 'heading',
  Strikethrough = 'strikethrough',
  IssueReference = 'issueReference',
}

/** Represents a segment of rendered comment content */
export interface RenderedSegment {
  text: string;
  type: SegmentType;
  linkTarget?: string;
}

/** Represents a rendered line of XML documentation */
export interface RenderedLine {
  segments: RenderedSegment[];
}

/** Section types in an XML doc comment */
export enum CommentSectionType {
  Summary = 'summary',
  TypeParam = 'typeParam',
  Param = 'param',
  Returns = 'returns',
  Value = 'value',
  Remarks = 'remarks',
  Example = 'example',
  Exception = 'exception',
  SeeAlso = 'seeAlso',
  Other = 'other',
}

/** A distinct section of an XML doc comment */
export interface RenderedCommentSection {
  type: CommentSectionType;
  heading?: string;
  name?: string;
  /** Optional link target for the name cell (e.g., command URI for seealso cref, or href URL). */
  nameLink?: string;
  lines: RenderedLine[];
  listContentStartIndex: number;
}

/** A fully rendered XML doc comment block */
export interface RenderedComment {
  lines: RenderedLine[];
  indentation: string;
  sections: RenderedCommentSection[];
}

/** Parsed XML doc comment block from the source text */
export interface XmlDocCommentBlock {
  /** Start offset in the document */
  startOffset: number;
  /** End offset in the document */
  endOffset: number;
  /** Starting line number (0-based) */
  startLine: number;
  /** Ending line number (0-based, inclusive) */
  endLine: number;
  /** Whitespace before the comment prefix on the first line */
  indentation: string;
  /** Raw XML content with comment prefixes stripped */
  xmlContent: string;
  /** Whether this uses multiline comment style */
  isMultiLineStyle: boolean;
}

/** Language comment style configuration */
export interface LanguageCommentStyle {
  /** The VS Code language ID */
  languageId: string;
  /** Single-line doc comment prefix (e.g., "///") */
  singleLineDocPrefix: string;
  /** Whether multiline doc comments are supported */
  supportsMultiLineDoc: boolean;
  /** Multiline doc comment start marker */
  multiLineDocStart?: string;
  /** Multiline doc comment end marker */
  multiLineDocEnd?: string;
  /** Multiline continuation prefix (e.g., " * ") */
  multiLineContinuation?: string;
}

/** Git hosting provider */
export enum GitHostingProvider {
  Unknown = 'unknown',
  GitHub = 'github',
  GitLab = 'gitlab',
  Bitbucket = 'bitbucket',
  AzureDevOps = 'azureDevOps',
}

/** Git repository info for issue link resolution */
export interface GitRepositoryInfo {
  provider: GitHostingProvider;
  owner: string;
  repository: string;
  baseUrl: string;
}

/** Helper to generate issue URLs from repo info */
export function getIssueUrl(repoInfo: GitRepositoryInfo, issueNumber: number): string | undefined {
  switch (repoInfo.provider) {
    case GitHostingProvider.GitHub:
      return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repository}/issues/${issueNumber}`;
    case GitHostingProvider.GitLab:
      return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repository}/-/issues/${issueNumber}`;
    case GitHostingProvider.Bitbucket:
      return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repository}/issues/${issueNumber}`;
    case GitHostingProvider.AzureDevOps:
      return `${repoInfo.baseUrl}/${repoInfo.owner}/${repoInfo.repository}/_workitems/edit/${issueNumber}`;
    default:
      return undefined;
  }
}
