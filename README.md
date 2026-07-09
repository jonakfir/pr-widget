# PR Widget

A frameless macOS desktop widget that triages your open GitHub pull requests across multiple companies — grouped into tabs, each PR broken down by repo, with one-click Merge, Discard, a "Completed" (merged) view, and an autonomous **Fix with Claude** action for PRs whose checks are failing.

Built with Electron + React + TypeScript (electron-vite), packaged with electron-builder.

## Features

- **Per-company tabs** — user-defined groups, each with a live open-PR count. Add companies and repos from the UI.
- **Grouped by repo** within a company, newest first, with CI status badges (passing / failing / pending).
- **Only your PRs** — scoped to the authenticated user (`--author @me`).
- **Merge** (squash) and **Discard** (close) straight from the card, each behind a confirm dialog.
- **Completed dropdown** per company — lazily loads recently-merged PRs from GitHub so nothing "disappears".
- **Fix with Claude** — on a failing PR, spawns a headless `claude` run that checks out the branch, fixes the failing checks, and pushes an update. Gated by a confirm dialog.
- **Click a card** to open a standalone, resizable detail window with the full PR body.
- **Frameless frosted-glass** window, floats as a desktop widget, drag by the top strip; a menu-bar item toggles it. Auto-refreshes on an interval.

## Prerequisites

- **Node 22** (via nvm).
- **[`gh`](https://cli.github.com/) CLI**, authenticated for each GitHub account you use (`gh auth login`). Multiple accounts are supported — each repo can name which account to use.
- **`claude` CLI** — only needed for the *Fix with Claude* action.

## Configuration

The app writes `~/.pr-widget/config.json` for you as you add companies and repos
from the UI — you don't have to hand-edit it. It looks like this:

```json
{
  "pollIntervalMinutes": 0.5,
  "companies": ["Company A", "Company B"],
  "repos": [
    { "company": "Company A", "owner": "octocat",   "repo": "hello-world", "account": "personal" },
    { "company": "Company B", "owner": "acme-corp", "repo": "backend",     "account": "work" }
  ]
}
```

- `companies` is your ordered list of tabs (add/remove them with the **"+"** and **"Remove tab"** controls).
- Each repo names its `company`, `owner`, and `repo`. `account` is optional — omit it to use the active `gh` account. When you add a repo from the UI, the app auto-detects which signed-in account can access it. Each `gh` call authenticates via that account's token (no global `gh auth switch`), so many repos across accounts poll safely in parallel.
- `pollIntervalMinutes` accepts fractions (`0.5` = 30s).

Runtime data lives under `~/.pr-widget/`: `config.json`, `state.json` (local dismissals), and `work/` (Fix-with-Claude checkouts + logs).

## Develop / build

```bash
npm install
npm run dev        # run the app in dev (electron-vite)
npm run typecheck  # tsc --noEmit (strict + noUncheckedIndexedAccess)
npm test           # vitest (pure-logic units: gh, poller, state, view, config)
npm run build      # bundle main/preload/renderer
npm run dist       # package a .dmg via electron-builder (macOS, menu-bar app)
```

Installing the packaged app registers it to launch at login (`LSUIElement` menu-bar app, no Dock icon).

## Architecture

- `src/main/` — Electron main process: `gh.ts` (token-auth gh wrapper), `poller.ts` (bounded-concurrency, per-repo-isolated polling), `state.ts` (local dismissals), `view.ts` (grouping), `ipc.ts` (actions), `fix.ts` + `scripts/fix-pr.sh` (Fix with Claude), `tray.ts`, `index.ts`.
- `src/preload/` — `contextBridge` API (`window.prwidget`).
- `src/renderer/` — React UI (tabs, cards, detail window, completed dropdown).
- `src/shared/types.ts` — types shared across processes.
