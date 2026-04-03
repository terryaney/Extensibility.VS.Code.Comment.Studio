# Future Ideas

Ideas and deferred features that have code present in the repository but are not currently active. Kept for reference so future developers understand what exists and why.

---

## Idea 1 — True Lightweight `refreshAnchors` (Separate from `scanAnchors`)

### Background

In the original [madskristensen/CommentsVS](https://github.com/madskristensen/CommentsVS) Visual Studio extension, the Code Anchors tool window had two distinct operations:

- **Scan** — full solution/workspace disk walk. Reads every file matching the configured extensions, rebuilds the anchor cache from scratch. Slow for large solutions but always up-to-date with the filesystem.
- **Refresh** — re-renders/re-applies the current filter and scope state to whatever is already in the in-memory cache. No filesystem I/O. Essentially "redraw the current view" — fast, cheap.

### Current VS Code State

The VS Code port registered `kat-comment-studio.refreshAnchors` as a command but never implemented a separate lightweight path. It is simply an alias:

```typescript
// src/extension.ts:630-633
vscode.commands.registerCommand('kat-comment-studio.refreshAnchors', () => {
  void vscode.commands.executeCommand('kat-comment-studio.scanAnchors');
});
```

It is also wired as the `requestRefresh` callback for `AnchorsGridProvider`:

```typescript
// src/extension.ts:393
() => { void vscode.commands.executeCommand('kat-comment-studio.refreshAnchors'); },
```

The command is currently surfaced in the Command Palette (under KAT Comment Studio) but is not in any toolbar or context menu.

### Why This Could Be Valuable

Today, scope/filter/search changes already use in-memory filtering — they don't rescan the filesystem. But the *Scan* command always does a full disk walk with a VS Code progress notification. If scanning ever becomes slow (large monorepos, many files), it would be useful to have:

- A named lightweight command that just re-applies the current `anchorViewState` (scope, filters, search query) to the existing `anchorCache` without touching the filesystem
- A heavier "full rescan from disk" command reserved for when files have actually changed outside of the VS Code file watcher coverage

### Code Locations

| Location | Description |
|---|---|
| `package.json` — command `kat-comment-studio.refreshAnchors` | Command definition (currently titled with OBSOLETE marker) |
| `src/extension.ts:393` | `requestRefresh` callback wired to `AnchorsGridProvider` |
| `src/extension.ts:630-633` | Command registration — currently just calls `scanAnchors` |
| `src/anchors/anchorsGridWebview.ts` | Webview sends `requestRefresh` message when the toolbar refresh button is clicked |

### Implementation Sketch (if/when needed)

1. Rename `requestRefresh` path in `AnchorsGridProvider` to trigger a filtered re-render from `anchorCache` rather than a full scan
2. Keep `scanAnchors` as the "rescan from disk" heavy command
3. Update toolbar: scan button → full disk scan; refresh button → re-render from cache
4. Remove the OBSOLETE marker from `package.json` and add the refresh command back to `view/title` menus

---
