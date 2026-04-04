# Plan: Port Comment Studio to VS Code Extension

## Problem Statement

Port the Visual Studio 2022 extension [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) ("Comment Studio") to a VS Code extension named **kat-comment-studio**, preserving the full feature set across four subsystems.

## Decisions

- **Language**: TypeScript (standard VS Code extension, not web-compatible)
- **Test framework**: Vitest for pure logic tests
- **Extension name**: `kat-comment-studio`
- **Rendering approach**: VS Code Decoration API (`createTextEditorDecorationType`)
- **Target languages**: C#, VB, F#, C++, TypeScript, JavaScript, Razor, SQL, PowerShell

## ⚠️ Decoration API Limitations (What Can't Port 1:1)

The source extension uses Visual Studio's `IntraTextAdornmentTagger`, which can inject arbitrary WPF UI elements inline within the editor text. VS Code's Decoration API is significantly more constrained:

### Cannot replicate
1. **True inline replacement** — VS IntraTextAdornmentTagger replaces comment text with rendered WPF controls. VS Code decorations overlay/annotate text but cannot replace it with arbitrary HTML. The original comment text remains visible (we can dim it and add styled `before`/`after` content).
2. **Rich structured sections** — The source's "Full" rendering mode shows structured param/returns/remarks sections with aligned headings as WPF controls. VS Code decorations support only plain text with CSS styling (color, font-weight, font-style, border, background). No HTML, no multi-line rendered blocks in a single decoration.
3. **Double-click to edit** — The source lets users double-click a rendered comment to reveal raw source. VS Code decorations don't receive click events. We can use commands/keyboard shortcuts instead.
4. **Interactive hover validation** — The source shows hover previews for LINK: targets. VS Code has `HoverProvider` which can partially replicate this, but not with the same fidelity as WPF tooltips.
5. **Arbitrary inline formatting** — Bold, italic, code spans rendered as styled text inline. VS Code decorations support `fontWeight`, `fontStyle`, `color`, `backgroundColor` but apply uniformly to the entire decoration range — cannot mix bold and italic within a single decoration.

### Can replicate with adaptation
1. **Compact mode** — Dim the original comment, append a styled summary as an `after` decoration. Won't have mixed formatting within the summary, but can show a clean one-line summary.
2. **Full mode** — Use multiple line-level decorations to add section labels. Less visually rich than the WPF version but functional.
3. **Escape to toggle** — Command/keybinding to toggle between rendered and raw views (show/hide decorations).
4. **Edit suppression** — Detect active editing in comment ranges and temporarily remove decorations.
5. **Issue link rendering** — Can use `DocumentLinkProvider` for clickable `#123` links and `LINK:` syntax (better than decorations for this use case).

### Alternative approaches for future consideration
- **Webview panels** — Could render full HTML for a "Comment Preview" side panel, giving rich rendering without inline constraints.
- **Custom editor** — Overkill for this use case but would allow full control.
- **VS Code proposed API** — `InlineCompletionItemProvider` and future inline decoration APIs may eventually close this gap.

## Project Structure

```
kat-comment-studio/
├── .vscode/
│   ├── launch.json              # Extension debug launch config
│   ├── tasks.json               # Build tasks
│   └── Plans/                   # Existing plans folder (keep)
├── src/
│   ├── extension.ts             # Activation, registration, lifecycle
│   ├── types.ts                 # Shared types/interfaces
│   ├── configuration.ts         # Settings management + editorconfig integration
│   │
│   ├── parsing/
│   │   ├── commentParser.ts     # Language-aware comment block detection
│   │   ├── xmlDocParser.ts      # XML doc comment structure parsing
│   │   ├── languageConfig.ts    # Per-language comment syntax definitions
│   │   └── anchorParser.ts      # TODO/HACK/BUG/etc. anchor extraction
│   │
│   ├── rendering/
│   │   ├── commentRenderer.ts   # XML → rendered model (sections, segments)
│   │   ├── markdownProcessor.ts # Inline markdown: bold, italic, code, links
│   │   ├── decorationManager.ts # VS Code decoration lifecycle management
│   │   ├── decorationFactory.ts # Creates TextEditorDecorationType instances
│   │   └── editSuppression.ts   # Suppress decorations during active editing
│   │
│   ├── reflow/
│   │   ├── reflowEngine.ts      # Comment reflow/wrap logic
│   │   └── reflowCommands.ts    # Format document/selection integration
│   │
│   ├── anchors/
│   │   ├── anchorService.ts     # Anchor pattern matching + metadata extraction
│   │   ├── workspaceScanner.ts  # Workspace-wide file scanning (background)
│   │   ├── anchorCache.ts       # Persist/reload scan results
│   │   ├── anchorTreeProvider.ts # TreeView data provider
│   │   └── anchorExporter.ts    # Export to TSV/CSV/Markdown/JSON
│   │
│   ├── navigation/
│   │   ├── linkAnchorParser.ts  # LINK: syntax parsing
│   │   ├── issueLinkProvider.ts # DocumentLinkProvider for #123 refs
│   │   ├── gitService.ts        # Git remote detection (GitHub/GitLab/etc.)
│   │   └── linkNavigator.ts     # Ctrl+Click file/line navigation
│   │
│   └── services/
│       └── editorconfigService.ts # .editorconfig parsing and caching
│
├── test/
│   ├── unit/
│   │   ├── xmlDocParser.test.ts
│   │   ├── commentRenderer.test.ts
│   │   ├── markdownProcessor.test.ts
│   │   ├── reflowEngine.test.ts
│   │   ├── anchorService.test.ts
│   │   ├── linkAnchorParser.test.ts
│   │   ├── gitService.test.ts
│   │   └── editorconfigService.test.ts
│   └── fixtures/                 # Sample files for testing
│
├── package.json                  # Extension manifest + contributes
├── tsconfig.json
├── vitest.config.ts
├── .vscodeignore
├── CHANGELOG.md
└── README.md
```

## Phased Implementation

### Phase 1: Foundation + XML Doc Comment Rendering

**Goal**: Extension scaffold, comment parsing, and basic inline rendered comments.

#### 1.1 — Extension Scaffold
- Initialize npm project with `yo code` or manual setup
- Configure `package.json` with extension metadata, activation events, contributes
- Set up TypeScript compilation, Vitest, ESLint
- Create `extension.ts` with activation/deactivation lifecycle
- Create `.vscode/launch.json` for Extension Development Host debugging

#### 1.2 — Language Configuration
- Define comment syntax per language (single-line markers, multiline markers)
- C#/VB/F#: `///` / `'''` and `/** */`
- C++: `///` and `/** */`
- TS/JS: `/** */` (JSDoc)
- Razor: `///` in code blocks
- SQL: `--` (no XML doc convention, but the source supports it)
- PowerShell: `##` comment-based help (different from XML doc)
- Map VS Code language IDs to comment configurations

#### 1.3 — Comment Block Parser
- Port `XmlDocCommentParser` logic: line-by-line scanning, block detection, caching
- Detect single-line (`///`) and multiline (`/** */`) doc comment blocks
- Guard against false positives (commented-out doc markers)
- Cache parsed blocks per document version (use document URI + version as key)
- **Tests**: Port relevant tests from `XmlDocCommentRendererTests.cs`

#### 1.4 — XML Doc Comment Renderer
- Port `XmlDocCommentRenderer`: parse XML structure into section model
- Sections: Summary, Param, TypeParam, Returns, Remarks, Example, Exception
- Stripped summary generation (`GetStrippedSummary` equivalent)
- `<inheritdoc>` handling
- Fallback: degrade to plain text when XML parsing fails
- **Tests**: Port section model tests, fallback tests

#### 1.5 — Markdown Inline Processing
- Port `ProcessMarkdownInText`: code spans, bold, italic, strikethrough, links, issue refs
- Respect precedence (code spans before issue refs to avoid `\`#123\`` becoming a link)
- Issue reference generation only when repo info available
- **Tests**: Port markdown contract tests

#### 1.6 — Decoration Management
- Create `decorationManager.ts`: apply/remove decorations per editor
- Compact mode: dim original comment lines, add `after` decoration with stripped summary
- Full mode: per-line decorations showing section labels + content
- Toggle command: switch between Compact/Full/Off
- Edit suppression: detect `onDidChangeTextDocument` within comment ranges, temporarily remove decorations
- Keyboard shortcut (Escape) to toggle raw view
- React to `onDidChangeActiveTextEditor`, `onDidChangeVisibleTextEditors`

#### 1.7 — Configuration (Phase 1 subset)
- Extension settings: rendering mode (Compact/Full/Off), enabled languages
- Contribute settings in `package.json`

### Phase 2: Comment Reflow

**Goal**: Automatic comment reflow with format integration.

#### 2.1 — Reflow Engine
- Port `CommentReflowEngine`: XML-aware paragraph wrapping
- Block tag handling (summary, remarks, returns, param, typeparam)
- Preserve `<code>` blocks as preformatted
- Configurable max line width
- **Tests**: Port reflow tests covering various XML structures

#### 2.2 — Format Integration
- `DocumentFormattingEditProvider` for Format Document
- `DocumentRangeFormattingEditProvider` for Format Selection
- Only reflow comment blocks, pass through to default formatter for code
- Register for supported languages

#### 2.3 — Smart Paste
- `onDidChangeTextDocument` listener for paste events in comment blocks
- Re-wrap pasted text to fit configured line width

#### 2.4 — EditorConfig Integration
- Parse `.editorconfig` for `max_line_length`, `custom_anchor_tags`, `custom_anchor_tag_prefixes`
- Cache per directory/file context
- `CreateReflowEngine` equivalent that merges editorconfig + global settings
- File watcher for `.editorconfig` changes
- **Tests**: Port editorconfig parsing tests

### Phase 3: Code Anchors

**Goal**: Workspace-wide anchor scanning with tree view panel.

#### 3.1 — Anchor Service
- Port anchor pattern matching: built-in types (TODO, HACK, NOTE, BUG, FIXME, UNDONE, REVIEW, ANCHOR)
- Metadata extraction: `(@owner)`, `[#123]`, `ANCHOR(name)`
- Custom tag support from settings + editorconfig
- Regex compilation with tag prefix support
- **Tests**: Port `AnchorServiceTests.cs`

#### 3.2 — Workspace Scanner
- Background workspace file scanning (use VS Code `workspace.findFiles`)
- Parallel file processing (respect `workspace.fs` API)
- Configurable file extensions and ignored folders
- Progress reporting via `window.withProgress`

#### 3.3 — Anchor Cache
- Persist scan results to extension storage (`globalStoragePath` or `workspaceState`)
- Reload on activation if cache exists
- Invalidate on file changes (`FileSystemWatcher`)

#### 3.4 — Anchor Tree View
- `TreeDataProvider` implementation for Code Anchors panel
- Scope modes: Workspace / Project (workspace folder) / Current Document / Open Documents
- Type filters (TODO, HACK, etc.)
- Built-in search (QuickPick filter or tree view filter)
- Group by file
- Metadata display (owner, issue ref, anchor name)
- Click to navigate to anchor location

#### 3.5 — Anchor Export
- Export visible anchors to TSV, CSV, Markdown, JSON
- Command palette integration
- Save file dialog

#### 3.6 — Anchor Decorations
- Inline decorations for anchor tags (colored backgrounds/foreground per type)
- Configurable colors per anchor type

### Phase 4: Link/Issue Navigation

**Goal**: LINK: syntax navigation and #123 issue link resolution.

#### 4.1 — Git Service
- Port `GitRepositoryService`: detect git remote, infer hosting provider
- Support GitHub, GitLab, Bitbucket (including enterprise/self-hosted)
- Parse remote URLs (SSH + HTTPS formats)
- Handle nested GitLab groups, trailing slashes
- Cache per workspace folder
- **Tests**: Port git parsing tests (heavy emphasis on enterprise cases)

#### 4.2 — Issue Link Provider
- `DocumentLinkProvider` for `#123` patterns in comments
- Generate URL from repo info + issue number
- Only activate when repo info available
- Support in rendered comment decorations too

#### 4.3 — LINK: Anchor Parser
- Port `LinkAnchorParser`: parse LINK: syntax
- Supported forms: plain file, relative path (`./`, `../`), workspace-relative, project-relative
- Paths with spaces
- Line number (`file.cs:42`) and line range (`file.cs:10-20`) suffixes
- File anchors (`file.cs#AnchorName`)
- Local anchors (`LINK: #local-anchor`)
- **Tests**: Port `LinkAnchorParserTests.cs`

#### 4.4 — Link Navigation
- `DocumentLinkProvider` for LINK: syntax
- `DefinitionProvider` or command for Ctrl+Click navigation
- Resolve targets: open file at line, highlight range, jump to anchor
- `HoverProvider` for LINK: targets showing resolved path + validity

## Phase Dependencies

```
Phase 1 (Foundation + Rendering) ── no dependencies
Phase 2 (Reflow) ── depends on Phase 1 (parser, language config)
Phase 3 (Anchors) ── depends on Phase 1 (extension scaffold, language config, editorconfig)
Phase 4 (Navigation) ── depends on Phase 1 (parser), Phase 3 (anchor service for ANCHOR refs)
```

Phases 2, 3, and 4 are largely independent of each other and could be developed in parallel after Phase 1.

## Source Test Coverage to Port

The source extension has unusually thorough tests. Key test classes to port:

| Source Test Class | Target Test File | Priority |
|---|---|---|
| `XmlDocCommentRendererTests` | `commentRenderer.test.ts` | Phase 1 |
| `AnchorServiceTests` | `anchorService.test.ts` | Phase 3 |
| `LinkAnchorParserTests` | `linkAnchorParser.test.ts` | Phase 4 |
| `GitRepositoryServiceTests` | `gitService.test.ts` | Phase 4 |
| Inline comment detection tests | `commentParser.test.ts` | Phase 1 |
| Language comment style tests | `languageConfig.test.ts` | Phase 1 |
| Classifier tests | `markdownProcessor.test.ts` | Phase 1 |
| EditorConfig tests | `editorconfigService.test.ts` | Phase 2 |

## CI/CD

- GitHub Actions workflow: build on `ubuntu-latest`, run Vitest, package `.vsix`
- Publish to Open VSIX / VS Code Marketplace on tagged releases
- Mirror the source's approach: manual dispatch or `[release]` commit message triggers marketplace publish

## Risks and Mitigations

1. **Decoration API expressiveness** — Compact mode will look different from VS. Mitigation: focus on clarity over visual parity; consider a Webview side panel for "Full" rendering in a future phase.
2. **Performance at scale** — Workspace scanning for anchors in large monorepos. Mitigation: configurable file extensions/ignore patterns, incremental scanning, caching.
3. **EditorConfig parsing** — The source has its own parser. Mitigation: use the `editorconfig` npm package for the heavy lifting, only custom-parse Comment Studio-specific keys.
4. **Git remote parsing edge cases** — Enterprise GitHub/GitLab have many URL formats. Mitigation: port the source's test suite first, then implement to pass.
