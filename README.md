# KAT Comment Studio

**KAT Comment Studio** is a VS Code extension that brings rich XML documentation comment rendering, smart comment reflow, workspace-wide code anchors, clickable issue links, and `LINK:` navigation to your editor. It is a port and extension of [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) for Visual Studio Code.

## Supported Languages

C#, VB, F#, C/C++, TypeScript, JavaScript, TypeScript/JavaScript React, Razor, SQL, PowerShell

---

## Features

- [XML Doc Comment Rendering](#xml-doc-comment-rendering)
- [Prefix Highlighting](#prefix-highlighting-better-comments-style)
- [Comment Reflow](#comment-reflow)
- [Code Anchors](#code-anchors)
- [Issue Links](#issue-links)
- [LINK: Navigation](#link-navigation)
- [Comment Remover](#comment-remover)
- [Color Customization](#color-customization)
- [Settings Reference](#settings-reference)

---

## XML Doc Comment Rendering

When rendering is **On**, XML documentation comment blocks are transformed from raw XML into a clean, readable experience using VS Code's native CodeLens API.

### How It Works

| What You See | What It Does |
|---|---|
| `Expand Xml \| Represents a user account.` | CodeLens on the method declaration line |
| Comment lines become nearly invisible | Auto-folded and dimmed (opacity `0.05` by default) |
| Click the summary text | Opens a documentation overlay on the Code Anchors pane |
| Click `Expand Xml` / `Collapse Xml` | Toggles fold state (unfold to edit, re-fold when done) |
| Cursor enters a folded block | Auto-unfolds after 500ms pause for editing |
| Cursor leaves an expanded block | Auto-re-folds after ~500ms |
| Press `Escape` | Toggle rendering off/on |

### CodeLens Positioning

The `codeLensPosition` setting controls where the CodeLens appears relative to the comment block:

| Value | Behavior |
|---|---|
| `inline` (default) | Placed on the method/property declaration line (alongside References) |
| `ownLine` | Placed on the line immediately above the declaration |

The CodeLens scans forward from the end of the comment block, skipping blank lines and C# attribute lines (`[...]`), to find the actual declaration.

### Documentation Overlay

Click the **summary text** in a CodeLens to open a themed documentation overlay on the Code Anchors grid pane:

- **Summary** — rendered as styled text
- **Parameters** — listed with name and description
- **Returns** — inline with description
- **Remarks** — label on its own line, content indented below
- **Example** — code blocks with quote styling
- **Exceptions** — list of exception types and descriptions
- **See Also** — clickable links
- **Anchor tags** — TODO:, NOTE:, HACK:, etc. are colorized using their configured colors

The overlay uses VS Code theme variables for consistent styling and dismisses on Escape, clicking outside, or the close button (✕). Focus returns to the editor on dismiss.

Inline formatting within XML tags is fully rendered: `code`, **bold**, *italic*, ~~strikethrough~~, and hyperlinks.

### XML Tag Support

The following XML doc tags are rendered in the documentation panel:

`<summary>`, `<param>`, `<typeparam>`, `<returns>`, `<remarks>`, `<example>`, `<exception>`, `<see>`, `<seealso>`, `<inheritdoc>`, `<paramref>`, `<typeparamref>`, `<c>`, `<code>`, `<list>`

### Toggle Rendering

| Trigger | Action |
|---|---|
| `Escape` (in editor) | Toggle rendering off/on |
| Command Palette → `Comment Studio: Toggle Comment Rendering` | Toggle rendering |
| Command Palette → `Comment Studio: Cycle Rendering Mode (Off → On)` | Same toggle |
| Right-click → **Comment Studio** submenu | Quick access |

### Collapse by Default

Enable `kat-comment-studio.collapseByDefault` to automatically fold all XML doc comment blocks whenever a file is opened, even when rendering is **Off**.

---

## Prefix Highlighting (Better Comments Style)

Comments beginning with specific prefix characters are highlighted with distinct colors and styles, inspired by the popular [Better Comments](https://marketplace.visualstudio.com/items?itemName=aaron-bond.better-comments) approach.

| Prefix | Style | Purpose |
|---|---|---|
| `// !` | 🔴 Red | Alerts and warnings |
| `// ?` | 🔵 Blue | Questions |
| `// *` | 🟢 Green | Highlighted notes |
| `// //` | ~~Gray~~ (strikethrough) | Deprecated / disabled code comments |
| `// -` | Dark Gray | Disabled items |
| `// >` | 🟣 Purple italic | Quotes |

These patterns also work with `#` (PowerShell/Python), `'` (VB), and other single-line comment markers.

Disable with `kat-comment-studio.enablePrefixHighlighting: false`.

---

## Comment Reflow

KAT Comment Studio automatically wraps and reformats XML doc comment blocks to stay within a configurable line width.

### Commands and Code Actions

Comment reflow is available through:

- **Command Palette** → `Comment Studio: Reflow Comment` — reflow all comment blocks in the document
- **Command Palette** → `Comment Studio: Reflow All Comments` — same as above
- **Light Bulb / Code Action** (`Ctrl+.`) — when cursor is inside a comment block, offers "Reflow comment" and "Reflow all comments"

The extension does not register a document or range formatting provider, avoiding conflicts with language-specific formatters (e.g., C# Dev Kit, OmniSharp).

### Light Bulb (Code Action)

Place the cursor anywhere inside an XML doc comment block, then press `Ctrl+.` to see a **Reflow comment** code action. This reflows only the current comment block without touching any other formatting.

### Smart Paste

When you paste text into an XML doc comment block, the entire block is automatically reflowed to fit within the max line width.

Controlled by `kat-comment-studio.enableReflowOnPaste` (default: `true`).

### Auto-Reflow While Typing

As you type in a doc comment and a line exceeds the max line width, the block is reflowed automatically after a 300ms pause.

Controlled by `kat-comment-studio.enableReflowWhileTyping` (default: `true`).

### Line Width

The reflow width is resolved in this order:
1. `.editorconfig` `max_line_length` for the file's directory (if present)
2. `kat-comment-studio.maxLineLength` setting (default: `120`)

### XML-Aware Wrapping

The reflow engine understands XML structure:
- Block tags (`<summary>`, `<remarks>`, `<param>`, etc.) each wrap their content independently
- `<code>` blocks are preserved as preformatted — never reflowed
- Intentional blank lines within blocks are preserved when `kat-comment-studio.preserveBlankLines` is `true`

---

## Code Anchors

Code anchors are specially tagged comments that mark items of interest across your workspace. KAT Comment Studio scans your entire workspace, displays anchors in a tree view and grid panel, and lets you navigate between them.

### Built-in Anchor Types

| Tag | Color | Icon | Purpose |
|---|---|---|---|
| `TODO` | 🟠 Orange | ✅ | Work to be done |
| `HACK` | 🔴 Crimson | ⚠️ | Workaround that needs cleanup |
| `NOTE` | 🔵 Royal Blue | 📝 | Important information |
| `BUG` | 🔴 Red | 🐛 | Known bug |
| `FIXME` | 🔴 Orange-Red | 🔧 | Must be fixed |
| `UNDONE` | ⚫ Gray | ⊘ | Reverted or incomplete |
| `REVIEW` | 🟣 Purple | 👁️ | Needs review |
| `ANCHOR` | 🩵 Teal | 🔗 | Named navigation target |

### Basic Syntax

Tags are **case-insensitive** — `todo`, `Todo`, and `TODO` are all recognized and normalized to uppercase in all views.

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

> **Note:** `ANCHOR:` without a name (e.g., `// ANCHOR:`) is silently ignored — a name is required for the anchor to have any purpose as a navigation target.

### Custom Tags

Add your own tags via `kat-comment-studio.customTags` (comma-separated). Custom tags are highlighted in **Goldenrod** and appear in all views alongside built-in types.

```json
"kat-comment-studio.customTags": "PERF, SECURITY, DEBT, REFACTOR"
```

### Tag Prefixes

Allow prefix characters before tags so `// @TODO:` is treated the same as `// TODO:`. Configure via `kat-comment-studio.tagPrefixes` (default: `@, $`).

### Inline Decorations

Each anchor tag is highlighted inline in the editor with its type color. Colored markers also appear in the **scrollbar/overview ruler** so you can see anchor density at a glance.

Disable with `kat-comment-studio.enableTagHighlighting: false`.

### Sidebar Tree View

The **KAT Comment Studio** activity bar panel shows a tree of all anchors grouped by file.

**Toolbar actions:**

| Button | Action |
|---|---|
| 🔍 Scan | Scan the entire workspace for anchors |
| 🔄 Refresh | Re-run the scan |
| ⬆️ Export | Export visible anchors to a file |
| ⊟ Set Scope | Filter by scope |
| ≡ Filter Types | Toggle which anchor types are shown |

**Scope options** (Command Palette → `Comment Studio: Set Anchor Scope` or the grid dropdown):

- **Workspace** — all files in the workspace
- **Current Folder** — the active file's workspace folder. In a single-folder window this is the root folder; in a multi-root workspace it is disabled until an active workspace document exists.
- **Current Document** — only the active file
- **Open Documents** — all currently open files
- **Repo: _name_** — only files inside a discovered Git repository
- **Project: _name_** — only files inside a discovered `.csproj`

**Type filter** (Command Palette → `Comment Studio: Filter Anchor Types`):
Multi-select picker to show/hide specific anchor types. The tree view and bottom grid now share the same scope, search text, and type filter state so refreshes and rescans do not reset the active view.

### Bottom Panel Grid

A sortable, filterable grid panel (**KAT Comment Studio - Code Anchors**) is available in the bottom panel alongside Problems and Output.

**Columns:** Type · Description · File · Line · Owner · Issue · Due Date

- Click a column header to sort ascending/descending
- Free-text search filters across description, file, owner, repo, and project metadata
- Scope dropdown stays synchronized with the tree view
- Type filter dropdown uses explicit include/exclude checkboxes and persists across refresh/rescan
- Drag column edges to resize; widths persist across view reloads and restarts
- Type cells render icon + text with anchor semantic colors
- Click any row to navigate to the anchor in the editor
- Right-click a row to copy a deterministic row summary; right-click a cell to copy the cell value
- Overdue dates are highlighted

Access via: Command Palette → `Comment Studio: Show Code Anchors Grid`

### Anchor Navigation

Jump between anchors in the current file using keyboard shortcuts:

| Shortcut | Action |
|---|---|
| `Alt+PageDown` | Go to next anchor |
| `Alt+PageUp` | Go to previous anchor |

### Export

Export all visible anchors to a file. Supported formats:

| Format | Description |
|---|---|
| **CSV** | Comma-separated |
| **Markdown** | GitHub-flavored Markdown table |
| **JSON** | Structured JSON array |

Command: `Comment Studio: Export Code Anchors`

### Auto-Scan on Load

When `kat-comment-studio.scanOnLoad` is `true` (default), the workspace is scanned automatically when the extension activates. Results are cached and updated incrementally on file save.

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

## LINK: Navigation

The `LINK:` syntax creates navigable cross-references directly in comments. Hover for a preview or `Ctrl+Click` to jump.

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
// LINK: MyFile.cs                              → bare, relative to current file's dir
// LINK: ./relative/path/to/file.cs             → explicit relative
// LINK: ../sibling/folder/file.ts              → parent-relative
// LINK: @/Services/UserService.cs              → project-relative (nearest .csproj dir)
// LINK: /Core/Domain/src/Models/User.cs        → workspace-root-relative (first folder)
// LINK: C:/BTR/Camelot/Core/Domain/src/User.cs → absolute path
// LINK: MyFile.cs:42                           → jump to line 42
// LINK: MyFile.cs:10-20                        → highlight lines 10–20
// LINK: MyFile.cs#AnchorName                   → jump to named ANCHOR in target file
// LINK: #LocalAnchorInThisFile                 → jump to ANCHOR in current file
// LINK: path with spaces/file.cs:5             → spaces in path are supported
```

**Hover** over any `LINK:` reference to see the resolved path and whether the target exists.

**Ctrl+Click** (or use `Go to Definition`) to navigate directly to the target.

### IntelliSense Completions

Type `LINK: ` inside a comment to get path completions. The completion provider recognizes all path prefixes:

- `LINK: @/` — browse from the nearest `.csproj` directory
- `LINK: /` — browse from the first workspace folder root
- `LINK: ./` — browse from the current file's directory
- `LINK: ../` — browse from the current file's parent directory
- `LINK: C:/` — browse an absolute Windows path
- `LINK: someFolder/` — browse from the current file's directory (bare path)

Selecting a **directory** in the completion list re-triggers suggestions so you can drill deeper without retyping. Named `ANCHOR` tags found across the workspace are also offered as completions for `LINK: #` references.

### Validation (Diagnostics)

Broken `LINK:` references (missing files, unresolved anchors) are flagged with **warning squiggles** in the editor. Diagnostics clear automatically when the link is corrected.

---

## Comment Remover

Seven bulk comment removal commands are available from the Command Palette under the `Comment Studio:` category.

| Command | Description |
|---|---|
| `Remove All Comments` | Remove every comment in the document |
| `Remove All Comments in Selection` | Remove comments within the current selection |
| `Remove All Except XML Doc Comments` | Remove comments but preserve `///` doc blocks |
| `Remove All Except Anchors` | Remove comments but preserve anchor tags (TODO, HACK, etc.) |
| `Remove XML Doc Comments Only` | Remove only `///` doc comment blocks |
| `Remove Anchors Only` | Remove only lines containing anchor tags |
| `Remove Regions` | Remove `#region` / `#endregion` directives |

All commands perform smart cleanup: lines that become entirely empty after comment removal are deleted.

Quick access via the **Comment Studio** right-click context menu in the editor.

---

## Color Customization

All colors have **theme-aware defaults** for dark, light, and high-contrast themes. Override any color globally via hex settings.

### Anchor Type Colors

| Theme Color ID | Setting Key | Default (Dark) |
|---|---|---|
| `katCommentStudio.anchorTodo` | `colors.todo` | `#FF8C00` |
| `katCommentStudio.anchorHack` | `colors.hack` | `#DC143C` |
| `katCommentStudio.anchorNote` | `colors.note` | `#4169E1` |
| `katCommentStudio.anchorBug` | `colors.bug` | `#FF0000` |
| `katCommentStudio.anchorFixme` | `colors.fixme` | `#FF4500` |
| `katCommentStudio.anchorUndone` | `colors.undone` | `#808080` |
| `katCommentStudio.anchorReview` | `colors.review` | `#9370DB` |
| `katCommentStudio.anchorAnchor` | `colors.anchor` | `#20B2AA` |
| `katCommentStudio.anchorCustom` | `colors.custom` | `#DAA520` |

### Rendered Comment Colors

| Theme Color ID | Setting Key | Purpose |
|---|---|---|
| `katCommentStudio.renderedText` | `colors.renderedText` | General comment text |
| `katCommentStudio.renderedHeading` | `colors.renderedHeading` | Section headings |
| `katCommentStudio.renderedCode` | `colors.renderedCode` | Inline code |
| `katCommentStudio.renderedLink` | `colors.renderedLink` | Links |

### Prefix Highlight Colors

| Theme Color ID | Setting Key | Prefix |
|---|---|---|
| `katCommentStudio.prefixAlert` | `colors.prefixAlert` | `// !` |
| `katCommentStudio.prefixQuestion` | `colors.prefixQuestion` | `// ?` |
| `katCommentStudio.prefixHighlight` | `colors.prefixHighlight` | `// *` |
| `katCommentStudio.prefixStrikethrough` | `colors.prefixStrikethrough` | `// //` |
| `katCommentStudio.prefixDisabled` | `colors.prefixDisabled` | `// -` |
| `katCommentStudio.prefixQuote` | `colors.prefixQuote` | `// >` |

**Example override** (`settings.json`):
```json
"kat-comment-studio.colors.todo": "#FFA500",
"kat-comment-studio.colors.prefixAlert": "#FF0000"
```

Leave any setting empty (`""`) to use the theme default automatically.

### Hover Popup Code Block Backgrounds

The hover popup (triggered by clicking the CodeLens summary) renders fenced code blocks using VS Code's Monaco tokenizer (`monaco-tokenized-source`). This is an internal rendering path — it is **not** controlled by the `textCodeBlock.background` or `textPreformat.background` workbench tokens. The background defaults to the hover widget background color (`editorHoverWidget.background`).

There are two separate scenarios:

#### Inline code ticks (`` `code` ``)

Controlled by `textCodeBlock.background`. To match your editor background:

1. **Find your editor background color:**
   - Open the Command Palette (`Ctrl+Shift+P`) → `Developer: Generate Color Theme From Current Settings`
   - This dumps all resolved token values for your active theme to a new editor tab
   - Search for `editor.background` — copy that hex value
   - ⚠️ This value is **theme-specific** and static. If you switch themes you'll need to update it manually.

2. **Override the token** in `settings.json`:
   ```json
   "workbench.colorCustomizations": {
       "textCodeBlock.background": "#222222"
   }
   ```
   Replace `#222222` with the `editor.background` hex value from step 1.

#### Fenced code blocks (` ```csharp ... ``` `)

These use the Monaco tokenizer internally and are **not** affected by any workbench color token. The only way to style them is via custom CSS (and optionally JS) injection using the [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css) extension by be5invis.

**Step 1 — Install Custom CSS and JS Loader** from the VS Code marketplace.

**Step 2 — Find your editor background color:**
- Open the Command Palette (`Ctrl+Shift+P`) → `Developer: Generate Color Theme From Current Settings`
- Search for `editor.background` in the generated output — copy that hex value
- ⚠️ This is **theme-specific** and static. Update it manually if you switch themes.

**Step 3 — Choose scoped (recommended) or simple:**

---

##### Option A — Scoped to KAT Comment Studio only (recommended)

This uses a MutationObserver in custom JS to detect KAT Comment Studio's hover popup (which includes a unique invisible marker element) and tag it with a CSS class, enabling styling that won't affect IntelliSense or other extension hovers.

Create a **CSS file** — e.g. `C:\Users\YourName\vscode-custom.css`:
```css
/* KAT Comment Studio — scoped fenced code block background */
.kat-comment-hover .monaco-tokenized-source {
    background-color: #222222 !important; /* replace with your editor.background */
}
```

Create a **JS file** — e.g. `C:\Users\YourName\vscode-custom.js`:
```javascript
// KAT Comment Studio — tag hover popup for scoped CSS.
// VS Code reuses the same .monaco-hover widget for all hovers (IntelliSense,
// extensions, etc.) — only the content changes. KAT hovers are identified by
// the presence of a $(book) codicon heading (rendered as .codicon-book), which
// IntelliSense and other extension hovers won't produce. Skip unrelated
// mutations (editor keystrokes, tree updates, etc.) to avoid unnecessary scanning.
const katObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some(m =>
        m.target.closest?.('.monaco-hover') ||
        Array.from(m.addedNodes).some(n =>
            n.nodeType === 1 &&
            (n.classList?.contains('monaco-hover') || n.querySelector?.('.monaco-hover'))
        )
    );
    if (!relevant) return;
    document.querySelectorAll('.monaco-hover').forEach(h => {
        const isKat = Array.from(h.querySelectorAll('strong > .codicon-book'))
            .some(el => el.closest('strong').textContent.trim() === 'Example');
        if (isKat) {
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

If you're comfortable with all VS Code hover tooltips using your editor background for code blocks (often looks fine), this is simpler — no JS needed:

```css
/* All Monaco hovers — fenced code block background */
.monaco-hover .monaco-tokenized-source {
    background-color: #222222 !important; /* replace with your editor.background */
}
```

---

**Step 4 — Apply:** Open the Command Palette → `Enable Custom CSS and JS` → click **Restart** when prompted.

**Step 5 — Dismiss the warning:** VS Code will show a yellow "corrupted installation" warning bar. This is expected and harmless — VS Code checksums its own files and any CSS injection triggers it. You can safely dismiss it.

**Important caveats:**
- Re-run `Enable Custom CSS and JS` after every VS Code update
- Update the hex color in your CSS file if you switch themes
- If you already use another custom CSS extension, add these rules to your existing files rather than creating new ones — multiple extensions patching the same workbench file can conflict

---

#### Complete line hiding (optional — requires Custom CSS and JS Loader)

By default, when rendering is active the original XML comment lines are dimmed to `opacity: 0.05` and the block is auto-folded. One blank line gap remains (the fold anchor line). Setting `dimOpacity` to `0` in your settings makes those lines fully invisible:

```json
"kat-comment-studio.dimOpacity": 0
```

This is the maximum hiding achievable through the VS Code extension API alone — one blank line gap still remains after folding.

---

## Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `renderingMode` | `"off"` \| `"on"` | `"on"` | How XML doc comments are rendered |
| `enabledLanguages` | `string[]` | *(all supported)* | Language IDs with rendering enabled |
| `dimOriginalComments` | `boolean` | `true` | Dim original comment text when rendering is active |
| `dimOpacity` | `number` | `0.05` | Opacity for dimmed comments (0–1.0). Set to `0` to make comment lines fully invisible. |
| `maxLineLength` | `number` | `120` | Max width for comment reflow (overridden by `.editorconfig`) |
| `codeLensPosition` | `"inline"` \| `"ownLine"` | `"inline"` | Where CodeLens appears: on declaration line or above it |
| `enableReflowOnPaste` | `boolean` | `true` | Reflow when pasting into a doc comment block |
| `enableReflowWhileTyping` | `boolean` | `true` | Reflow after 300ms pause when line exceeds max width |
| `preserveBlankLines` | `boolean` | `true` | Preserve intentional blank lines during reflow |
| `collapseByDefault` | `boolean` | `false` | Collapse XML doc comments when opening files |
| `codeLensMaxLength` | `number` | `0` | Max chars for CodeLens summary text before truncation. `0` = no truncation. |
| `enableTagHighlighting` | `boolean` | `true` | Inline color highlighting of anchor tags |
| `anchorColorizeMode` | `"never"` \| `"caseSensitive"` \| `"caseInsensitive"` | `"caseInsensitive"` | Colorization of anchor keywords not followed by `:`. Keywords with `:` always colorize. |
| `enablePrefixHighlighting` | `boolean` | `true` | Better Comments–style prefix highlighting |
| `enableIssueLinks` | `boolean` | `true` | Clickable `#123` issue links |
| `customTags` | `string` | `""` | Comma-separated custom anchor tags (e.g., `"PERF, SECURITY"`) |
| `tagPrefixes` | `string` | `"@, $"` | Prefix characters recognized before anchor tags |
| `scanOnLoad` | `boolean` | `true` | Auto-scan workspace for anchors on activation |
| `fileExtensionsToScan` | `string` | `"cs,vb,fs,..."` | File extensions included in anchor scan |
| `foldersToIgnore` | `string` | `"node_modules,bin,..."` | Folder names excluded from anchor scan |

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P`) under the **Comment Studio** category.

| Command | Description |
|---|---|
| `Toggle Comment Rendering` | Toggle rendering on/off |
| `Reflow Current Comment` | Reflow the comment block containing the cursor |
| `Reflow Comments in File` | Reflow all comment blocks in the document |
| `Scan Code Anchors` | Scan workspace for anchors (with progress) |
| `Refresh Code Anchors` | Re-scan workspace |
| `Export Code Anchors` | Export to TSV/CSV/Markdown/JSON |
| `Set Anchor Scope` | Choose Workspace / Folder / Document / Open Docs |
| `Filter Anchor Types` | Show/hide specific anchor types |
| `Go to Next Anchor` | Jump to next anchor in file (`Alt+PageDown`) |
| `Go to Previous Anchor` | Jump to previous anchor in file (`Alt+PageUp`) |
| `Show Code Anchors Grid` | Open the bottom panel grid |
| `Remove All Comments` | Remove all comments from document |
| `Remove All Comments in Selection` | Remove comments in selection |
| `Remove All Except XML Doc Comments` | Preserve `///` doc blocks |
| `Remove All Except Anchors` | Preserve anchor tags |
| `Remove XML Doc Comments Only` | Remove only doc comment blocks |
| `Remove Anchors Only` | Remove only anchor lines |
| `Remove Regions` | Remove `#region`/`#endregion` directives |

---

## Keyboard Shortcuts

| Key | Command |
|---|---|
| `Escape` | Toggle comment rendering (when rendering is active) |
| `Alt+PageDown` | Go to next anchor in current file |
| `Alt+PageUp` | Go to previous anchor in current file |

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

## License

MIT
