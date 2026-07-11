# Design: "Mine vs Everyone's PRs" toggle

**Date:** 2026-07-08
**Status:** Approved (design), pending implementation plan

## Problem

The PR Widget currently shows only PRs authored by the signed-in user — `listPrs`
hardcodes `--author @me` ([src/main/gh.ts](../../../src/main/gh.ts)). Users want to
optionally see **everyone's** open PRs to their tracked repos (e.g. to review or merge
teammates' work), while still being able to flip back to a focused "just mine" view.

## Decisions

Settled during brainstorming:

1. **Scope: global.** One app-wide toggle, not per-company or per-repo. Flips every
   tracked repo at once.
2. **Teammates' PRs are read-only.** When a PR you didn't author is shown, hide the
   destructive/automated actions (Merge, Discard, Fix). Keep the card openable, the
   GitHub link, and the `@author` meta.
3. **Open PRs only.** The toggle changes the main open-PR list. The per-tab "Completed"
   (recently-merged) dropdown stays scoped to the user's own merged PRs — a personal
   "what I shipped" record. `listMergedPrs` is untouched.

## Architecture

Data flows: **config → poller → gh → view → renderer**, plus a renderer → IPC → config
write path for the toggle.

### 1. Persistence & config (`src/main/config.ts`, `src/shared/types.ts`)

- Add `showAllAuthors: boolean` to `AppConfig`.
- Add to the Zod schema: `showAllAuthors: z.boolean().default(false)`. A config file
  written before this feature has no such key, so it loads as `false` — fully
  backward-compatible.
- `loadConfig` returns the field.
- New helper `setShowAllAuthors(value: boolean, path?): AppConfig` — loads, sets, saves,
  returns the updated config. Mirrors the existing `addCompany`/`removeRepo` helpers.

### 2. Data fetching (`src/main/gh.ts`)

- `listPrs(run, owner, repo, account, allAuthors: boolean)` — new final param.
  - `allAuthors === false` (default behavior): keep `--author @me`. Unchanged.
  - `allAuthors === true`: omit the `--author @me` args entirely, so the repo's open PRs
    from all authors are returned.
- New `viewerLogin(run, account): Promise<string>` — resolves the signed-in login for an
  account via `gh api user --jq .login`, run with that account's token env (reusing
  `envFor`). Cached per account in a module-level `Map` (same pattern as `tokenCache`),
  keyed by account name (`''` for the active/unnamed account). Only invoked when the
  toggle is on.

### 3. Ownership tagging (`src/main/poller.ts` → `src/main/view.ts` → `src/shared/types.ts`)

- Add `isMine: boolean` to `PrView`.
- `pollOnce` reads `cfg.showAllAuthors` and passes it to `listPrs`.
  - When **on**, it also resolves each repo's `viewerLogin` (cached, so ~one gh call per
    distinct account per cycle) and includes it on that repo's result entry:
    `{ repo, prs, viewerLogin }`.
  - When **off**, `viewerLogin` is omitted.
- `buildView` computes, per PR:
  `isMine = !viewerLogin || author.login.toLowerCase() === viewerLogin.toLowerCase()`.
  - Toggle **off** → `viewerLogin` absent → every PR `isMine: true`. No extra gh calls,
    identical behavior to today.
  - Toggle **on** → PRs whose author matches the viewer are `isMine: true`, others
    `false`.

The result-entry shape passed into `buildView` gains an optional `viewerLogin?: string`.

### 4. IPC + preload (`src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/global.d.ts`)

- `prw:get-settings` handler → returns `{ showAllAuthors: boolean }` (reads config; on
  error returns `{ showAllAuthors: false }`). Renderer calls this once on mount to seed
  the toggle.
- `prw:set-show-all` handler → `(value: boolean)`; calls `setShowAllAuthors(value)`, then
  `triggerRefresh()`. Returns `ActionResult`.
- Preload exposes `getSettings(): Promise<{ showAllAuthors: boolean }>` and
  `setShowAllAuthors(value: boolean): Promise<ActionResult>` on `window.prwidget`.
- `global.d.ts` updated to match.

### 5. UI

**Titlebar toggle (`src/renderer/App.tsx`, `src/renderer/styles.css`):**
A compact two-segment control **`Mine | All`** in `.titlebar-actions`, left of Refresh.
On mount, `getSettings()` seeds a `showAll` state. Clicking a segment sets the state
optimistically and calls `setShowAllAuthors(next)`; the main-process refresh then repolls
and pushes fresh data. Styled to match the existing minimal titlebar (small, muted, the
active segment highlighted).

**Read-only teammate PRs (`src/renderer/components/PrCard.tsx`):**
When `!pr.isMine`:
- Do not render the `✦ Fix with Claude` button.
- Do not render the `.card-actions` row (Merge / Discard).
- The card still opens the detail window, keeps the title→GitHub link and `@author` meta.
- Optional: a subtle inline hint (e.g. a muted "read-only" tag) — final call during
  implementation; not required for correctness.

`PrDetail.tsx` already has **no** action buttons, so it needs no gating.

### 6. Testing

- **`tests/gh.test.ts`**
  - `listPrs` with `allAuthors: false` includes `--author @me` in the gh args.
  - `listPrs` with `allAuthors: true` omits `--author @me`.
  - `viewerLogin` issues `api user --jq .login`, returns the trimmed login, and caches
    (second call issues no new gh invocation).
- **`tests/view.test.ts`**
  - With `viewerLogin` provided: PRs by the viewer get `isMine: true`, others `false`
    (case-insensitive match).
  - With `viewerLogin` absent: all PRs `isMine: true`.
- **`tests/config.test.ts`**
  - Schema default: config without `showAllAuthors` loads as `false`.
  - `setShowAllAuthors(true)` round-trips (reload reflects it).

## Blast radius

`src/shared/types.ts`, `src/main/config.ts`, `src/main/gh.ts`, `src/main/poller.ts`,
`src/main/view.ts`, `src/main/ipc.ts`, `src/preload/index.ts`,
`src/renderer/global.d.ts`, `src/renderer/App.tsx`,
`src/renderer/components/PrCard.tsx`, `src/renderer/styles.css`, and the three test
files above.

## Non-goals / YAGNI

- No per-company or per-repo override — global only.
- No change to the Completed/merged list.
- No new "assigned to me" / "review-requested" filters — just author scope.
- No author allowlist/blocklist.
