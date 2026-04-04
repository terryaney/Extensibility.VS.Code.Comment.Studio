## Phase 1: Code Anchors Panel Fixes (Complete)

Implemented shared model, scope/type/search filtering, metadata enrichment, runtime view titles/badges, grid column resizing + persistence, icon+text type cells, row/cell copy actions.

---

Stabilize the Code Anchors panel by separating real defects from API constraints, then implement the missing wiring in the tree and webview layers. The recommended approach is to keep the existing bottom-panel webview, use supported view APIs for title/badge updates, centralize grid filter/scope state so refreshes do not reset it, and define Project as each loaded .csproj in the current workspace so the dropdown aids filtering at the C# project level.

**Steps**
1. Confirm the panel/view model and API boundaries before coding. The current extension contributes two views in package.json: a tree view in the KAT Comment Studio activity container and a webview view in the bottom panel. Use the runtime-created TreeView/WebviewView handles, not manifest-only strings, for dynamic title/badge behavior.
2. Fix item 1 and item 4 together by storing the created TreeView and WebviewView instances and updating their title/description/badge after every scan or cache refresh. This depends on exposing view references from the existing registration path in src/extension.ts and src/anchors/anchorsGridProvider.ts. The bottom webview title can stay manifest-defined as the default, but the runtime view handle should set the final title and badge when visible.
3. Fix item 2 by replacing the grid’s current checkbox logic with explicit include-state semantics and persisted webview state. This depends on refactoring the client logic in src/anchors/anchorsGridWebview.ts so checked means included, unchecked means excluded, rebuilding the dropdown does not mutate the active selection, and refresh/scan messages preserve both type filter and search text. Also wire refresh so it does not immediately overwrite user state with a stale requestRefresh/postMessage round-trip.
4. Fix the scope model for item 3 in phases. Phase 1: implement actual scope filtering, because the current AnchorTreeProvider scope is stored but never applied. Phase 2: extend scanned anchor metadata with repository identity and loaded C# project identity so the grid/tree can filter by Workspace, Repo: X, and Project: Y. Project must mean each loaded .csproj in the current workspace, not workspace folders.
5. Add repo-aware and project-aware grouping by enriching AnchorMatch-derived view models during scan/load. Reuse src/navigation/gitService.ts to resolve repo identity per file, and add a project-resolution step that maps each anchor file to the loaded .csproj that contains it. Do this in the scan pipeline in src/anchors/workspaceScanner.ts or immediately after scan results are produced in src/extension.ts so both tree and grid receive the same metadata.
6. Add a scope dropdown to the grid toolbar for item 3 and make it the source of truth for the webview scope label. The current toolbar only shows static text Workspace. Replace it with a dropdown that lists Workspace, Current Folder, Current Document, Open Documents, Repo: X for each unique repo in results, and Project: Y for each loaded .csproj represented in results. Send selection changes back to the extension host so tree and grid stay synchronized.
7. Define scope resolution semantics explicitly so Current Folder behaves deterministically in both folder and workspace-file windows. In a single-folder window, Current Folder is that workspace folder. In a multi-root .code-workspace window, Current Folder should resolve from the active editor by calling the containing workspace folder for that document; if there is no active editor, fall back to the first workspace folder or disable that scope until a document is active. Detecting whether VS Code is in a folder window or workspace-file window is straightforward from workspace state, but detecting that the user "opened a solution" is not a first-class base VS Code concept; solution awareness must come from discovered .sln/.csproj files, not from a dedicated workspace mode flag.
8. Add resizable grid columns and persisted widths. This requires changing the table/header rendering in src/anchors/anchorsGridWebview.ts so each column has a drag handle, width changes are applied to both header and body cells, and the final widths are persisted through the webview state or extension-side storage and restored on reopen.
9. Improve item 5 by rendering icon plus text in the grid Type column using the same type metadata already used by the tree. Reuse BUILTIN_ANCHOR_TYPES for codicon name and theme color mapping, then render either codicons in the webview or extension-provided icon glyphs with theme-aware CSS. Keep the existing text label, and switch from the current colored dot-only presentation to icon plus text with the same semantic colors.
10. Fix the new context-menu issue by making the webview row context menu intentional instead of accepting the default cut/copy/paste menu. The current grid contributes no custom webview/context menu and does not implement clipboard actions, so Copy only works if the browser selection model happens to have selected text; Cut/Paste have no value because the grid is read-only. Recommended fix: suppress Cut and Paste for row context areas, add a Copy Row / Copy Cell / Copy Anchor command path that uses the webview-to-extension message channel and vscode.env.clipboard.writeText, and optionally keep normal text selection copy inside searchable text controls such as the filter input.
11. Add regression coverage around the parts that can be tested without a full UI harness. Unit-test the scope/type filtering logic in extracted helper functions, and add focused tests for any new view-model builder that derives repo/project scopes, remembered column widths, and title counts.
12. Verify manually in the extension host: scan anchors, toggle type checkboxes repeatedly, refresh, rescan, switch scopes, resize columns, reopen the view, confirm badge counts, confirm icon rendering, and validate the right-click copy behavior in the grid.

**Relevant files**
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\package.json — current contributed view titles and view/title menu entries; defaults remain here but runtime updates should come from view handles
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\extension.ts — creates the tree view, registers commands, updates anchor views, and is the best place to synchronize scan results, counts, scope, and both providers
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\anchors\anchorTreeProvider.ts — stores anchors, scope, and type filter today; currently ignores scope in getFilteredAnchors and needs shared filtering logic
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\anchors\anchorsGridProvider.ts — owns the WebviewView handle and can update title, badge, scope, and clipboard-related message handling
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\anchors\anchorsGridWebview.ts — current toolbar, type dropdown, sorting, empty state, and right-click behavior surface; needs the largest UI-state refactor
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\anchors\workspaceScanner.ts — scan pipeline where workspace-folder and repo metadata can be attached or prepared for later filtering
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\navigation\gitService.ts — existing repo detection and caching, currently unused by anchors
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\src\types.ts — existing GitRepositoryInfo types; may need a view-model or anchor-metadata extension for repo/project identity
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\test\unit\anchorService.test.ts — likely place to extend filtering-related tests if logic stays near anchor services
- c:\BTR\Camelot\Extensibility\VS.Code.Comment.Studio\test\unit\gitService.test.ts — existing git parsing tests to reuse if repo labels become part of anchor filtering

**Verification**
1. Launch the extension host and confirm the bottom panel title shows KAT Comment Studio - Code Anchors and the badge displays total anchors with 99+ cap.
2. In the grid, uncheck NOTE and TODO, verify they disappear, re-check them, and verify they return without needing Scan or Refresh.
3. Repeat step 2, then click both Scan and Refresh and confirm the checked state persists instead of reverting.
4. Use the new scope dropdown to switch between Workspace, Current Folder, Current Document, Open Documents, each Repo entry, and each Project entry, and verify tree and grid show the same filtered count.
5. Resize several columns, close and reopen the view, and confirm the last widths are restored.
6. Confirm the grid Type column shows icon plus text with correct semantic colors for built-in types and a sensible fallback for custom tags.
7. Right-click a row and verify Cut/Paste are absent or disabled, and Copy Row copies a deterministic whole-row summary to the clipboard.
8. Run the existing unit test suite and any added filtering tests to catch regressions in scan/filter logic.

**Decisions**
- Included scope: planning the fix and documenting why each requested behavior fails today and how to correct it.
- Excluded scope: redesigning the overall panel architecture away from a webview or adding editable grid interactions.
- Project means each loaded .csproj in the current workspace or folder, and the scope dropdown should use those project identities for filtering.
- The supported scopes should be Workspace, Current Folder, Current Document, Open Documents, Repo: X, and Project: Y.
- Scope selection should be shared between the bottom grid and the tree view.
- Current Folder means the workspace folder containing the active document. In a single-folder window that is the root folder; in a .code-workspace window it resolves via the active document's containing workspace folder. If there is no active document, Current Folder should be disabled rather than falling back to an arbitrary folder.
- VS Code can reliably tell whether the window is a folder or multi-root workspace from workspace state, but not whether the user conceptually opened a solution as a first-class workspace mode. Solution awareness must be inferred from discovered .sln and .csproj files.
- The count badge only needs to appear on the bottom panel grid view.
- The count badge is feasible because current VS Code APIs expose badge on TreeView and WebviewView. Dynamic title text is also feasible on the created view handles, but not from the manifest alone.
- The original type-filter bug is not a VS Code limitation; it is a state-management bug in the webview script.
- Resizable column widths should persist across view hides/reloads and extension restarts.
- The right-click Cut/Paste behavior is mostly a UX design gap: the grid is read-only, so those actions should not be offered there.
- Copy should default to a human-readable whole-row summary such as "BUG | description | path:line".

**Further Considerations**
1. Project discovery source: if the extension cannot infer loaded .csproj files directly from VS Code state, it will need a deterministic workspace scan for .csproj files and a rule for mapping files to the nearest containing project.
2. Badge placement is settled on the bottom grid view only, which reduces implementation scope and avoids redundant count updates.
3. Copy format is settled on whole-row summaries; a separate Copy Cell action can be added later only if it proves useful.

---

## Phase 2: Grid Polish & Behavior Fixes (Complete)

### Issue 1: Grid type icons don't match tree pane icons; type text isn't colorized

**Why it doesn't work today:** The tree view uses VS Code `ThemeIcon` codicons (e.g. `checklist`, `alert`, `bug`) with `ThemeColor` tinting. The webview grid can't use `ThemeIcon` — it's a separate browser context. The previous implementation used `getIconGlyph()` which maps codicon names to arbitrary Unicode glyphs (`✓`, `!`, `◉`, etc.) that don't visually match. The type label text is currently rendered in the default foreground color, not the anchor's semantic color.

**Fix:** Use the VS Code codicon font that ships with every webview. The webview already loads `vscode-codicons` via the `--vscode-font-family` variable infrastructure, so we can reference codicon glyphs by their CSS class (e.g. `.codicon-checklist`). Emit a `<span>` with the matching `codicon codicon-{name}` class for the icon, tinted with the anchor's hex color. Also apply the same color to `.type-label` text. Store the codicon name per type in `TYPE_METADATA` instead of a Unicode glyph. For the type filter dropdown, do the same: use a codicon span + colored text.

### Issue 2: Type filter dropdown renders in the wrong position

**Why it doesn't work today:** The `.filter-dropdown` is positioned with `position: absolute` but its nearest positioned ancestor is the `<body>` (not the `.toolbar`), so it lands at the top-left of the viewport instead of anchored below the "Type ▾" button. The CSS does not set `position: relative` on the toolbar or any parent container.

**Fix:** Add `position: relative` to the `.toolbar` rule so that `position: absolute` on `.filter-dropdown` resolves relative to the toolbar. Then position it with `top: 100%; right: 0` (or calculated from the button rect) so it appears directly below the filter button. Also apply codicon icons and colored text to the dropdown labels for visual consistency with the grid.

### Issue 3: Repo scope labels don't match Source Control sidebar names

**Why it doesn't work today:** `getRepositoryDescriptor()` in `gitService.ts` builds the label as `owner/repository` (parsed from the remote URL) when a remote exists, or `path.basename(rootPath)` when it doesn't. The Source Control sidebar gets its repo names from the VS Code Git extension API (`vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1).repositories`), which uses the folder name of the `.git` parent directory — essentially `path.basename(rootPath)`. So the current label often shows `terry.aney/Camelot` when Source Control shows `Camelot`.

**Fix:** Change `getRepositoryDescriptor()` to always use `path.basename(rootPath)` as the label, matching the VS Code Git extension's naming convention. The `owner/repository` detail can optionally go into a `description` field or tooltip, but the primary label should be the folder name. This matches what users see in Source Control.

### Issue 4: Badge doesn't reflect filtered count; no visual indicator when filters are active

**Why it doesn't work today:** `applyViewMetadata()` in `anchorsGridProvider.ts` always sets `badge.value` to `this.model.totalCount` — the unfiltered total. When type filter or search text reduces the visible set, the badge stays at the total. There is no icon or indicator on the view description showing that a filter is active.

**Fix:** Change the badge value to `filteredCount` (the number of anchors that survive scope + type + search filtering). When any filter is active (scope is not `workspace`, or `includedTypes` is set, or `searchQuery` is non-empty), prepend a filter icon to the view description text so the user sees something like `⊜ Workspace (42)`. Update the tooltip to say `42 of 128 code anchors (filtered)`. When no filter is active, show the plain count with no icon.

### Issue 5: Grid pane title doesn't show "- Code Anchors" suffix

**Why it doesn't work today:** The `package.json` manifest defines `"name": "KAT Comment Studio - Code Anchors"` for the webview view, which is correct. However, in `applyViewMetadata()` the runtime code sets `this.view.title = 'KAT Comment Studio - Code Anchors'`. For `WebviewView`, the `title` property replaces the manifest name, and VS Code does render it — but VS Code's bottom panel tab sometimes truncates long titles. The actual title IS being set correctly, so if you see it missing, it may be a tab-width issue, or the view hasn't resolved yet. Will verify the title is reliably applied and not overwritten elsewhere.

**Fix:** Confirmed the title is already set to `'KAT Comment Studio - Code Anchors'` in `applyViewMetadata()`. No code change needed unless it turns out there's a timing issue. Will verify during testing and add an explicit early set in `resolveWebviewView` if needed.

### Issue 6: Export prompts for a save location instead of opening in the editor

**Why it doesn't work today:** `exportAnchorsToFile()` in `anchorExporter.ts` uses `vscode.window.showSaveDialog()` to prompt the user for a file location, then writes the content with `vscode.workspace.fs.writeFile()`. This requires the user to choose a path and name before they can even see the content.

**Fix:** Replace `showSaveDialog` + `writeFile` with `vscode.workspace.openTextDocument({ content, language })` + `vscode.window.showTextDocument()`. This opens the exported content as an untitled editor document. The user can review it and save when ready via Ctrl+S. Map the format to a language ID for syntax highlighting: `json` → `json`, `markdown` → `markdown`, `csv`/`tsv` → `plaintext`.

### Issue 7: Grid divider lines are nearly invisible in dark mode

**Why it doesn't work today:** Row borders use `border-bottom: 1px solid var(--vscode-editorGroup-border, rgba(128,128,128,0.2))` — the fallback `rgba(128,128,128,0.2)` is only 20% opacity gray, which is barely visible on dark backgrounds. Column headers have no vertical separators at all, so headers blur together visually. The `--vscode-editorGroup-border` theme variable is often not set or very faint in many dark themes.

**Fix:** Replace the fallback with a higher-contrast value like `rgba(255,255,255,0.12)` for dark themes (VS Code webviews respond to theme kind). A simpler and more portable approach: use `var(--vscode-editorGroup-border, rgba(128,128,128,0.35))` to raise the fallback opacity. Add `border-right: 1px solid ...` to `th` elements (except the last) so column headers have visible vertical dividers. Also add matching `border-right` to `td` elements for full grid lines.

---

### Todos (Phase 2)

- `p2-grid-codicons`: Use codicon font classes for type icons, colorize type labels in grid rows and filter dropdown
- `p2-filter-position`: Fix filter dropdown positioning, add codicon+color to dropdown items
- `p2-repo-labels`: Change repo descriptor label to folder basename (matching Source Control)
- `p2-badge-filtered`: Badge shows filtered count, add filter-active indicator icon
- `p2-grid-title`: Verify grid pane title shows correctly with suffix
- `p2-export-editor`: Export opens untitled editor document instead of save dialog
- `p2-grid-dividers`: Increase grid line visibility in dark mode, add vertical column dividers

---

## Phase 3 — Codicon Fix, Title/Tooltip, Export Refinements (Complete)

### Issue 1: Grid type icons render as empty squares (codicon font not loading)

**Why it doesn't work today:** The CSP `font-src` directive is set to the `dist` folder URI string-interpolated from `asWebviewUri()`. The `@vscode/codicons` stylesheet's `@font-face` references the `.ttf` file via a relative URL with a cache-busting query string (`codicon.ttf?721d4c0a96379d0c13d3d5596893c348`). CSP path matching compares the resolved font URL against the `font-src` value, and the folder URI (without trailing slash or wildcard) fails to match the query-string-bearing TTF URL. Additionally, the CSP `style-src` only allows `'nonce-...'`, but the external `codicon.css` stylesheet loaded via `<link>` also needs the webview's resource origin allowed.

**Fix:** Replace the hand-built CSP source strings with `webview.cspSource` — the VS Code-provided CSP origin token that covers all `asWebviewUri()` resources for that webview. Use it in both `font-src` and `style-src`. This is VS Code's recommended pattern for webview CSP and eliminates the path/query mismatch.

### Issue 2: Panel tab shows "KAT COMMENT STUDIO (2)" — missing "- Code Anchors" suffix

**Why it doesn't work today:** The `WebviewView.title` is set to `'KAT Comment Studio - Code Anchors'` at runtime. However, VS Code's bottom panel constructs the tab tooltip by combining `title + " - " + badge.tooltip`. The reported tooltip of `"KAT Comment Studio - 2 of 39 code anchors (filtered)"` confirms the runtime `title` is in effect. The issue is VS Code's panel tab rendering: it displays the `title` in ALL CAPS and may truncate or clip it. This appears to be a panel UI rendering limitation — the title IS being set but the tab only renders the visible portion.

For the separate request to change the tooltip format: the tooltip the user sees is auto-constructed by VS Code as `{title} - {badge.tooltip}`. We control `badge.tooltip`, so changing it to the requested format is straightforward. The requested format: `"KAT Comment Studio - Code Anchors"` when unfiltered, `"KAT Comment Studio - Code Anchors (filtered 2 of 39)"` when filtered. Since VS Code prepends the `title` and ` - ` automatically, we should set `badge.tooltip` to `"Code Anchors"` (unfiltered) or `"Code Anchors (filtered 2 of 39)"` (filtered) so the combined tooltip reads correctly.

**Fix:** Set `badge.tooltip` to `'Code Anchors'` or `'Code Anchors (filtered X of Y)'`. Test whether the tab tab title truncation is a width issue in practice — if it is, there's no API workaround. If the tab DOES show the full title, no further action needed.

### Issue 3: Can we have an icon in the tooltip or title badge?

**Why this can't be done:** The `WebviewView.badge` API signature is `{ value: number; tooltip: string }`. There is no icon, image, or ThemeIcon parameter. The `title` property is a plain string — no rich content, codicons, or Markdown. VS Code does not support icons in panel tab tooltips or badges for WebviewView. This is an API limitation, not a bug. Unicode characters (like `⊜` in the description) work in `description` and `tooltip` strings but render as text, not as themed icons.

### Issue 4: Export format order and filtered-only export

**Why it doesn't work today (export scope):** The export command in `extension.ts` calls `anchorCache.getAll()`, which returns all scanned anchors regardless of scope, type filter, or search query. The filtered set is computed in `refreshAnchorPresentation()` but not stored anywhere accessible to the export command.

**Format ordering** is just the sequence of items in the `showQuickPick` array, and TSV is still listed as the first option.

**Fix:** Remove the TSV option. Reorder to CSV, Markdown, JSON. For filtered export: recompute the filtered set at export time using the same `filterAnchors()` call with the current `anchorViewState` and `getCurrentAnchorFilterContext()`, so export always reflects what the user currently sees.

### Note on Scan vs Refresh

The extension defines both `scanAnchors` and `refreshAnchors` commands. Currently both perform a full filesystem scan. The codebase structure allows for a future optimization where `Refresh` could be a fast in-memory re-parse (useful for config changes) while `Scan` remains the expensive full-workspace crawl. For now, both do the same full scan. The `Refresh` button icons have been hidden in the UI so users see only the `Scan` button, eliminating UI confusion from duplicate functionality.

All three icon references (tree view, grid view, and command definition) have been removed.

---

### Todos (Phase 3)

- `p3-codicon-csp`: Fix CSP to use webview.cspSource for font-src and style-src
- `p3-tooltip-format`: Set badge.tooltip to 'Code Anchors' / 'Code Anchors (filtered X of Y)'
- `p3-export-filtered`: Export uses filtered anchors, remove TSV, reorder to CSV/Markdown/JSON

---

## Phase 4 — Link Navigation, Anchor Colorization, Pane Refresh, Completion, Status Bar (Complete)

Eleven bugs discovered via manual code anchor testing, plus two feature requests (rendering status bar indicator and LINK: keyword colorization). Bugs range from orphaned navigation code that was never wired up (bugs 6-8), to decoration logic that doesn't account for optional metadata syntax (bugs 2, 10, 11), to pane refresh only triggering on save (bug 1), plus grid display issues (owner `@` prefix, raw ISO date format).

### Shared Root Causes

**Navigation (Bugs 6, 7, 8):** `navigateToLinkTarget()` exists with solid implementation but is never called — the DocumentLink provider creates plain URIs that VS Code opens without custom navigation. One command registration fixes all three.

**Colorization (Bugs 2, 10, 11):** `anchorDecorationManager.ts` expects `:` immediately after the tag text, but metadata like `(name)`, `(@owner)`, or `(2026-03-27)` appears between tag and colon. One fix handles all three. Any anchor type can have parenthesized metadata — ANCHOR uses `(name)` for naming, all other tags use `(@owner)`, `(date)`, or `(@owner, date)`. LINK is the only keyword that should NOT support metadata (it's a separate navigation system, not an anchor type).

### Bug 1: Anchor pane doesn't refresh on edit (only on save)

**Why:** `onDidChangeTextDocument` in `extension.ts:181-188` calls `anchorDecorationManager?.updateDecorations(editor)` (inline colorization only). It does NOT call `scanDocument()`, `anchorCache.update()`, or `refreshAnchorPresentation()`. Those only run inside `onDidSaveTextDocument` at line 524.

**Fix:** Add a debounced document change handler that re-scans the active document for anchors, updates the cache, and calls `refreshAnchorPresentation()`. Use a 500ms debounce to avoid excessive scanning on rapid typing. Only scan the changed document, not the entire workspace.

### Bug 12: Anchor metadata parser — `()` and `[]` should be interchangeable

**Why:** The regex treats `()` and `[]` as separate positional groups with different rules. `()` captures name/@owner/date, `[]` only matches `[#digits]`. This means `TODO[#123, @terry]:` or `ANCHOR[name]:` don't work. The delimiters should be interchangeable with comma-separated tokens parsed by type.

**Fix:** Rewrite `buildAnchorRegex()` to use a single optional group matching either `(...)` or `[...]`: `TAG(?:[\(\[]([^\)\]]+)[\)\]])?:\s*(.*)$`. Parse captured content as comma-separated tokens: `@owner`, `#issue`, `yyyy-MM-dd` date, or plain name (ANCHOR only). Remove separate group3/group4 captures.

### Bug 2 / 10 / 11: Metadata in parens prevents colorization

Affects `ANCHOR(name):`, `TODO(@terry):`, `REVIEW(2026-03-27):`, and any other tag with `(metadata)`.

**Why:** `anchorDecorationManager.ts:118-119` checks `line[absIdx + tag.length] !== ':'` — expects `:` immediately after tag text. For any tag with `(metadata)` between tag and colon, the character after the tag is `(`, not `:`. The regex parser in `anchorService.ts` handles this correctly, but the decoration manager's simpler `indexOf` approach doesn't.

**Fix:** After finding the tag via `indexOf`, skip past optional `(...)` or `[...]` metadata group before colon check. Include entire `TAG(metadata):` or `TAG[metadata]:` span in decoration range.

### Bug 3: LINK path completion hallucinated folders / doubled paths

**Why:** `linkCompletionProvider.ts:77-80` creates `CompletionItem` with `label = prefix + entry.name` but never sets `insertText`. VS Code replaces trigger text with the full label (which includes the already-typed prefix), causing doubling.

**Fix:** Set `item.insertText` to just `entry.name` (without prefix). Set `item.filterText` to `prefix + entry.name` for fuzzy matching.

### Bug 4: Solution-relative syntax `/solution/path/to/file.cs`

**Why:** `resolveLinkTarget()` only checks for `./` and `../`. Paths starting with `/` fall through to workspace-relative resolution which works by accident but isn't deliberate or tested.

**Fix:** Add explicit handling for `/`-prefixed paths: strip leading `/` and resolve against workspace folders (first match wins). In VS Code, `/` = workspace root (single folder) or first matching workspace folder (multi-root).

### Bug 5: Project-relative syntax `@/project/path/to/file.cs`

**Why:** Completely unimplemented. No parsing for `@/` prefix. Project discovery exists in `anchorMetadata.ts` but isn't available to the link resolver.

**Fix:** Add `@/` prefix parsing in `parseLinkTarget()`, resolve against nearest containing `.csproj` directory in `resolveLinkTarget()`. Fall back to workspace-relative if no project found.

### Bug 6: `LINK: file.cs:42` — doesn't navigate to line

**Why:** `provideDocumentLinks()` creates `uri = vscode.Uri.file(resolvedPath)` — no line info. `navigateToLinkTarget()` has working line navigation code but is never called.

**Fix (shared with 7 & 8):** Register `kat-comment-studio.navigateLink` command calling `navigateToLinkTarget()`. Wire DocumentLinks to use command URIs instead of plain file URIs.

### Bug 7: `LINK: #anchor-name` — opens new editor instead of navigating

**Why:** DocumentLink creates URI with fragment `anchor:...` — VS Code opens a new editor tab. The navigation function has correct local anchor code but is never called.

**Fix:** Same command registration as Bug 6.

### Bug 8: `LINK: file.cs#AnchorName` — opens file but doesn't navigate to anchor

**Why:** Same root cause. URI has no anchor info, navigation code is orphaned.

**Fix:** Same command registration as Bug 6.

### Bug 9: Line+anchor combined syntax — line wins, anchor ignored

**Why:** In `navigateToLinkTarget()`, `if (target.lineNumber)` runs first, `else if (target.anchorName)` only runs when no line number. When both are specified, anchor is silently ignored.

**Fix:** Flip conditional order so anchor wins when both are specified (anchor is more specific/intentional).

### Bug 10: Grid Owner column shows `@` prefix

**Why:** Parser strips `@` (`owner = token.substring(1)`) but `anchorsGridWebview.ts:763` re-adds it: `'@' + anchor.owner`.

**Fix:** Remove the `'@' +` prefix from the display call.

### Bug 11: Grid Due Date column shows raw ISO format

**Why:** `anchorsGridWebview.ts:765` displays `anchor.dueDate` as raw `yyyy-MM-dd` string.

**Fix:** Format with `new Date(dateString + 'T00:00:00').toLocaleDateString()` for display. Keep raw ISO for sort comparisons.

### Feature: LINK: Keyword Colorization

**Why:** `LINK:` keywords in comments are not colorized — they don't visually stand out. Since LINK is a functional keyword (clickable navigation), it should be distinct.

**Fix:** Add a dedicated LINK decoration in `anchorDecorationManager.ts` using `textLink.foreground` ThemeColor (adapts to light/dark themes automatically). Scan for `LINK:` in comment portions after the anchor tag loop. No metadata support — LINK does not use parens. Only colorize the `LINK:` keyword itself.

### Feature: Status Bar Rendering Toggle

**Why:** No visual indicator for whether XML comment rendering is ON or OFF.

**Fix:** Create `StatusBarItem` with alignment Right. Text: `$(comment-discussion) ON` or `$(comment-discussion) OFF`. Command: `kat-comment-studio.toggleRendering`. Update in config change handler. Tooltip explains current state and click action.

### Todos (Phase 4)

- `p4-pane-refresh-on-edit`: Debounced anchor re-scan on document change → cache update + pane refresh
- `p4-anchor-metadata-colorize`: Fix anchorDecorationManager to skip optional (...) or [...] metadata before colon check (any anchor type)
- `p4-anchor-parser-rewrite`: Rewrite buildAnchorRegex — () and [] interchangeable, comma-separated tokens parsed by type
- `p4-link-colorize`: Add LINK: keyword colorization with ThemeColor textLink.foreground
- `p4-completion-path-fix`: Fix linkCompletionProvider insertText to prevent path doubling
- `p4-solution-relative`: Add explicit `/` prefix handling in resolveLinkTarget + tests
- `p4-project-relative`: Implement `@/` prefix parsing + project-root resolution + tests
- `p4-link-navigation-cmd`: Register navigateLink command, wire DocumentLinks to use it (fixes bugs 6, 7, 8)
- `p4-line-anchor-precedence`: Flip precedence so anchor wins over line when both specified + tests
- `p4-grid-owner-no-at`: Remove `@` prefix from Owner column display in grid webview
- `p4-grid-date-locale`: Format Due Date column using locale date format in grid webview
- `p4-status-bar-toggle`: Create status bar item showing rendering ON/OFF with click-to-toggle
- `p4-link-parser-tests`: Add test coverage for `/path`, `@/path`, `file:line#anchor`, local anchor regex

### Dependencies

- `p4-link-navigation-cmd` → `p4-line-anchor-precedence`
- `p4-solution-relative` + `p4-project-relative` → `p4-link-parser-tests`
- All other todos are independent

### Relevant Files

- `src/extension.ts` — event wiring, command registration, status bar
- `src/anchors/anchorDecorationManager.ts` — inline colorization logic
- `src/navigation/linkNavigator.ts` — DocumentLink provider, navigation function
- `src/navigation/linkAnchorParser.ts` — LINK: parsing, path resolution
- `src/navigation/linkCompletionProvider.ts` — file path completion
- `src/anchors/anchorsGridWebview.ts` — grid display (owner, date columns)
- `test/unit/linkAnchorParser.test.ts` — existing parser tests
- `test/unit/anchorService.test.ts` — existing anchor tests
- `package.json` — command contributions

---

## Phase 5 — Grid File Column, Anchor Icon, Case-Insensitive Tags, Link Completion Rewrite (Complete)

### Bug 1: File Column Inconsistency When Scope is Project

**Observed:** Changed scope to Domain project while a file in that project was active. The file column for the active file showed `Domain\src\file.cs` while files that weren't open showed `src\file.cs`.

**Why:** The grid webview's `getRelativePath()` (`anchorsGridWebview.ts:812-814`) is a naive "last 3 path segments" truncation:

```javascript
function getRelativePath(filePath) {
  const parts = filePath.split(/[\\\\/]/);
  return parts.length > 3 ? parts.slice(-3).join('\\') : filePath;
}
```

This is **scope-unaware** — it always shows the last 3 segments of the absolute path regardless of the selected scope. The inconsistency between active and non-open files is caused by path depth differences: files directly under `Domain\src\` get `Domain\src\file.cs` as last-3, while files in subdirectories like `Domain\src\Subfolder\file.cs` get `src\Subfolder\file.cs` — losing the `Domain` prefix entirely. Which 3 segments you see depends entirely on the depth of each individual file, not on anything meaningful.

**Fix:** Make the file column scope-aware:
1. Pass the current scope's root path from the extension host to the webview alongside the model data (new `scopeRootPath` field on `AnchorsGridModel`)
2. Rewrite `getRelativePath()` in the webview: when a scope root path is available, compute the path relative to it (strip the scope root prefix, show remainder). When scope is `project:*` → relative to project directory; `repo:*` → relative to repo root; `folder` → relative to active workspace folder; `workspace` → use `vscode.workspace.asRelativePath()` on the host side
3. Fall back to the last-3-segments logic only when no scope root is available
4. Add `resolveScopeRootPath()` helper in `anchorViewState.ts` to map scope ID → filesystem path

**Implementation bugs found during testing:**

1. **`anchorMetadata.ts` stored `.csproj` file path instead of directory path** in the `AnchorScopeEntity.path` field for projects. `createProject()` has both `path` (csproj file) and `directoryPath` (its dirname), but `resolveFileMetadata()` passed `project.path` (the csproj file path like `C:\...\Domain\Camelot.Domain.csproj`) into the scope entity's `path`. This caused `getRelativePath()`'s `startsWith` check to fail for every file, since no file path starts with a `.csproj` filename. ALL files silently fell through to the 3-segment fallback — some just happened to look correct based on depth. Fixed by using `project.directoryPath` instead.

2. **Regex `/\//g` inside template literal produced `///g` (a JS comment)** in the browser, killing the entire webview script. Template literals consume the backslash from `\/` (not a recognized escape sequence), so `/\//g` became `///g`. The browser parsed `//` as a single-line comment, breaking all grid functionality (empty scope dropdown, dead type filter, no rows). Fixed by using `/[/]/g` which is template-literal-safe.

3. **Multi-root workspace scope showed inconsistent paths (3-segment fallback).** `resolveScopeRootPath()` correctly returns `undefined` for multi-root workspaces (no single root), but `getRelativePath()` had no second tier — everything fell to the naive last-3-segments fallback. Fixed by adding a workspace-folder tier: each `AnchorMatch` carries `workspaceFolder?: AnchorScopeEntity` with `{id, label, path}`. When `scopeRootPath` is undefined (multi-root workspace, openDocuments, document scopes), strip the containing workspace folder path and prepend `workspaceFolder.label + '\'` as prefix. This gives e.g. `Domain\src\ICamelotMarker.cs` instead of `src\ICamelotMarker.cs`.

4. **Project scope shows just filename for files directly in project root** — this is correct behavior, not a bug. The `.csproj` lives in the `src` subfolder (e.g., `Domain\src\Camelot.Domain.csproj`), so the project root IS `Domain\src\`. Files directly in that directory show as just the filename (no deeper relative path to display). This matches what `ripgrep --relative` and VS Code's own file display do for files at the root of a search scope.

### Bug 2: Anchor Icon Should Be Chain Link

**Observed:** ANCHOR type anchors use a `pin` icon. Should be chain-link like markdown renderers show on header anchors.

**Why:** `anchorService.ts:53` defines ANCHOR with `icon: 'pin'`.

**Fix:** Change `icon: 'pin'` to `icon: 'link'` in the BUILTIN_ANCHOR_TYPES map. The VS Code codicon `link` (🔗) matches the chain-link visual.

### Bug 3: Anchor Token Search Should Be Case-Insensitive

**Observed:** Anchor tags only match ALL CAPS (`TODO` matches but `todo` or `Todo` do not). Want case-insensitive matching. Also want optional space between tag and metadata container `()` or `[]`, with colon immediately after tag or after closing metadata container.

**Why — Regex** (`anchorService.ts:75-79`):
```typescript
return new RegExp(
  `\\b${prefixPattern}(${tagPattern})` +
  `(?:\\s?[\\(\\[]([^\\)\\]]+)[\\)\\]])?` +
  `:\\s*(.*)$`,
);
```
No `i` flag — case-sensitive. The optional space before `(` or `[` IS already handled by `\s?`. The colon-immediately-after behavior is already correct.

**Why — Decoration highlighting** (`anchorDecorationManager.ts:106`):
```typescript
const tagIdx = commentPortion.indexOf(tag);
```
Case-sensitive `indexOf()` with ALL-CAPS tag strings. Also, the metadata container detection at line 129 checks the character immediately after the tag without allowing an optional space — inconsistent with the regex which allows `\s?`.

**Fix:**
1. Add `i` flag to regex in `buildAnchorRegex()` for case-insensitive matching
2. Replace `commentPortion.indexOf(tag)` with case-insensitive search (e.g., `commentPortion.toUpperCase().indexOf(tag)` or `commentPortion.search(new RegExp(escapeRegex(tag), 'i'))`)
3. After finding tag end position, skip optional whitespace before checking for `(` or `[` metadata container — align decoration detection with regex behavior
4. Tag normalization already handled: `match[1].toUpperCase()` in `findAnchorsInLine()` normalizes captured tags
5. **ANCHOR requires name metadata:** `ANCHOR:` without a `(name)` or `[name]` metadata group is invalid — it has no purpose without a named target. In `findAnchorsInLine()`, if `tag === 'ANCHOR'` and no `anchorName` was parsed, return `undefined` to skip it entirely. In the decoration manager, skip colorization for ANCHOR tags that lack a metadata group

### Bug 4: LINK: Autocomplete Path Resolution Is Broken

**Observed:** Multiple path completion failures:
1. `@/` — first suggestion correct (relative to csproj), but accepting a folder (e.g., `@/[Core]/`) doesn't advance context — re-suggests from project root
2. `c:/` — first level correct, but accepting a folder (e.g., `c:/btr/`) doesn't advance — re-suggests from `c:/`
3. `../` — doesn't work at all, shows folders as if `@/` was typed (project root)
4. `./` — first level correct, but accepting doesn't advance context

**Why — No prefix translation in completion provider:** The `LinkCompletionProvider` (`linkCompletionProvider.ts:54-89`) uses:
```typescript
const baseDir = path.dirname(document.uri.fsPath);
const resolvedDir = partialPath.includes('/')
  ? path.resolve(baseDir, path.dirname(partialPath))
  : baseDir;
```
It doesn't recognize `@/`, `./`, `../`, or `/` prefixes. It treats the raw string literally. Meanwhile `resolveLinkTarget()` in `linkAnchorParser.ts:151-212` has full prefix handling — this logic is never used during completion.

**Why — Context doesn't advance:** After accepting e.g., `[Core]/`, the `partialPath` becomes `@/[Core]/`. `path.dirname('@/[Core]/')` returns `@/[Core]` as a literal string, and `path.resolve(baseDir, '@/[Core]')` fails because `@/` is not a valid filesystem prefix. The provider can't parse it back correctly on re-invocation.

**Why — `../` resolves wrong:** With no prefix awareness, `../` falls through to `path.resolve(baseDir, '..')` which may give the wrong directory since the completion previously displayed project-root-relative suggestions.

**Fix — Full rewrite of path completion:**
1. **Extract shared path resolution** from `resolveLinkTarget()` into a reusable `resolvePathBase(partialPath, documentFilePath)` in `linkAnchorParser.ts`:
   - `@/...` → resolve from nearest `.csproj` directory (uses existing `findNearestProjectRoot()`)
   - `/...` → resolve from workspace folders
   - `./...` → resolve from document directory
   - `../...` → resolve from document parent
   - `X:/...` → absolute Windows path
   - bare path → resolve from document directory
2. **Parse the partial path correctly:** strip recognized prefix, split remaining on `/` to get traversed segments, resolve full directory from prefix + all segments
3. **Fix insertText / context advancement:** `insertText` = entry name + `/` for directories; set `item.command` to `editor.action.triggerSuggest` for re-trigger after accepting a directory; use `item.range` to control replacement scope
4. **Handle absolute Windows paths:** detect `X:/` or `X:\` prefix, resolve directly from drive root

### Todos (Phase 5)

- `p5-grid-file-scope-aware`: Make grid file column scope-aware — pass scope root path in model, rewrite getRelativePath() to compute relative-to-scope paths
- `p5-anchor-icon-link`: Change ANCHOR icon from `pin` to `link` codicon
- `p5-anchor-case-insensitive`: Add `i` flag to anchor regex, fix case-sensitive indexOf in decoration manager, allow optional space before metadata container
- `p5-link-completion-rewrite`: Rewrite LinkCompletionProvider — extract shared resolvePathBase(), handle all prefixes, fix context advancement, re-trigger on directory accept

### Dependencies

- All four todos are independent and can be worked in parallel

### Relevant Files

- `src/anchors/anchorService.ts` — BUILTIN_ANCHOR_TYPES map, buildAnchorRegex()
- `src/anchors/anchorDecorationManager.ts` — inline tag colorization, metadata detection
- `src/anchors/anchorsGridWebview.ts` — grid getRelativePath() display function
- `src/anchors/anchorsGridProvider.ts` — AnchorsGridModel, data pushed to webview
- `src/anchors/anchorViewState.ts` — scope filtering, scope helpers
- `src/navigation/linkCompletionProvider.ts` — LINK: path completion provider
- `src/navigation/linkAnchorParser.ts` — resolveLinkTarget(), findNearestProjectRoot()
- `test/unit/anchorService.test.ts` — anchor regex tests
- `test/unit/linkAnchorParser.test.ts` — link parser tests