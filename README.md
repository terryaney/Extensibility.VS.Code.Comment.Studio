# KAT Comment Studio

![KAT Comment Studio](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/xml.comments.after.rendered.png)

Transform raw XML doc comments and JSDoc blocks into clean inline summaries, with workspace-wide code anchors, smart comment reflow, clickable issue links, and cross-file `LINK:` navigation — all inside VS Code.

[⬇ Download the latest release (.vsix)](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.13.vsix)
 · 📖 [Documentation](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/)

> **Note:** KAT Comment Studio is not on the VS Code Marketplace. Install via VSIX using the link above.

---

## Getting Started

1. [Download the extension](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/dist/kat-comment-studio-1.0.13.vsix).
2. Press `Ctrl+Shift+P`, type `VSIX`, and select **Extensions: Install from VSIX...**

![Install from VSIX](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/install.png)

3. Browse to the downloaded `kat-comment-studio-1.0.13.vsix` and select it.

Nothing needs configuring afterwards — rendering, anchor scanning, prefix highlighting and issue links are all on by default.

---

## Features

| Feature | |
|---|---|
| **[XML Comment Rendering](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/rendering)** — Fold XML doc blocks into a clean one-line CodeLens. Click to open a formatted documentation popup. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/xml.comments.after.rendered.feature.png) |
| **[Comment Reflow](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/reflow)** — Wrap, clean up and normalize XML doc comment blocks on exit, on paste, or on demand. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/xml.comments.after.reflow.feature.png) |
| **[Documentation Popup](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/rendering/documentation-popup)** — Full formatted popup with sections, parameters, code examples and links. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/xml.comments.after.popup.feature.png) |
| **[Code Anchors](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/code-anchors)** — TODO, HACK, BUG and custom tags tracked across your entire workspace in a tree view and grid panel. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/code-anchors-sidebar.feature.png) |
| **[LINK: Navigation](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/link-navigation)** — Cross-file references with hover preview, completions and `Ctrl+Click` to navigate. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/code-anchors-links.feature.png) |
| **[Prefix Highlighting](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/prefix-highlighting)** — Better Comments-style coloring for `!`, `?`, `*`, `//`, `-` and `>` prefixed lines. | ![](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/raw/main/media/code-anchors-highlighting.feature.png) |

Also: [JSDoc/TSDoc Rendering](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/jsdoc) ·
[Issue Links](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/issue-links) ·
[Comment Remover](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/comment-remover) ·
[Colors](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/colors)

---

## Documentation

Full documentation lives at
**<https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/>**.

| Topic | |
|---|---|
| [Overview](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/overview) | What it does, and which languages it supports |
| [XML Doc Rendering](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/rendering) | CodeLens summaries, the documentation popup, folding |
| [JSDoc / TSDoc](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/jsdoc) | The same rendering for `/** */` blocks |
| [Comment Reflow](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/reflow) | Wrapping rules, timing, line width |
| [Code Anchors](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/code-anchors) | Tags, metadata, tree, grid, export, scanning |
| [Prefix Highlighting](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/prefix-highlighting) | Better Comments-style prefixes |
| [Issue Links](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/issue-links) | `#123` → your tracker |
| [LINK: Navigation](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/link-navigation) | Path prefixes, forms, workspace scenarios |
| [Comment Remover](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/comment-remover) | Removing doc comment blocks |
| [Settings Reference](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/settings) | Every setting, type and default |
| [Colors](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/colors) | Theme color IDs and `colorOverrides` |
| [Commands & Keys](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/commands) | Palette commands, F1, suggested bindings |
| [EditorConfig](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/editorconfig) | Per-project reflow line width |
| [VS vs VS Code](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/vs-differences) | How this port differs from the original |

---

## Supported Languages

CodeLens, the documentation popup, folding and reflow need a known doc-comment style:

| Language | Doc comment style | CodeLens & popup | Reflow |
|---|---|---|---|
| C# | `///` | ✓ | ✓ |
| VB | `'''` | ✓ | ✓ |
| F# | `///` | ✓ | ✓ |
| C/C++ | `///` | ✓ | ✓ |
| Razor / cshtml | `///` | ✓ | ✓ |
| TypeScript / TSX | `/** */` | ✓ | — |
| JavaScript / JSX | `/** */` | ✓ | — |
| SQL | `---` | — | — |
| PowerShell | `##`, `<# #>` | — | — |

Code anchors, prefix highlighting, issue links and `LINK:` navigation are **not** limited to this list — they work in every file you open. Markdown gets whole-file scanning, since the entire document is prose.

---

## Contributing

Prerequisites, scripts, debugging, packaging and project layout are in
[CONTRIBUTING.md](https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio/blob/main/CONTRIBUTING.md).

---

## References

- [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) — the original Visual Studio 2022 extension this project ports and extends
- [C# XML Documentation Tags](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags) — official reference for the supported XML doc tags
- [VS Code Codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html) — icon names used in commands and the UI

---

## License

MIT
