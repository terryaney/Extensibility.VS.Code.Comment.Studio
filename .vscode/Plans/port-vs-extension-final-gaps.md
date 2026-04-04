# Plan: Finish Deferred Features — Anchors WebviewView Grid + Revised Rendering

## Problem Statement

Two features were deferred from the `port-vs-extension-gaps.md` plan as too large for that pass:

1. **anchors-webview-grid** — Add a bottom-panel WebviewView with a sortable/filterable grid for Code Anchors (keep existing sidebar tree view)
2. **revised-rendering** — Replace Compact/Full decoration-based rendering with a CodeLens + Hover + Auto-fold architecture

## Recommended Order

**Phase 1: Revised Rendering** (fewer cross-cutting dependencies, can be done without touching anchors)
**Phase 2: Anchors WebviewView Grid** (isolated addition — new panel, no changes to existing tree)

---

## Phase 1: Revised Rendering Architecture

### Summary

Replace the current three-mode rendering (`off | compact | full`) with a two-mode system (`off | on`). In "on" mode:

- Auto-fold all XML doc comment blocks
- Make folded comment lines transparent (invisible but occupy space)
- Show a CodeLens summary line above the method/class (e.g., `📖 Summary text here`)
- Hovering over the CodeLens area shows a rich Markdown popup with full documentation
- Clicking the CodeLens toggles fold state
- Clicking/navigating into a transparent folded line auto-unfolds for editing
- When cursor leaves an expanded block, auto-re-fold after ~500ms

### Todo Breakdown

#### 1.1 — Update configuration and types
**Files:** `src/types.ts`, `src/configuration.ts`, `package.json`

- Change `RenderingMode` type from `'off' | 'compact' | 'full'` to `'off' | 'on'`
- Update `package.json` setting enum: remove "compact"/"full", add "on"
- Update `cycleRenderingMode` command title to `(Off → On)`
- Update `getConfiguration()` and `setRenderingMode()` in configuration.ts
- Remove `useCompactStyleForShortSummaries` setting (no longer relevant — there's no compact vs full distinction)

#### 1.2 — Create CommentCodeLensProvider
**New file:** `src/rendering/commentCodeLensProvider.ts`

- Implement `vscode.CodeLensProvider`
- Scan document for XML doc comment blocks using existing `commentParser`
- For each block, place a CodeLens on the line *before* the comment block starts (i.e., above the `///` lines, which is the method/class signature line or blank line above)
  - Actually: place it on the first line of the comment block itself (startLine). When folded, this is the visible line. The CodeLens appears above it.
- **When folded:** Show `📖 {stripped summary text}` — command = unfold that block
- **When expanded:** Show `📖 Collapse XML Comments` — command = fold that block
- Track fold state per block (Map of startLine → folded boolean)
- Register toggle command: `kat-comment-studio.toggleCommentFold`
- Fire `onDidChangeCodeLenses` event when fold state changes
- Use existing `getStrippedSummary()` from `commentRenderer.ts` for summary text

#### 1.3 — Create CommentHoverProvider
**New file:** `src/rendering/commentHoverProvider.ts`

- Implement `vscode.HoverProvider`
- Trigger when hovering over lines within a doc comment block range
- Parse the comment block using `commentRenderer.renderCommentBlock()`
- Convert `RenderedComment` sections to a `vscode.MarkdownString` with:
  - Bold section headings (Parameters, Returns, Remarks, etc.)
  - Inline `code`, **bold**, *italic*, ~~strikethrough~~
  - Clickable links
  - Code blocks with syntax highlighting
  - Parameter tables
  - XML tags (`<see>`, `<paramref>`, `<c>`, `<code>`, `<list>`) converted to Markdown
- Set `MarkdownString.isTrusted = true` for command links
- Set `MarkdownString.supportHtml = true` if needed for tables

#### 1.4 — Add renderToMarkdown() to commentRenderer
**File:** `src/rendering/commentRenderer.ts`

- Add new export function: `renderToMarkdown(block: XmlDocCommentBlock, repoInfo?: GitRepositoryInfo): vscode.MarkdownString`
- Convert `RenderedComment` sections to Markdown:
  - Summary → plain text (no heading)
  - Param/TypeParam → `**Parameters:**` heading + table or list
  - Returns → `**Returns:** text`
  - Remarks → `**Remarks:**` + content
  - Example → `**Example:**` + code block
  - Exception → `**Exceptions:**` + list
  - SeeAlso → `**See Also:**` + links
- Map `SegmentType` to Markdown formatting:
  - Bold → `**text**`
  - Italic → `*text*`
  - Code → `` `text` ``
  - Link → `[text](url)`
  - Strikethrough → `~~text~~`
  - IssueReference → `[#123](url)`
  - ParamRef/TypeParamRef → `` `paramName` ``

#### 1.5 — Rewrite DecorationManager for Off/On mode
**File:** `src/rendering/decorationManager.ts`

- Remove all Compact/Full rendering logic (inline `after` decorations for summary text)
- Remove `compactSummary` and `sectionHeading` decoration types
- Keep `dimmedComment` decoration — repurpose for making folded lines transparent (`color: 'transparent'`, `opacity: '0'`)
- Keep `leftBorder` decoration
- **On mode behavior:**
  1. Find all doc comment blocks
  2. Auto-fold them via `foldAllDocComments()`
  3. Apply transparent decoration to folded block lines
  4. Track which blocks are currently folded
- **Cursor-enters-comment detection:**
  - Listen to `onDidChangeTextEditorSelection`
  - If cursor enters a folded/transparent comment block → unfold it, remove transparency
  - Notify CodeLensProvider that fold state changed (so it updates to "Collapse" text)
- **Auto-re-fold on cursor leave:**
  - When cursor moves OUT of an expanded comment block → start 500ms timer
  - On timer expiry, re-fold and re-apply transparency
  - Cancel timer if cursor re-enters the block
  - Repurpose `editSuppression.ts` pattern for this debounce logic

#### 1.6 — Update extension.ts wiring
**File:** `src/extension.ts`

- Register `CommentCodeLensProvider` for supported languages
- Register `CommentHoverProvider` for supported languages
- Register `kat-comment-studio.toggleCommentFold` command
- Update `toggleRendering` command: cycle between `off` and `on` (not `compact`)
- Update `cycleRenderingMode` command: cycle `off → on → off`
- Wire rendering mode changes to CodeLens provider (refresh on mode change)
- Dispose/recreate providers on mode change if needed

#### 1.7 — Clean up decorationFactory.ts
**File:** `src/rendering/decorationFactory.ts`

- Remove `compactSummary` and `sectionHeading` decoration types
- Keep `dimmedComment` (repurposed for transparency)
- Keep `leftBorder`
- Add `transparentComment` decoration type (if separate from dimmed)
- Simplify `DecorationStyles` interface

#### 1.8 — Update tests
**Files:** `test/commentRenderer.test.ts` + new test files

- Add tests for `renderToMarkdown()` output
- Update any tests that reference Compact/Full modes
- Test CodeLens provides correct text for folded/unfolded states
- Test hover returns valid MarkdownString

---

## Phase 2: Anchors WebviewView Grid (Bottom Panel)

### Summary

Add a new WebviewView in the bottom panel area (alongside Problems, Output, Debug Console) that shows Code Anchors in a sortable, filterable HTML table/grid. The existing sidebar tree view remains as-is (renamed to "KAT Comment Studio").

### Todo Breakdown

#### 2.1 — Register WebviewView in package.json
**File:** `package.json`

- Add a new view container in the `"panel"` location (bottom panel):
  ```json
  "views": {
    "panel": [
      {
        "type": "webview",
        "id": "kat-comment-studio.anchorsGrid",
        "name": "KAT Comment Studio - Code Anchors"
      }
    ]
  }
  ```
- Rename existing sidebar view: `"name": "KAT Comment Studio"` (from "Code Anchors")
- Rename sidebar view container title to "KAT Comment Studio"
- Add command: `kat-comment-studio.showAnchorsGrid` — "Show Code Anchors Grid"
- Add toolbar buttons for the panel view (Scan, Refresh, Export)

#### 2.2 — Create AnchorsGridProvider (WebviewViewProvider)
**New file:** `src/anchors/anchorsGridProvider.ts`

- Implement `vscode.WebviewViewProvider`
- `resolveWebviewView()` sets up the HTML content
- Receives anchor data from extension and renders into the webview
- **Inbound messages (extension → webview):**
  - `updateAnchors` — full anchor list refresh
  - `updateScope` — current scope label
  - `updateFilters` — active type filters
- **Outbound messages (webview → extension):**
  - `navigateTo` — { filePath, lineNumber } → open file and go to line
  - `requestSort` — { column, direction }
  - `requestFilter` — { types[], searchQuery }
  - `requestExport` — { format }
  - `requestScan` — trigger workspace scan
  - `requestRefresh` — trigger refresh

#### 2.3 — Create webview HTML/CSS/JS
**New file:** `src/anchors/anchorsGridWebview.ts` (generates HTML string)

Grid UI modeled after CommentsVS code-anchors screenshot:

- **Columns:** Type (color indicator), Description, File, Line, Owner, Issue, Due Date
- **Column sorting:** Click header to sort asc/desc (toggle on repeated click), sort indicator arrow
- **Filtering:**
  - Type filter dropdown (checkboxes for each anchor type)
  - Free-text search input (filters description, file, owner)
  - Scope indicator (read-only, set from sidebar)
- **Row styling:**
  - Colored left border or dot per anchor type
  - Hover highlight
  - Click → navigate to anchor location
  - Overdue dates shown in red/warning color
- **Toolbar:** Scan, Refresh, Export buttons (icon + tooltip)
- **Empty state:** Message when no anchors found
- **Theme-aware:** Use VS Code CSS variables:
  - `--vscode-editor-foreground`, `--vscode-editor-background`
  - `--vscode-list-hoverBackground`, `--vscode-focusBorder`
  - `--vscode-badge-background` for type indicators
- **Responsive:** Works in narrow panel, horizontal scroll for wide tables

#### 2.4 — Wire into extension.ts
**File:** `src/extension.ts`

- Register `AnchorsGridProvider` via `vscode.window.registerWebviewViewProvider`
- Register `kat-comment-studio.showAnchorsGrid` command → `vscode.commands.executeCommand('kat-comment-studio.anchorsGrid.focus')`
- When anchor cache updates (scan, refresh, document save), push updated data to both tree provider AND grid provider
- Wire grid's postMessage handlers (navigate, sort, filter, export, scan, refresh) to existing anchor service/cache/exporter
- Grid and tree share the same anchor cache — they're two views of the same data

#### 2.5 — Update anchor data flow
**File:** `src/anchors/anchorCache.ts` (minor), `src/extension.ts`

- Ensure cache update events notify both tree and grid views
- Grid provider stores its own sort/filter state (independent of tree)
- Grid filtering is client-side (all data sent to webview, JS handles sort/filter/search)
- Large workspaces: consider pagination or virtual scrolling if >1000 anchors

#### 2.6 — Tests
- Test `AnchorsGridProvider` message handling (postMessage mock)
- Test HTML generation includes correct columns and theme variables
- Test sort/filter logic in webview JS

---

## Files Changed Summary

### Phase 1 (Revised Rendering)
| Action | File |
|--------|------|
| Modify | `src/types.ts` |
| Modify | `src/configuration.ts` |
| Modify | `package.json` |
| **New** | `src/rendering/commentCodeLensProvider.ts` |
| **New** | `src/rendering/commentHoverProvider.ts` |
| Modify | `src/rendering/commentRenderer.ts` |
| **Major rewrite** | `src/rendering/decorationManager.ts` |
| Modify | `src/rendering/decorationFactory.ts` |
| Modify | `src/rendering/editSuppression.ts` (repurpose for auto-re-fold) |
| Modify | `src/extension.ts` |
| Modify | `test/commentRenderer.test.ts` |

### Phase 2 (Anchors Grid)
| Action | File |
|--------|------|
| Modify | `package.json` |
| **New** | `src/anchors/anchorsGridProvider.ts` |
| **New** | `src/anchors/anchorsGridWebview.ts` |
| Modify | `src/extension.ts` |
| Minor | `src/anchors/anchorCache.ts` (event notification) |

## Risks & Considerations

1. **CodeLens positioning**: CodeLens always appears above the line it's registered on. If we register on the first `///` line, when folded the CodeLens appears above the fold — this is the desired behavior.
2. **Transparent text + fold interaction**: VS Code's folding API doesn't expose per-range fold state. We may need to track fold state ourselves via selection change detection (cursor position relative to known comment ranges).
3. **Auto-re-fold timing**: The 500ms delay needs careful tuning. Too fast = annoying during editing. Too slow = comments stay expanded too long. May need to only auto-re-fold if no edits were made (otherwise wait for explicit toggle).
4. **Webview state persistence**: WebviewViews in the panel can be destroyed/recreated by VS Code. Use `webview.onDidDispose` and restore state from cache.
5. **Large workspace performance**: The grid receives all anchors at once. For very large workspaces (thousands of anchors), client-side virtual scrolling or pagination may be needed. Start without it, add if needed.
