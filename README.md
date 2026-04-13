# KAT Comment Studio

![KAT Comment Studio](./media/xml.comments.after.rendered.png)

Transform raw XML doc comments and JSDoc blocks into clean inline summaries with workspace-wide code anchors, smart comment reflow, clickable issue links, and cross-file `LINK:` navigation — all inside VS Code.

[⬇ Download v1.0.6 (.vsix)](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.8.vsix)

> **Note:** KAT Comment Studio is not on the VS Code Marketplace. Install via VSIX using the link above.

---

## Getting Started

1. [Download the extension](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.8.vsix).
2. Press `Ctrl+Shift+P`, type `VSIX`, and select **Extensions: Install from VSIX...**

![Install from VSIX](media/install.png)

3. Browse to the downloaded `kat-comment-studio-1.0.8.vsix` and select it.

Install [previous versions](#previous-versions) if needed.

---

## Features

| Feature | |
|---|---|
| **[XML Comment Rendering](#xml-doc-comment-rendering)** — Fold XML doc blocks into a clean one-line CodeLens. Click to open a formatted documentation popup. | ![](./media/xml.comments.after.rendered.feature.png) |
| **[Comment Reflow](#comment-reflow)** — Automatically wrap, clean up, and normalize XML doc comment blocks on exit, paste, or on demand. | ![](./media/xml.comments.after.reflow.feature.png) |
| **[Documentation Popup](#documentation-popup)** — Full formatted popup with sections, parameters, code examples, and links. | ![](./media/xml.comments.after.popup.feature.png) |
| **[Code Anchors](#code-anchors)** — TODO, HACK, BUG, and custom tags tracked across your entire workspace in a tree view and grid panel. | ![](./media/code-anchors-sidebar.feature.png) |
| **[LINK: Navigation](#link-navigation)** — Cross-file references with hover preview, completions, and `Ctrl+Click` to navigate. | ![](./media/code-anchors-links.feature.png) |
| **[Prefix Highlighting](#prefix-highlighting)** — Better Comments-style coloring for `!`, `?`, `*`, `//`, `-`, and `>` prefixed lines. | ![](./media/code-anchors-highlighting.feature.png) |

Also: [JSDoc/TSDoc Rendering](#jsdoctsdoc-comment-rendering) · [Issue Links](#issue-links) · [Comment Remover](#comment-remover) · [Color Customization](#color-customization)

---

## Supported Languages

| Language | Comment Style | CodeLens | Reflow | Code Anchors & Issue Links |
|---|---|---|---|---|
| C# | XML doc (`///`) | ✓ | ✓ | ✓ |
| VB | XML doc (` ''' `) | ✓ | ✓ | ✓ |
| F# | XML doc (`///`) | ✓ | ✓ | ✓ |
| C/C++ | XML doc (`///`) | ✓ | ✓ | ✓ |
| TypeScript | JSDoc (`/** */`) | ✓ | — | ✓ |
| JavaScript | JSDoc (`/** */`) | ✓ | — | ✓ |
| TypeScript React (TSX) | JSDoc (`/** */`) | ✓ | — | ✓ |
| JavaScript React (JSX) | JSDoc (`/** */`) | ✓ | — | ✓ |
| Razor | XML doc (`///`) | ✓ | ✓ | ✓ |
| SQL | — | — | — | ✓ |
| PowerShell | — | — | — | ✓ |

> **Note:** SQL and PowerShell are scanned for Code Anchors and Issue Links but do not receive CodeLens or documentation popups. JSDoc languages do not support reflow — reflow would corrupt `@tag` lines.

---

## XML Doc Comment Rendering

When rendering is **On**, XML documentation comment blocks are transformed from raw XML into a clean, readable CodeLens experience with automatic reflow, expansion, and folding.

Here is why this matters. The raw XML comment below is hard to read — it takes up most of the screen, has inconsistent blank lines, an odd element break, an extremely long line, and an unrendered code block.

![Raw XML comment block before rendering](./media/xml.comments.before.png)

After the extension processes it, the entire block collapses to a single CodeLens summary line:

![XML comment block after rendering](./media/xml.comments.after.rendered.png)

### Rendering Behavior

With rendering **On**:

1. The XML comment block collapses. With `kat-comment-studio.xmlCommentOpacity: 0` it is fully transparent — only the fold chevron, `...` decoration, and single line height remain so you can enter and edit it.
2. The block auto-unfolds when your cursor enters it and auto-re-folds ~500ms after you leave.
3. A **CodeLens** renders the `<summary>` text above the member. If the summary is long it truncates at `kat-comment-studio.codeLensSummaryTruncation` (default: 205 characters; set to 0 for no truncation). If more than one `<para>` element is present, only the first is shown.
4. Clicking the CodeLens opens the [Documentation Popup](#documentation-popup).

### Documentation Popup

Click the **summary text** in a CodeLens (or press **F1** when the cursor is in or just below the comment) to open a formatted hover popup:

- **Summary** — styled text
- **Parameters** — name and description
- **Returns** — inline with description
- **Remarks** — label on its own line, content indented below
- **Value** — property value description
- **Example** — rendered as a fenced code block
- **Exceptions** — list of exception types and descriptions
- **See Also** — clickable links
- **Anchor tags** — TODO:, NOTE:, HACK:, etc. colorized using their configured colors

![Documentation Popup](./media/xml.comments.after.popup.png)

Inline formatting is fully rendered: `code`, **bold**, *italic*, ~~strikethrough~~, and hyperlinks.

The `kat-comment-studio.codeLensSummaryTruncation` setting controls how much is shown in the CodeLens — the popup always shows the full content regardless.

#### XML Tag Support

`<summary>`, `<param>`, `<typeparam>`, `<returns>`, `<value>`, `<remarks>`, `<example>`, `<exception>`, `<see>`, `<seealso>`, `<inheritdoc>`, `<paramref>`, `<typeparamref>`, `<c>`, `<code>`, `<list>`

### Toggle Rendering

| Trigger | Action |
|---|---|
| Command Palette → `KAT Comment Studio: Toggle Comment Rendering` | Toggle rendering |
| Right-click → **KAT Comment Studio** submenu | Quick access |
| Status Bar → ![OFF](./media/codicon-comment-draft.png) `OFF` / ![ON](./media/codicon-comment.png) `ON` icons | Toggle rendering |

### Collapse by Default

Enable `kat-comment-studio.collapseXmlWhenRenderingOff` to automatically fold all XML doc comment blocks when a file opens. Only applies when rendering is **Off** — when **On**, comments are always auto-folded as part of the rendering experience.

---

## JSDoc/TSDoc Comment Rendering

TypeScript, JavaScript, TSX, and JSX files use `/** */` block comments. KAT Comment Studio parses these as JSDoc/TSDoc/Doxygen and renders them with the same CodeLens + hover popup experience as XML doc comments.

The CodeLens summary is extracted from the free-text description before any `@tags`. Clicking it opens the documentation popup.

### JSDoc Tag Support

| Tag(s) | Popup Section |
|---|---|
| *(free text before any tag)*, `@description`, `@summary` | **Summary** |
| `@param`, `@arg`, `@argument` | **Parameters** — with type (if `{type}` provided) and description |
| `@returns`, `@return` | **Returns** — with type and description |
| `@throws`, `@throw`, `@exception` | **Exceptions** — exception type as heading |
| `@example` | **Example** — rendered as a fenced code block |
| `@remarks`, `@note` | **Remarks** |
| `@see`, `@seealso` | **See Also** |
| `@deprecated` | **Deprecated** (Other section) |
| `@typeparam`, `@template` | **Type Parameters** |
| `@type` | Type annotation prepended to Summary |
| `@brief` | **Summary** (Doxygen — used only if no free-text description is present) |
| *(any other tag)* | **Other** section with `@tagname` as heading |

Parameter forms supported: `{type} name`, `{type} [optionalName]`, `{type} [name=default]`, `{type} ...rest`, `options.sub` (dotted names). The `{type}` brace expression handles nested generics such as `Object.<string, Array<T>>`.

Both `@tag` and `\tag` prefixes are recognized (JSDoc and Doxygen style).

---

## Comment Reflow

KAT Comment Studio automatically wraps and reformats XML doc comment blocks to stay within a configurable line width.

Here is the same block from above after reflow — before rendering is applied:

1. XML elements are never split. The entire `<paramref>` element is moved to the next line as a unit.
2. All lines are adjusted to fit within `kat-comment-studio.reflowLineLength`.
3. Unnecessary blank lines between XML elements are removed.
4. `<summary>` is always forced onto its own line.

![XML comment block after reflow](./media/xml.comments.after.reflow.png)

### Commands and Code Actions

| Method | How |
|---|---|
| Command Palette | `KAT Comment Studio: Reflow Current Comment` |
| Command Palette | `KAT Comment Studio: Reflow Comments in File` |
| Right-click | **KAT Comment Studio** submenu |
| Light Bulb (`Ctrl+.`) | When cursor is inside a comment block |

The extension does not register a document or range formatting provider, avoiding conflicts with language-specific formatters (C# Dev Kit, OmniSharp).

### Smart Paste

Pasting text into an XML doc comment block automatically reflows the entire block.

Controlled by `kat-comment-studio.enableReflowOnPaste` (default: `true`).

### Auto-Reflow on Edit Exit

When you leave a doc comment block after editing, the block is automatically reflowed.

Controlled by `kat-comment-studio.enableReflowOnCommentExit` (default: `true`).

### Line Width

Width is resolved in this order:

1. `.editorconfig` `max_line_length` for the file's directory (if present)
2. `kat-comment-studio.reflowLineLength` setting (default: `120`)

### XML-Aware Wrapping

- Block tags (`<summary>`, `<remarks>`, `<param>`, etc.) each wrap their content independently
- `<code>` blocks are preserved as preformatted — never reflowed

---

## Prefix Highlighting

Comments beginning with specific prefix characters are highlighted with distinct colors and styles, inspired by the [Better Comments](https://marketplace.visualstudio.com/items?itemName=aaron-bond.better-comments) extension.

![Anchor and prefix highlighting](./media/code-anchors-highlighting.png)

| Prefix | Default (dark / light) | Purpose |
|---|---|---|
| `// !` | `#FF2D00` / `#CC0000` | Alerts and warnings |
| `// ?` | `#3498DB` / `#2070B0` | Questions |
| `// *` | `#98C379` / `#008000` | Highlighted notes |
| `// //` | `#808080` / `#999999` | Deprecated (strikethrough) |
| `// -` | `#505050` / `#AAAAAA` | Disabled items |
| `// >` | `#C586C0` / `#800080` | Quotes (italic) |

These patterns also work with `#` (PowerShell/Python), `'` (VB), and other single-line comment markers.

Colors are fully customizable via `kat-comment-studio.colorOverrides`. See [Color Customization](#color-customization).

Disable entirely with `kat-comment-studio.enablePrefixHighlighting: false`.

---

## Code Anchors

Code anchors are specially tagged comments that mark items of interest across your workspace. KAT Comment Studio scans your entire workspace, displays anchors in a tree view and grid panel, and lets you navigate between them.

![Code Anchors — inline highlighting and overview ruler](./media/code-anchors-highlighting.png)

### Built-in Anchor Types

| Tag | Color (Dark) | Icon | Purpose |
|---|---|---|---|
| `TODO` | `#FF8C00` | ![checklist](./media/codicon-checklist.png) | Work to be done |
| `HACK` | `#DC143C` | ![alert](./media/codicon-alert.png) | Workaround that needs cleanup |
| `NOTE` | `#4169E1` | ![note](./media/codicon-note.png) | Important information |
| `BUG` | `#FF0000` | ![bug](./media/codicon-bug.png) | Known bug |
| `FIXME` | `#FF4500` | ![wrench](./media/codicon-wrench.png) | Must be fixed |
| `UNDONE` | `#808080` | ![circle-slash](./media/codicon-circle-slash.png) | Reverted or incomplete |
| `REVIEW` | `#9370DB` | ![eye](./media/codicon-eye.png) | Needs review |
| `ANCHOR` | `#20B2AA` | ![link](./media/codicon-link.png) | Named navigation target |

### Basic Syntax

Tags are **case-insensitive** — `todo`, `Todo`, and `TODO` are all recognized and normalized to uppercase in all views. Colorization behavior is controlled by `kat-comment-studio.anchorColorizeMode` (default: `caseInsensitive`).

```
// TODO: Add input validation
// todo: also works — normalized to TODO
// HACK: Temporary workaround until v2
// BUG: Off-by-one in edge case
// FIXME: This crashes on null input
// NOTE: This method is called from multiple threads
// ANCHOR(MyAnchor): navigation target
```

### Rich Metadata

Metadata can be embedded directly after the tag in parentheses:

```
// TODO(@alice): Implement the export feature
// FIXME [#1234]: Known issue tracked in GitHub
// TODO(@bob, #456): Refactor this — assigned to bob, tracked in issue 456
// TODO(2026-06-01): Remove this workaround after migration
// TODO(@alice, #789, 2026-03-15): Assigned, tracked, and due-dated
```

| Metadata | Syntax | Description |
|---|---|---|
| Owner | `(@name)` | Person responsible |
| Issue reference | `[#123]` | Linked issue number |
| Due date | `(yyyy-MM-dd)` | ISO date shown in tree and grid |
| Anchor name | `ANCHOR(name)` | Named target for `LINK:` navigation |

> **Note:** `ANCHOR:` without a name (e.g., `// ANCHOR:`) is silently ignored — a name is required.

### Custom Tags

Add your own tags via `kat-comment-studio.patternProcessing` (`customTags` key). Custom tags are highlighted in **Goldenrod** and appear in all views alongside built-in types.

```json
"kat-comment-studio.patternProcessing": {
  "customTags": "PERF, SECURITY, DEBT, REFACTOR"
}
```

### Tag Prefixes

Allow prefix characters before tags so `// @TODO:` is treated the same as `// TODO:`. Configure via `kat-comment-studio.patternProcessing` (`tagPrefixes` key, default: `"@, $"`).

### Inline Decorations

Each anchor tag is highlighted inline in the editor with its type color. Colored markers also appear in the **scrollbar/overview ruler** so you can see anchor density at a glance.

Set `kat-comment-studio.anchorColorizeMode` to `never` to disable all inline colorization.

### Sidebar Tree View

The **KAT Comment Studio** activity bar panel shows a tree of all anchors grouped by file.

![Code Anchor Sidebar](media/code-anchors-sidebar.png)

**Toolbar actions:**

| Button | Action |
|---|---|
| ![Scan](./media/codicon-refresh.png) Scan | Scan the entire workspace for anchors |
| ![Export](./media/codicon-export.png) Export | Export visible anchors to a file |
| ![Set Scope](./media/codicon-surround-with.png) Set Scope | Filter by scope |
| ![Filter Types](./media/codicon-list-filter.png) Filter Types | Toggle which anchor types are shown |

**Scope options** (Command Palette → `KAT Comment Studio: Set Anchor Scope` or the grid dropdown):

- **Workspace** — all files in the workspace
- **Current Folder** — the active file's workspace folder. In a single-folder window this is the root folder; in a multi-root workspace it is disabled until an active workspace document exists.
- **Current Document** — only the active file
- **Open Documents** — all currently open files
- **Repo: _name_** — only files inside a discovered Git repository
- **Project: _name_** — only files inside a discovered `.csproj`

**Type filter** (Command Palette → `KAT Comment Studio: Filter Anchor Types`): Multi-select picker to show/hide specific anchor types. The tree view and bottom grid share the same scope, search text, and type filter state.

### Bottom Panel Grid

A sortable, filterable grid panel (**KAT Comment Studio - Code Anchors**) is available in the bottom panel alongside Problems and Output.

![Code Anchor Pane](media/code-anchors-pane.png)

**Columns:** Type · Description · File · Line · Owner · Issue · Due Date

- Click a column header to sort ascending/descending
- Free-text search filters across description, file, owner, repo, and project metadata
- Scope dropdown stays synchronized with the tree view
- Type filter dropdown uses explicit include/exclude checkboxes and persists across refresh/rescan
- Drag column edges to resize; widths persist across view reloads and restarts
- Click any row to navigate to the anchor in the editor
- Right-click a row to copy a deterministic row summary; right-click a cell to copy the cell value
- Overdue dates are highlighted

Access via: Command Palette → `Focus on KAT Comment Studio - Code Anchors View`

### Anchor Count Status Bar

An anchor count badge is always visible in the VS Code status bar:

- Shows **`N Anchors`** (total visible anchors after scope and type filters)
- **Highlighted** in warning yellow until you open the Code Anchors pane for the first time
- **Click** to focus the Code Anchors grid panel

The badge updates live as you scan, filter, or search.

### Anchor Navigation

Jump between anchors in the current file using keyboard shortcuts. No shortcuts are registered by default — see [Keyboard Shortcuts](#keyboard-shortcuts) for suggested bindings (`Alt+PageDown` / `Alt+PageUp`).

### Export

Export all visible anchors to a file.

| Format | Description |
|---|---|
| **CSV** | Comma-separated |
| **Markdown** | GitHub-flavored Markdown table |
| **JSON** | Structured JSON array |

Command: `KAT Comment Studio: Export Code Anchors`

### Auto-Scan on Load

When `kat-comment-studio.scanOnLoad` is `true` (default), the workspace is scanned automatically on activation. Results are cached and updated incrementally on file save.

### EditorConfig Integration

Place in `.editorconfig` to configure anchors per project or folder:

```ini
[*.cs]
custom_anchor_tags = PERF, SECURITY
custom_anchor_tag_prefixes = @, $
```

---

## Issue Links

When working in a git repository, `#123` patterns in comments become clickable links that open the corresponding issue in your browser.

```csharp
// TODO: Fix this — see #1234
// Related to the bug reported in #567
```

**Supported hosting providers:**

- **GitHub** (github.com and GitHub Enterprise)
- **GitLab** (gitlab.com and self-hosted, including nested groups)
- **Bitbucket** (bitbucket.org)
- **Azure DevOps** (dev.azure.com and on-premises TFS)

Remote URLs are detected automatically from your git configuration, supporting both SSH and HTTPS formats.

Disable with `kat-comment-studio.enableIssueLinks: false`.

---

## LINK Navigation

The `LINK:` syntax creates navigable cross-references directly in comments. Hover for a preview or `Ctrl+Click` to jump.

![Link Navigation](./media/code-anchors-links.png)

### Path Prefixes

| Prefix | Resolves from | Example |
|---|---|---|
| `@/` | Nearest `.csproj` directory | `@/Services/UserService.cs` |
| `/` | First workspace folder root | `/Core/Domain/src/Models/User.cs` |
| `./` | Current file's directory | `./Helpers/StringHelper.cs` |
| `../` | Current file's parent directory | `../Common/BaseEntity.cs` |
| `X:/` or `X:\` | Absolute Windows path | `C:/BTR/Camelot/Core/Domain/src/User.cs` |
| _(bare)_ | Current file's directory | `Models/User.cs` |

### Supported Forms

```
// LINK: MyFile.cs                              -> bare, relative to current file's dir
// LINK: ./relative/path/to/file.cs             -> explicit relative
// LINK: ../sibling/folder/file.ts              -> parent-relative
// LINK: @/Services/UserService.cs              -> project-relative (nearest .csproj dir)
// LINK: /Core/Domain/src/Models/User.cs        -> workspace-root-relative (first folder)
// LINK: C:/BTR/Camelot/Core/Domain/src/User.cs -> absolute path
// LINK: MyFile.cs:42                           -> jump to line 42
// LINK: MyFile.cs:10-20                        -> highlight lines 10-20
// LINK: MyFile.cs#AnchorName                   -> jump to named ANCHOR in target file
// LINK: #LocalAnchorInThisFile                 -> jump to ANCHOR in current file
// LINK: path with spaces/file.cs:5             -> spaces in path are supported
```

**Hover** over any `LINK:` reference to see the resolved path and whether the target exists. Typing `LINK: ` automatically triggers path completions. Selecting a **directory** in the completion list re-triggers suggestions so you can drill deeper without retyping. Named `ANCHOR` tags found across the workspace are also offered as completions for `LINK: #` references.

**Ctrl+Click** (or `F12` / Go to Definition) to navigate directly to the target.

Broken `LINK:` references are flagged with **warning squiggles** in the editor. Diagnostics clear automatically when the link is corrected.

### Workspace Configuration Scenarios

Path resolution behavior varies depending on how VS Code opened the project:

- `/` — always resolves from the **first workspace folder root** (`workspaceFolders[0]`)
- `@/` — resolves from the **nearest `.csproj` directory** above the file containing the link. Falls back to `workspaceFolders[0]` only if no `.csproj` is found.

#### Multi-root workspace (`.code-workspace` file)

`@/` resolves per-file — each source file uses its own nearest `.csproj`. `/` always uses the first folder listed in the `.code-workspace`.

```jsonc
// MyApp.code-workspace
{
  "folders": [
    { "path": "C:/BTR/Camelot/Core" },
    { "path": "C:/BTR/Camelot/UI" }
  ]
}
```

```
// File: C:/BTR/Camelot/Core/src/Domain/User.cs
//       (inside C:/BTR/Camelot/Core/src/Core.csproj)

// LINK: @/Services/UserService.cs  -> C:/BTR/Camelot/Core/src/Services/UserService.cs
//                                     (resolved from Core.csproj directory)
// LINK: /Services/UserService.cs   -> C:/BTR/Camelot/Core/Services/UserService.cs
//                                     (resolved from workspaceFolders[0] = Core folder)
```

#### Opening a folder containing a `.sln`

VS Code opens the folder as the workspace root. There is no `.sln` parsing — as long as source files are inside a `.csproj`, `@/` works correctly.

```
// VS Code opened: C:/BTR/Camelot/MyApp/   (folder containing MyApp.sln)
// File: C:/BTR/Camelot/MyApp/src/Core/Core.csproj exists

// LINK: @/Services/UserService.cs  -> C:/BTR/Camelot/MyApp/src/Core/Services/UserService.cs
//                                     (from nearest .csproj ancestor of current file)
// LINK: /Core/Domain/User.cs       -> C:/BTR/Camelot/MyApp/Core/Domain/User.cs
//                                     (from workspace root = folder containing .sln)
```

#### Opening a subfolder without a `.csproj` ancestor

```
// VS Code opened: C:/BTR/Camelot/Core/Domain/  (no .csproj in hierarchy)

// LINK: @/Models/User.cs    -> no .csproj found; falls back to workspace root
//                             = C:/BTR/Camelot/Core/Domain/Models/User.cs
// LINK: /Models/User.cs     -> same (workspaceFolders[0])
```

`@/` is most useful when source files live inside a C# project. Without a `.csproj` ancestor, it behaves identically to `/`.

---

## Comment Remover

Two XML doc comment removal commands are available from the right-click **KAT Comment Studio** context menu and the Command Palette.

| Command | Description |
|---|---|
| `Remove Current XML Comment` | Removes the XML doc comment block at the cursor position. Only enabled when the cursor is inside an XML doc comment. |
| `Remove All XML Comments in File` | Removes every XML doc comment block in the active file. |

---

## Color Customization

All colors have **theme-aware defaults** for dark, light, and high-contrast themes. Override any color via `kat-comment-studio.colorOverrides` — a key/value map (like VS Code's `files.associations`).

```json
"kat-comment-studio.colorOverrides": {
  "todo": "#FFA500",
  "prefixAlert": "#FF0000"
}
```

Omit any key to use its theme default.

### Anchor Type Colors

| Theme Color ID | Key | Default (Dark) |
|---|---|---|
| `katCommentStudio.anchorTodo` | `todo` | `#FF8C00` |
| `katCommentStudio.anchorHack` | `hack` | `#DC143C` |
| `katCommentStudio.anchorNote` | `note` | `#4169E1` |
| `katCommentStudio.anchorBug` | `bug` | `#FF0000` |
| `katCommentStudio.anchorFixme` | `fixme` | `#FF4500` |
| `katCommentStudio.anchorUndone` | `undone` | `#808080` |
| `katCommentStudio.anchorReview` | `review` | `#9370DB` |
| `katCommentStudio.anchorAnchor` | `anchor` | `#20B2AA` |
| `katCommentStudio.anchorCustom` | `custom` | `#DAA520` |

### Rendered Comment Colors

| Theme Color ID | Key | Purpose |
|---|---|---|
| `katCommentStudio.renderedText` | `renderedText` | General comment text |
| `katCommentStudio.renderedHeading` | `renderedHeading` | Section headings |
| `katCommentStudio.renderedCode` | `renderedCode` | Inline code |
| `katCommentStudio.renderedLink` | `renderedLink` | Links |

### Prefix Highlight Colors

| Theme Color ID | Key | Prefix |
|---|---|---|
| `katCommentStudio.prefixAlert` | `prefixAlert` | `// !` |
| `katCommentStudio.prefixQuestion` | `prefixQuestion` | `// ?` |
| `katCommentStudio.prefixHighlight` | `prefixHighlight` | `// *` |
| `katCommentStudio.prefixStrikethrough` | `prefixStrikethrough` | `// //` |
| `katCommentStudio.prefixDisabled` | `prefixDisabled` | `// -` |
| `katCommentStudio.prefixQuote` | `prefixQuote` | `// >` |

<details>
<summary>Customizing hover popup code block backgrounds (advanced)</summary>

The hover popup renders fenced code blocks using VS Code's Monaco tokenizer (`monaco-tokenized-source`). This is an internal rendering path — it is **not** controlled by `textCodeBlock.background` or `textPreformat.background`. The background defaults to the hover widget background color (`editorHoverWidget.background`).

#### Inline code ticks

Controlled by `textCodeBlock.background`. To match your editor background:

1. Open the Command Palette → `Developer: Generate Color Theme From Current Settings`. Search for `editor.background` and copy that hex value.
   > This value is **theme-specific** and static. Update it manually if you switch themes.

2. Override the token in `settings.json`:
   ```json
   "workbench.colorCustomizations": {
       "textCodeBlock.background": "#222222"
   }
   ```

#### Fenced code blocks

These use the Monaco tokenizer internally and are **not** affected by any workbench color token. The only way to style them is via custom CSS using the [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) extension.

**Step 1** — Install **Custom CSS and JS Loader** from the VS Code marketplace.

**Step 2** — Find your editor background: Command Palette → `Developer: Generate Color Theme From Current Settings`, search for `editor.background`.

**Step 3** — Choose scoped (recommended) or simple:

---

##### Option A — Scoped to KAT Comment Studio only (recommended)

Create a **CSS file** — e.g. `C:\Users\YourName\vscode-custom.css`:

```css
/* KAT Comment Studio — scoped fenced code block background */
.monaco-tokenized-source.kat-comment-hover {
/* set to your editor.background */
background-color: #222222 !important;
border: #ffffff 1px solid !important;
padding: 5px !important;
box-sizing: border-box !important;
}
```

Create a **JS file** — e.g. `C:\Users\YourName\vscode-custom.js`:

```javascript
// KAT Comment Studio — tag hover popup for scoped CSS.
// VS Code reuses the same .monaco-hover widget for all hovers (IntelliSense,
// extensions, etc.) — only the content changes. KAT hovers are identified by
// the presence of a $(book) codicon heading, which IntelliSense hovers won't produce.
const katObserver = new MutationObserver((mutations) => {
	const relevant = mutations.some(m =>
		m.target.closest?.('.monaco-hover') ||
		Array.from(m.addedNodes).some(n =>
			n.nodeType === 1 &&
			(n.classList?.contains('.monaco-hover') || n.querySelector?.('.monaco-hover'))
		)
	);

	if (!relevant) return;

	document.querySelectorAll('.monaco-hover .monaco-tokenized-source').forEach(h => {
		// A trailing 5-space marker in the last line flags this as a KAT Comment Studio popup
		const isKat = h.querySelector('span:last-child')?.textContent?.slice(-5) === "     ";
		if (isKat) {
			const monacoHover = h.closest('.monaco-hover');
			if (monacoHover) {
				const updateStyle = (styleName, propertyName, current) => {
					if (current) {
						const val = parseFloat(current);
						const newVal = val + 12;
						monacoHover.style[propertyName] = newVal + 'px';
						monacoHover.querySelectorAll('[style*="' + styleName + ': ' + current + '"]').forEach(el => {
							el.style[propertyName] = newVal + 'px';
						});
					}
				};
				updateStyle('height', 'height', monacoHover.style.height);
				updateStyle('max-height', 'maxHeight', monacoHover.style.maxHeight);
				updateStyle('width', 'width', monacoHover.style.width);
				updateStyle('max-width', 'maxWidth', monacoHover.style.maxWidth);
			}

			h.classList.add('kat-comment-hover');
		} else {
			h.classList.remove('kat-comment-hover');
		}
	});
});

katObserver.observe(document.body, { childList: true, subtree: true });
```

Configure both files in `settings.json`:

```json
"vscode_custom_css.imports": [
    "file:///C:/Users/YourName/vscode-custom.css",
    "file:///C:/Users/YourName/vscode-custom.js"
]
```

On macOS/Linux use `file:///home/yourname/...` paths.

---

##### Option B — Simple (styles all Monaco hovers)

No JS needed — affects all VS Code hover tooltips:

```css
/* All Monaco hovers — fenced code block background */
.monaco-hover .monaco-tokenized-source {
    background-color: #222222 !important;
}
```

---

**Step 4** — Open Command Palette → `Enable Custom CSS and JS` → click **Restart** when prompted.

**Step 5** — Dismiss the yellow "corrupted installation" warning bar VS Code shows. This is expected and harmless.

**Caveats:**

- Re-run `Enable Custom CSS and JS` after every VS Code update
- Update the hex color in your CSS file if you switch themes
- If you already use another custom CSS extension, add these rules to your existing files

---

#### Complete line hiding (optional)

Setting `xmlCommentOpacity` to `0` makes the original XML comment lines fully invisible:

```json
"kat-comment-studio.xmlCommentOpacity": 0
```

One blank line gap still remains after folding — this is the maximum achievable through the VS Code extension API alone.

</details>

---

## Pattern Processing

Controls which files, folders, languages, and tags are processed. Only override the keys you want to change; all others fall back to their defaults.

```json
"kat-comment-studio.patternProcessing": {
  "customTags": "PERF, SECURITY",
  "fileExtensions": "cs, ts, vb"
}
```

| Key | Default | Description |
|---|---|---|
| `customTags` | *(empty)* | Custom anchor tags highlighted in Goldenrod and shown in Code Anchors tree |
| `enabledLanguages` | `csharp, vb, fsharp, cpp, c, typescript, javascript, typescriptreact, javascriptreact, razor, sql, powershell` | VS Code language IDs for which rendering and anchors are active |
| `fileExtensions` | `cs, vb, fs, cpp, c, h, ts, tsx, js, jsx, razor, cshtml, sql, ps1, psm1` | File extensions included in anchor scan and LINK: validation |
| `ignoreFolders` | `node_modules, bin, obj, .git, dist, out, build, .vs, .vscode-test` | Folder names excluded from anchor scan |
| `tagPrefixes` | `@, $` | Prefix characters recognised before anchor tags — `@TODO` is treated as `TODO` |

---

## Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `xmlCommentRendering` | `boolean` | `true` | Enable XML Comment Rendering (CodeLens summary, auto-fold, and apply Comment Opacity). |
| `xmlCommentOpacity` | `integer` | `40` | Opacity percentage (0-100) for dimmed original comments. 0 = fully invisible; 100 = no dimming. |
| `codeLensSummaryTruncation` | `number` | `205` | Maximum characters for the CodeLens summary text. Set to 0 for no truncation. |
| `reflowLineLength` | `number` | `120` | Maximum line width for comment reflow. Can be overridden by `.editorconfig max_line_length`. |
| `enableReflowOnCommentExit` | `boolean` | `true` | Automatically reflow a comment block when the cursor leaves it after editing. |
| `enableReflowOnPaste` | `boolean` | `true` | Automatically reflow comment blocks when pasting text into them. |
| `interceptF1ForComments` | `boolean` | `true` | Press F1 inside or below an XML doc comment to show the KAT tooltip instead of the VS Code help menu. |
| `collapseXmlWhenRenderingOff` | `boolean` | `false` | Automatically collapse XML comments when opening files and rendering is Off. |
| `anchorColorizeMode` | `string` | `"caseInsensitive"` | `never` = off; `fullAnchor` = only `TAG:` / `TAG(meta):`; `caseSensitive` / `caseInsensitive` = with or without `:`. |
| `colorOverrides` | `object` | `{}` | Key/value color overrides. See [Color Customization](#color-customization). |
| `enableIssueLinks` | `boolean` | `true` | Enable clickable issue links (`#123` → GitHub/GitLab/etc.) |
| `enablePrefixHighlighting` | `boolean` | `true` | Enable Better Comments-style prefix highlighting. |
| `patternProcessing` | `object` | *(see keys)* | Controls which files, folders, languages, and tags are processed. See [Pattern Processing](#pattern-processing). |
| `scanOnLoad` | `boolean` | `true` | Automatically scan workspace for code anchors on activation. |

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`) under the **KAT Comment Studio** category.

| Command | Description |
|---|---|
| `Toggle Comment Rendering` | Toggle rendering on/off |
| `Reflow Current Comment` | Reflow the comment block containing the cursor |
| `Reflow Comments in File` | Reflow all comment blocks in the document |
| `Scan Code Anchors` | Scan workspace for anchors (with progress) |
| `Export Code Anchors` | Export to CSV/Markdown/JSON |
| `Set Anchor Scope` | Choose Workspace / Folder / Document / Open Docs |
| `Filter Anchor Types` | Show/hide specific anchor types |
| `Go to Next Anchor` | Jump to next anchor in file |
| `Go to Previous Anchor` | Jump to previous anchor in file |
| `Show Comment Tooltip` | Show the rendered XML doc comment tooltip. Enabled when cursor is in or just below an XML doc comment. Also triggered via **F1** (see [F1 Interception](#f1-interception)). |
| `Remove Current XML Comment` | Remove the XML doc comment block at the cursor position |
| `Remove All XML Comments in File` | Remove every XML doc comment block in the active file |

> **VS Code-generated commands** (search by name in the palette):
> - `View: Toggle KAT Comment Studio` / `View: Show KAT Comment Studio` — show or hide the sidebar panel
> - `Focus on KAT Comment Studio - Code Anchors View` — focus the Code Anchors grid panel

---

## F1 Interception

When `interceptF1ForComments` is `true` (default), pressing **F1** while the cursor is inside an XML doc comment block — or on the first non-blank code line that immediately follows one (e.g., the method signature) — triggers **Show Comment Tooltip** instead of the VS Code help menu.

This gives you instant access to the rendered comment without moving your cursor. The standard F1 help menu is unaffected anywhere else.

To disable: set `KAT Comment Studio: Intercept F1 For Comments` to `false` in Settings.

---

## Keyboard Shortcuts

No keyboard shortcuts are registered by default. To bind commands, open **File → Preferences → Keyboard Shortcuts** (`Ctrl+K Ctrl+S`) and search for `KAT Comment Studio`.

| Suggested Key | Command |
|---|---|
| `Alt+PageDown` | `kat-comment-studio.nextAnchor` — go to next anchor in current file |
| `Alt+PageUp` | `kat-comment-studio.previousAnchor` — go to previous anchor in current file |

> **F1 is bound by default** when the cursor is in or below an XML doc comment (see [F1 Interception](#f1-interception)).

---

## EditorConfig Support

KAT Comment Studio reads `.editorconfig` files to pick up project-level configuration:

```ini
[*.cs]
max_line_length = 100        # used for comment reflow
custom_anchor_tags = PERF, DEBT
custom_anchor_tag_prefixes = @
```

File watcher updates settings automatically when `.editorconfig` changes — no reload required.

---

## Extension Developers

### Prerequisites

- **Node.js** 20 or later
- **VS Code** (any recent version)
- No global `vsce` install required — the repo uses a local `@vscode/vsce` dev dependency

### Getting Started

```bash
npm install
```

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `compile` | `npm run compile` | TypeScript → JS (`tsc -p ./`). Output goes to `out/` |
| `watch` | `npm run watch` | Incremental compile in watch mode |
| `test` | `npm test` | Run all tests once (Vitest) |
| `test:watch` | `npm run test:watch` | Run tests in watch mode |
| `lint` | `npm run lint` | ESLint on `src/` |
| `package` | `npm run package` | Bump patch version, compile, and create `.vsix` |

### VS Code Tasks

Two tasks are defined in `.vscode/tasks.json`:

- **compile** (Build task) — run with `Ctrl+Shift+B` for a one-off build
- **watch** (Default background task) — runs `tsc --watch` automatically; TypeScript errors appear in the Problems panel in real time

### Running / Debugging

Press **F5** (or **Run → Start Debugging**). The `Run Extension` launch config in `.vscode/launch.json` compiles first (`preLaunchTask: compile`), then opens an **Extension Development Host** window with the extension loaded.

Make changes in `src/`, save (watch compiles automatically), then press `Ctrl+R` in the Extension Development Host to reload.

### Packaging a `.vsix`

```bash
npm run package
```

This does three things in sequence:

1. Bumps the **patch version** in `package.json` (e.g., `1.0.3` → `1.0.4`) — file only, no git tag
2. Runs `@vscode/vsce package`, which triggers `vscode:prepublish` and compiles the extension
3. Writes the `.vsix` to `dist/`, updates the README VSIX filename references, and adds the previous version under `## Previous Versions`

Commit the version bump manually afterward if you want it tracked in git.

### Installing a `.vsix`

In VS Code: **Extensions** panel → `⋯` menu (top-right) → **Install from VSIX...** → select the file.

Or from the terminal:

```bash
code --install-extension kat-comment-studio-1.0.8.vsix
```

### Running Tests

```bash
npm test
```

Tests are in `test/` and use [Vitest](https://vitest.dev/). They are pure unit tests — no VS Code host required. Exit code 0 means all passed.

### Project Structure

```
src/
+-- extension.ts            # Activation — all command and provider registration
+-- types.ts                # Shared types and interfaces
+-- configuration.ts        # Settings management + .editorconfig integration
+-- anchors/                # Code anchors: service, scanner, tree view, grid panel, export
+-- commands/               # Comment remover commands
+-- diagnostics/            # LINK: validation diagnostics
+-- navigation/             # LINK: parser, navigator, validator, git service
+-- parsing/                # Comment block detection, XML doc parser, language config
+-- reflow/                 # Reflow engine, auto-reflow, smart paste
+-- rendering/              # CodeLens provider, decoration manager/factory, prefix highlighter
+-- services/               # EditorConfig service
test/                       # Vitest unit tests (mirrors src/ structure)
out/                        # Compiled JS output (git-ignored)
```

### VS Extension vs VS Code — Implementation Differences

This extension is a port and adaptation of [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) for Visual Studio 2022. The table below documents what was implemented the same, differently, or not at all — and what was added in the VS Code port.

#### Features Implemented Differently

| Original VS Feature | VS Code Implementation |
|---|---|
| Background parallel scanning (`SolutionAnchorScanner` with threads) | Synchronous scan with VS Code progress notification. Sufficient for typical workspace sizes. |
| WPF inline adornment replacement (renders XML comment as styled controls inline) | Replaced with CodeLens + hover popup. VS Code's Decoration API cannot replace text with arbitrary HTML. |
| Double-click rendered comment to edit raw source | Not available — VS Code decorations don't receive click events. Auto-unfold on cursor-enter is used instead. |
| Compact / Full rendering modes (Off / Compact / Full) | Collapsed into a single **On** mode (CodeLens + hover + auto-fold). Compact inline summary is not possible via VS Code API. |
| Auto-reflow while typing | Reflows on **cursor-exit** from the comment block. Real-time per-keystroke reflow would fight VS Code's undo stack. Controlled by `enableReflowOnCommentExit`. |
| Format Document integration (`Ctrl+K, Ctrl+D`) | Not registered — conflicts with language-specific formatters (C# Dev Kit, OmniSharp). Use **Reflow Comments in File** instead. |

#### Features Not Implemented

| Original VS Feature | Status |
|---|---|
| Left border indicator on rendered comments | Not implemented — VS Code's decoration API does not support a persistent left-border gutter marker. |
| Comment Remover: 7 specialized commands | Simplified to 2 commands: **Remove Current XML Comment** and **Remove All XML Comments in File**. |
| Export to TSV format | Not implemented. CSV, Markdown, and JSON are supported. TSV can be produced from CSV in Excel or Google Sheets. |
| "Use Compact Style for Short Summaries" setting | Not implemented (single rendering mode). |
| "Preserve Blank Lines" setting | Not implemented — blank lines between XML elements are removed during reflow for consistency. |

---

## References

- [VS Code Codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html) — icon names used in commands and the UI
- [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) — the original Visual Studio 2022 extension this project ports and extends
- [C# XML Documentation Tags](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags) — official reference for all supported XML doc tags

---

## Previous Versions

1. [1.0.7](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.7.vsix)
1. [1.0.6](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.6.vsix)
1. [1.0.5](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.5.vsix)
1. [1.0.4](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.4.vsix)
1. [1.0.3](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.3.vsix)
1. [1.0.2](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.2.vsix)
1. [1.0.1](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.1.vsix)

## License

MIT
