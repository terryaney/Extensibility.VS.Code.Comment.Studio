# Plan: CommentsVS Feature Gap Analysis & Implementation

## Problem Statement

Compare the [CommentsVS README](https://github.com/madskristensen/CommentsVS/blob/master/README.md) feature set against our current `kat-comment-studio` VS Code extension implementation and the existing `port-vs-extension.md` plan. Identify all missing features and categorize them.

## Current State Summary

The extension has solid coverage of the core feature pillars:
- ✅ XML Doc Comment Rendering (Compact/Full/Off modes)
- ✅ Markdown in Comments (bold, italic, code, strikethrough, links)
- ✅ Comment Reflow Engine + Format Document/Selection integration
- ✅ Code Anchors (8 built-in types, tree view, workspace scanning, export)
- ✅ Issue Links (#123 → GitHub/GitLab/Bitbucket/Azure DevOps)
- ✅ LINK: Navigation (file paths, line numbers, ranges, named anchors)
- ✅ Git Service (remote detection, provider inference)
- ✅ EditorConfig Service (max_line_length, custom_anchor_tags, prefixes)
- ✅ Edit Suppression (debounced decoration removal during editing)
- ✅ Comment Folding Provider

## Gap Analysis

---

## Category 1: Missing Features We Can Code

### 1.1 — Prefix-Based Comment Highlighting (Better Comments)

**CommentsVS Feature:** Highlight comments based on prefix character with distinct colors/styles:
- `// !` → Red (alerts/warnings)
- `// ?` → Blue (questions)
- `// *` → Green (highlights)
- `// //` → Gray + optional strikethrough (deprecated)
- `// -` → Dark Gray (disabled)
- `// >` → Purple italic (quotes)

**Current State:** Not implemented. No prefix detection or decoration logic exists.

**Work Required:**
- New file `src/rendering/prefixHighlighter.ts` — detect prefix patterns in regular (non-doc) comments
- Register decorations for each prefix type with appropriate colors/styles
- VS Code `textDecoration` CSS supports `line-through` for the `// //` strikethrough effect
- Add theme color contributions for each prefix type
- Add setting `kat-comment-studio.enablePrefixHighlighting` (boolean, default: true)
- Support `//` (C#/TS/JS), `#` (Python/PowerShell), `'` (VB) comment styles

### 1.2 — Comment Remover Commands

**CommentsVS Feature:** Bulk comment removal with 7 commands:
1. Remove All Comments
2. Remove All Comments in Selection
3. Remove All Except XML Doc Comments
4. Remove All Except Anchors
5. Remove XML Doc Comments Only
6. Remove Anchors Only
7. Remove Regions (`#region` / `#endregion`)

Smart cleanup: delete entire lines that become empty after removal.

**Current State:** Not implemented. No remove/strip comment logic exists.

**Work Required:**
- New file `src/commands/commentRemover.ts` — language-aware comment detection and removal
- Smart empty-line cleanup after removal
- Anchor-aware filtering (preserve TODO/HACK/etc.)
- Region directive removal
- Register 7 commands in `package.json`
- Add to editor context menu and Edit menu equivalent

### 1.3 — Custom Anchor Tags Setting

**CommentsVS Feature:** User-defined custom tags (e.g., `PERF, SECURITY, DEBT, REFACTOR`) via comma-separated setting. Custom tags highlighted in Goldenrod and appear in Code Anchors tree.

**Current State:** `anchorService.buildAnchorRegex()` accepts custom tags, `editorconfigService` parses `custom_anchor_tags`, but no VS Code setting exists to configure them. The wiring from editorconfig → scanner is also incomplete (TODO in `extension.ts`).

**Work Required:**
- Add setting `kat-comment-studio.customTags` (string, default: "") in `package.json`
- Add theme color `katCommentStudio.anchorCustom` (Goldenrod) as default
- Add hex color setting `kat-comment-studio.colors.custom` (default: "#DAA520" Goldenrod) as override
- Wire setting + editorconfig values into anchor service, scanner, and decoration manager
- Custom tags appear in type filter dropdown and tree view

### 1.4 — Tag Prefix Setting

**CommentsVS Feature:** Optional prefix characters (`@`, `$`) so `// @TODO` is treated same as `// TODO`. Prefix character highlighted same color as tag.

**Current State:** `anchorService.buildAnchorRegex()` accepts `tagPrefixes` parameter, `editorconfigService` parses `custom_anchor_tag_prefixes`. No VS Code setting exists.

**Work Required:**
- Add setting `kat-comment-studio.tagPrefixes` (string, default: "@, $") in `package.json`
- Wire setting + editorconfig into anchor service calls
- Ensure prefix character gets same decoration color as the tag
- Strip prefixes in Code Anchors tree display

### 1.5 — Tag Metadata: Due Dates

**CommentsVS Feature:** `TODO(2026-02-01): Remove workaround` — ISO date parsed and shown in tooltip. Combined form: `TODO(@mads, #1234, 2026-02-01)`.

**Current State:** `anchorService` extracts `@owner` and `#issue` metadata but does not parse `yyyy-MM-dd` date tokens.

**Work Required:**
- Extend `AnchorMatch` type with optional `dueDate: string` field
- Update regex/parsing in `findAnchorsInLine()` to detect ISO date tokens
- Show due date in anchor tree tooltip and hover
- Consider visual indicator for overdue items

### 1.6 — Smart Paste (Reflow on Paste)

**CommentsVS Feature:** Paste text into an XML doc comment and the extension automatically reflows the entire block.

**Current State:** Not implemented. No paste detection exists.

**Work Required:**
- Detect paste events via `onDidChangeTextDocument` (check change reason or change size heuristic)
- If paste target is within a doc comment block, trigger reflow on the containing block
- Add setting `kat-comment-studio.enableReflowOnPaste` (boolean, default: true)
- Debounce to avoid double-triggering

### 1.7 — Auto-Reflow While Typing

**CommentsVS Feature:** As you type in a doc comment and a line exceeds max length, automatically reflow with 300ms delay.

**Current State:** Not implemented.

**Work Required:**
- Monitor `onDidChangeTextDocument` for single-character insertions within doc comment ranges
- If edited line exceeds max width, trigger reflow after 300ms debounce
- Add setting `kat-comment-studio.enableReflowWhileTyping` (boolean, default: true)
- Careful not to swallow keystrokes — apply edit only after pause

### 1.8 — Light Bulb Action (CodeActionProvider)

**CommentsVS Feature:** Place cursor in XML doc comment, press Ctrl+. → "Reflow comment" action.

**Current State:** Not implemented. No `CodeActionProvider` registered.

**Work Required:**
- New `CodeActionProvider` that detects cursor in doc comment block
- Offer "Reflow comment" as a refactoring action
- Invoke the existing `reflowEngine` on the detected block

### 1.9 — Collapse by Default Setting

**CommentsVS Feature:** Option to automatically collapse XML doc comments when opening files.

**Current State:** Compact mode auto-folds, but no independent "collapse by default" setting for Off/Compact modes.

**Work Required:**
- Add setting `kat-comment-studio.collapseByDefault` (boolean, default: false)
- On file open (`onDidChangeActiveTextEditor`), if enabled, fold all doc comment ranges
- Only applies when rendering mode is Off or Compact (Full mode shows rendered content)

### 1.10 — Left Border Indicator

**CommentsVS Feature:** Subtle vertical line on left edge of rendered comments (configurable: Off/Multiline only/Inline only/Always).

**Current State:** Not implemented. No `borderLeft` styling on comment decorations.

**Work Required:**
- Add `borderLeft` CSS to comment decoration render options (e.g., `2px solid rgba(...)`)
- Add setting `kat-comment-studio.leftBorder` with enum: "off", "multilineOnly", "inlineOnly", "always"
- Apply conditionally based on comment block size and setting

### 1.11 — Anchor Navigation Keybindings (Next/Previous)

**CommentsVS Feature:** Alt+PageDown / Alt+PageUp to navigate between anchors in the current file.

**Current State:** Not implemented. No next/previous anchor commands.

**Work Required:**
- Add commands `kat-comment-studio.nextAnchor` and `kat-comment-studio.previousAnchor`
- Find anchors in current document, navigate cursor to next/previous from current position
- Register keybindings: Alt+PageDown, Alt+PageUp

### 1.12 — Code Anchors WebviewView (Replace TreeView with Grid)

**CommentsVS Feature:** Code Anchors tool window with sortable columns, filtering, search, and export. Columns include Type, File, Line, Owner, Issue, Description.

**Current State:** Tree-only implementation (`AnchorTreeProvider` via `TreeDataProvider`). Files as parent nodes, anchors as children. No sortable columns, no grid view.

**Work Required:**
- Replace `TreeView` registration with a `WebviewViewProvider` in the sidebar
- Render an HTML table with sortable/filterable columns: Type, Message, Meta (owner/issue/due date), File, Line, Project
- Column sorting: click header to sort ascending/descending
- Filtering: scope filter (Workspace/Folder/Document/Open Documents), type filter dropdown, text search input
- Row click → navigate to anchor location via `vscode.open` command (postMessage from webview → extension)
- Color-coded type indicators (colored dot/badge per anchor type)
- Toolbar buttons: Scan, Refresh, Export (communicate via postMessage)
- Keep export functionality (TSV/CSV/Markdown/JSON) wired through postMessage
- Responsive design that works in narrow sidebar
- Theme-aware styling (use VS Code CSS variables for colors)

### 1.13 — Editor Context Menu

**CommentsVS Feature:** Right-click context menu with Comment Studio submenu for quick access to rendering modes, collapse toggle, settings.

**Current State:** Menus only exist for `view/title` (tree view toolbar). No `editor/context` menu.

**Work Required:**
- Add `submenus` contribution for "Comment Studio" submenu
- Add `editor/context` menu items: toggle rendering, cycle mode, collapse/expand, reflow
- Add `when` clause to only show for supported languages

### 1.14 — EditorConfig → maxLineWidth Wiring

**CommentsVS Feature:** `.editorconfig` `max_line_length` property controls reflow width per project/folder.

**Current State:** `editorconfigService` parses `max_line_length` correctly. `extension.ts:45` has `// TODO: get maxLineWidth from editorconfig`. The value is hardcoded to 120 in the reflow command registration.

**Work Required:**
- In `reflowCommands.ts`, look up editorconfig for the active document's file path before reflowing
- Pass resolved `max_line_length` (or fallback to setting/default 120) to `reflowCommentBlock()`

### 1.15 — LINK: IntelliSense (Completions)

**CommentsVS Feature:** Type `LINK:` and get file path completions and anchor name completions.

**Current State:** Not implemented. No `CompletionItemProvider` exists.

**Work Required:**
- New `CompletionItemProvider` that activates inside comments after `LINK: `
- Provide file path completions (relative to current file and workspace)
- Provide anchor name completions from the anchor cache
- Register for supported languages

### 1.16 — LINK: Validation (Diagnostics)

**CommentsVS Feature:** Warning squiggles on broken LINK: references (missing files, invalid anchors).

**Current State:** `linkNavigator` hover shows resolved path but no `DiagnosticCollection` for validation.

**Work Required:**
- Create `DiagnosticCollection` for LINK: validation
- On document change/save, scan LINK: targets and resolve paths
- Add warning diagnostics for unresolvable targets
- Clear diagnostics when links are fixed

### 1.17 — Additional Settings Parity

**CommentsVS Feature:** Several settings exist in CommentsVS that have no equivalent in our extension.

**Current State:** Only 4 settings (renderingMode, enabledLanguages, dimOriginalComments, dimOpacity).

**Work Required:** Add the following settings to `package.json`:
- `kat-comment-studio.maxLineLength` (number, default: 120)
- `kat-comment-studio.enableReflowOnFormat` (boolean, default: true)
- `kat-comment-studio.enableTagHighlighting` (boolean, default: true)
- `kat-comment-studio.enableIssueLinks` (boolean, default: true)
- `kat-comment-studio.useCompactStyleForShortSummaries` (boolean, default: true)
- `kat-comment-studio.preserveBlankLines` (boolean, default: true)
- `kat-comment-studio.scanOnLoad` (boolean, default: true)
- `kat-comment-studio.fileExtensionsToScan` (string, with defaults)
- `kat-comment-studio.foldersToIgnore` (string, with defaults)
- Wire each into the appropriate subsystem

### 1.18 — Rendered Comment Theme Colors

**CommentsVS Feature:** 4 customizable color entries for rendered comments: Text, Heading, Code, Link.

**Current State:** Only anchor type colors are contributed. No rendered comment colors.

**Work Required:**
- Add theme colors: `katCommentStudio.renderedText`, `katCommentStudio.renderedHeading`, `katCommentStudio.renderedCode`, `katCommentStudio.renderedLink`
- Add hex override settings: `kat-comment-studio.colors.renderedText`, etc.
- Use these colors in `decorationFactory.ts` when creating rendered comment decorations

### 1.20 — Unified Color System (ThemeColor + Hex Settings Override)

**Issue:** Current code has a disconnect — `package.json` defines `ThemeColor` entries for anchor types (with dark/light/HC defaults), but `anchorDecorationManager.ts` uses hardcoded hex from `anchorType.color`, ignoring theme colors entirely. Only the tree view icons use `ThemeColor`.

**Approach: Option C — ThemeColor as defaults + hex settings as overrides**

**Work Required:**
- **Fix disconnect**: Change `anchorDecorationManager.ts` to use `new vscode.ThemeColor(anchorType.themeColorId)` instead of hardcoded hex. This makes inline decorations respect dark/light/HC theme defaults automatically.
- **Add hex override settings**: For every color (8 built-in anchors + custom + 4 rendered comment + 6 prefix types), add a setting like `kat-comment-studio.colors.todo` (string, format: hex color, default empty).
- **Resolution logic**: Create a color resolver utility — if hex setting is non-empty, use it; otherwise fall back to `ThemeColor`. This gives users a visual color picker in Settings UI while preserving theme-aware defaults.
- **Rebuild decorations on change**: When a color setting changes, dispose and recreate affected decoration types.
- **Document**: List all color IDs and setting keys in README with examples.

### 1.19 — Scrollbar Markers for Anchors

**CommentsVS Feature:** Anchor tags visible as colored markers in the scrollbar/minimap.

**Current State:** Anchor decorations exist inline but don't set `overviewRulerColor`.

**Work Required:**
- Add `overviewRulerColor` and `overviewRulerLane` to anchor decoration types in `anchorDecorationManager.ts`
- Each anchor type gets its themed color in the scrollbar gutter

---

## Category 2: Resolved — Revised Rendering Architecture

The original Category 2 items (inline text replacement, double-click to edit, mixed inline formatting) are **resolved by the new rendering approach** below. Instead of fighting VS Code's decoration limitations, we use the right APIs for the job.

### Revised Rendering Modes (replaces Compact/Full/Off)

**Two modes: Off and On**

| Mode | Behavior |
|------|----------|
| **Off** | Raw XML comments visible, no decorations, standard editing |
| **On** | Auto-fold all XML doc comments + make folded text transparent + CodeLens summary above method + hover shows rich Markdown popup + click CodeLens toggles fold state |

#### "On" Mode — Detailed Behavior

1. **Auto-fold**: All multi-line XML doc comment blocks are automatically collapsed via the existing folding provider.

2. **Transparent folded text**: The folded comment line (e.g., `/// <summary> ...`) is made transparent via decoration (`opacity: '0'` or `color: 'transparent'`) so it doesn't add visual noise. The line still takes vertical space but is invisible.

3. **CodeLens summary**: A `CodeLensProvider` places a one-line stripped summary above the method/class signature. Example:
   ```
   📖 Represents a user with basic contact information.
   public class User { ... }
   ```

4. **Rich Markdown hover**: A `HoverProvider` triggers when hovering over the CodeLens (hovers merge with the CodeLens position). Returns a `MarkdownString` with fully rendered documentation:
   - Bold section headings (Parameters, Returns, Remarks, etc.)
   - Inline `code`, **bold**, *italic*, ~~strikethrough~~
   - Clickable links
   - Code blocks with syntax highlighting
   - Parameter tables
   - Preserves markdown syntax from within XML tags (the CommentsVS feature)
   - XML tags like `<see>`, `<paramref>`, `<c>`, `<code>`, `<list>` converted to Markdown equivalents

5. **Click to toggle via CodeLens**: Clicking the CodeLens toggles the fold state:
   - **When collapsed**: CodeLens shows `📖 {summary text}` — click unfolds the raw XML for editing
   - **When expanded**: CodeLens changes to `📖 Collapse XML Comments` — click re-folds

6. **Click/keypress on transparent line**: If the user clicks on or navigates into a transparent folded comment line, intercept via `onDidChangeTextEditorSelection` — unfold the comment block, remove transparency, and show raw XML for editing. This replicates the CommentsVS "When caret enters comment" edit trigger natively.

7. **Auto-re-fold on cursor leave**: When the cursor moves out of an expanded comment block (detected via `onDidChangeTextEditorSelection`), auto-fold and re-apply transparency after a short delay (~500ms). This creates a seamless "expand to edit, collapse when done" flow.

#### Why This Approach Resolves Category 2

| Original Issue | Resolution |
|----------------|------------|
| Can't replace text with HTML inline | Don't need to — comments are folded/hidden, summary shown via CodeLens, rich content via Markdown hover |
| No double-click to edit | Click CodeLens to unfold, OR click/navigate into transparent line to auto-unfold; auto-re-fold when cursor leaves |
| Can't mix bold/italic/code in decorations | Markdown hover supports full formatting natively |

#### Impact on Existing Code

- **Remove**: Current `decorationManager.ts` Compact/Full rendering logic (inline `after` decorations)
- **Remove**: `decorationFactory.ts` — no longer needed for comment rendering (keep for anchor decorations)
- **Keep**: `commentRenderer.ts` — adapt output from `RenderedComment` sections to Markdown string
- **Keep**: `markdownProcessor.ts` — still needed for markdown-in-XML parsing
- **Keep**: `commentFoldingProvider.ts` — still needed, enhanced with transparent decoration on folded lines
- **Keep**: `editSuppression.ts` — repurpose for auto-re-fold behavior
- **New**: `CommentCodeLensProvider` — CodeLens with summary + toggle command
- **New**: `CommentHoverProvider` — rich Markdown hover for doc comments
- **Adapt**: `commentRenderer.ts` — add `renderToMarkdown()` method that outputs `MarkdownString`

---

## Todos

| ID | Title | Category |
|----|-------|----------|
| prefix-highlighting | Prefix-Based Comment Highlighting (Better Comments) | 1 |
| comment-remover | Comment Remover Commands | 1 |
| custom-tags-setting | Custom Anchor Tags Setting | 1 |
| tag-prefix-setting | Tag Prefix Setting | 1 |
| tag-due-dates | Tag Metadata: Due Dates | 1 |
| smart-paste | Smart Paste (Reflow on Paste) | 1 |
| auto-reflow-typing | Auto-Reflow While Typing | 1 |
| lightbulb-reflow | Light Bulb Action (CodeActionProvider) | 1 |
| collapse-default | Collapse by Default Setting | 1 |
| left-border | Left Border Indicator | 1 |
| anchor-navigation | Anchor Navigation Keybindings | 1 |
| anchors-webview-grid | Code Anchors WebviewView Grid (replaces TreeView) | 1 |
| editor-context-menu | Editor Context Menu | 1 |
| editorconfig-wiring | EditorConfig → maxLineWidth Wiring | 1 |
| link-intellisense | LINK: IntelliSense (Completions) | 1 |
| link-validation | LINK: Validation (Diagnostics) | 1 |
| settings-parity | Additional Settings Parity | 1 |
| rendered-theme-colors | Rendered Comment Theme Colors | 1 |
| scrollbar-markers | Scrollbar Markers for Anchors | 1 |
| unified-color-system | Unified Color System (ThemeColor + Hex Override) | 1 |
| brainstorm-inline-replace | ~~Brainstorm: Inline Text Replacement~~ | Resolved |
| brainstorm-click-edit | ~~Brainstorm: Double-Click to Edit~~ | Resolved |
| brainstorm-mixed-formatting | ~~Brainstorm: Mixed Inline Formatting~~ | Resolved |
| revised-rendering | Revised Rendering Architecture (Off/On) | 1 |

