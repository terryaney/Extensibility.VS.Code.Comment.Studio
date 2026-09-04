# Contributing

Everything needed to clone, run, test and package KAT Comment Studio.

The user-facing documentation lives at
**<https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/>** — see
[Building the Extension](https://terryaney.github.io/Extensibility.VS.Code.Comment.Studio/#/contributing)
for this page rendered alongside it.

## Prerequisites

- **Node.js** 20 or later
- **VS Code**, any recent version
- No global `vsce` install — the repo uses a local `@vscode/vsce` dev dependency

```bash
git clone https://github.com/terryaney/Extensibility.VS.Code.Comment.Studio.git
cd Extensibility.VS.Code.Comment.Studio
npm install
```

## Scripts

| Script | Does |
|---|---|
| `npm run compile` | `tsc -p ./` — TypeScript to `out/` |
| `npm run watch` | Incremental compile in watch mode |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run package` | Bump the patch version, compile, and write a `.vsix` |

## Running and debugging

Press **F5**. The `Run Extension` launch config compiles first
(`preLaunchTask: compile`), then opens an Extension Development Host with the
extension loaded. Edit `src/`, save, then press `Ctrl+R` in the host window to
reload.

Two tasks are defined in `.vscode/tasks.json`:

- **compile** — the build task, `Ctrl+Shift+B`
- **watch** — the default background task; TypeScript errors appear in the
  Problems panel as you type

## Tests

Tests live in `test/` and use [Vitest](https://vitest.dev/). They are pure unit
tests — no VS Code host required, so the suite runs in a couple of seconds.

Anything that imports `vscode` cannot be unit tested. Keep logic in modules that
take plain values and keep the VS Code API at the edges; that is why anchor
matching, comment scanning, parsing and reflow are all separate from their
providers.

## Packaging a release

```bash
npm run package
```

`scripts/release.ps1` then:

1. Bumps the patch version in `package.json` — file only, no git tag
2. Runs `@vscode/vsce package`, which triggers `vscode:prepublish` and compiles
3. Writes the `.vsix` to `dist/` and rewrites the version in every file that
   names it

Commit the version bump and the new `.vsix` afterwards.

> **Two files contain the VSIX filename.** `README.md` and
> `docs/articles/install.html` both contain the literal
> `kat-comment-studio-<version>.vsix`, which the release script string-replaces.
> Keep that literal intact when editing either file or the download links go
> stale. The script warns when it finds no match.

Install a built `.vsix` from the Extensions panel → `⋯` → **Install from
VSIX...**, or:

```bash
code --install-extension kat-comment-studio-<version>.vsix
```

## Project layout

```
src/
  extension.ts        activation; all command and provider registration
  types.ts            shared types
  configuration.ts    settings + .editorconfig integration
  anchors/            anchor service, comment scanner, workspace scan, tree, grid, export
  commands/           comment remover
  diagnostics/        LINK: validation
  navigation/         LINK: parser and navigator, issue links, git service
  parsing/            comment block detection, XML/JSDoc parsers, language config
  reflow/             reflow engine, auto-reflow, smart paste
  rendering/          CodeLens provider, decoration manager, prefix highlighter
  services/           editorconfig service
docs/                 the documentation site
test/                 Vitest unit tests
out/                  compiled output (git-ignored)
```

### Where features are registered

`src/extension.ts` uses two document selectors, and which one a feature gets
determines where it works:

| Selector | Features | Scope |
|---|---|---|
| `DOC_COMMENT_LANGUAGES` | CodeLens, documentation popup, folding, reflow, comment remover | Languages with a known doc-comment style, derived from `src/parsing/languageConfig.ts` |
| `ALL_FILES` | Anchor coloring, prefix highlighting, issue links, `LINK:` | Every file |

To add doc-comment support for a language, add an entry to
`languageConfig.ts` — the selector is derived from it, so nothing else needs
changing.

## The documentation site

`docs/` is plain static files published by GitHub Pages from the `main` branch.
There is no build step — push and it is live.

- `docs/index.html` — the shell
- `docs/assets/manifest.json` — the ordered topic list driving nav and pager
- `docs/articles/<id>.html` — one HTML fragment per topic, semantic markup only
- `docs/assets/docs.css`, `docs/assets/docs.js` — styling and hash routing

To add a topic, drop a fragment in `articles/` and add an entry to
`manifest.json`. Headings get IDs and an on-this-page entry automatically; link
to one with `#/<article>/<heading-id>`.

Preview locally with any static server, e.g. `npx serve docs`.

Article fragments contain **no** `<html>`, `<head>` or `<style>` — semantic
markup only. Styling belongs in `docs.css`. The class names in use are
`ks-lede`, `ks-note`, `ks-warn`, `ks-shot`, `ks-icon`, `ks-cards`,
`ks-table-wrap` and `ks-swatch`.
