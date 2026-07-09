# Mine vs Everyone's PRs Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global toggle to the PR Widget that switches the open-PR list between "only my PRs" and "everyone's PRs" per tracked repo, with teammates' PRs shown read-only.

**Architecture:** A `showAllAuthors` boolean persists in `~/.pr-widget/config.json`. The poller passes it to `listPrs` (which drops `--author @me` when on) and, when on, resolves each repo's signed-in login via a cached `viewerLogin` call so `buildView` can tag each `PrView` with `isMine`. The renderer reads/sets the flag over IPC, shows a `Mine | All` titlebar control, and hides Fix/Merge/Discard on any card where `!isMine`.

**Tech Stack:** Electron + electron-vite, React 18, TypeScript (strict), Zod, Vitest. `gh` CLI for all GitHub access.

## Global Constraints

- TypeScript strict mode; no `any`. (`tsconfig.json`)
- Every `gh` call is invoked through the injected `GhRunner`; account auth is via `GH_TOKEN` env (never `gh auth switch`). (`src/main/gh.ts`)
- Backward compatibility: a `config.json` written before this feature (no `showAllAuthors` key) MUST load and behave exactly as today (mine-only).
- Toggle OFF is the default and MUST issue zero extra `gh` calls vs. today.
- The Completed/merged list (`listMergedPrs`) is NOT changed by this feature.
- Test runner: `npx vitest run <file>`; typecheck: `npm run typecheck`; build: `npm run build`.

---

### Task 1: Config field + `setShowAllAuthors` helper

**Files:**
- Modify: `src/shared/types.ts` (add field to `AppConfig`)
- Modify: `src/main/config.ts` (schema default + new helper)
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `AppConfig.showAllAuthors: boolean`; `setShowAllAuthors(value: boolean, path?: string): AppConfig`

- [ ] **Step 1: Write the failing tests**

Add to `tests/config.test.ts` (import `setShowAllAuthors` in the top import from `../src/main/config`):

```ts
describe('showAllAuthors', () => {
  it('defaults to false when absent (backward compatible)', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, repos: [] })
    expect(loadConfig(p).showAllAuthors).toBe(false)
  })

  it('loads an explicit true', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, showAllAuthors: true, repos: [] })
    expect(loadConfig(p).showAllAuthors).toBe(true)
  })

  it('setShowAllAuthors round-trips and persists', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, repos: [] })
    const cfg = setShowAllAuthors(true, p)
    expect(cfg.showAllAuthors).toBe(true)
    expect(loadConfig(p).showAllAuthors).toBe(true)
    expect(setShowAllAuthors(false, p).showAllAuthors).toBe(false)
    expect(loadConfig(p).showAllAuthors).toBe(false)
  })
})
```

Update the top import line:

```ts
import { loadConfig, addCompany, addRepo, removeCompany, removeRepo, setShowAllAuthors } from '../src/main/config'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts -t showAllAuthors`
Expected: FAIL — `setShowAllAuthors` is not exported / `showAllAuthors` is undefined.

- [ ] **Step 3: Add the field to `AppConfig`**

In `src/shared/types.ts`, inside `interface AppConfig`, add after `pollIntervalMinutes`:

```ts
  /** When true, list every author's open PRs per repo; when false (default), only the signed-in user's. */
  showAllAuthors: boolean
```

- [ ] **Step 4: Add schema default, thread through `loadConfig`, add helper**

In `src/main/config.ts`, add to `ConfigSchema` (after `pollIntervalMinutes`):

```ts
  showAllAuthors: z.boolean().default(false),
```

In `loadConfig`'s returned object (after `pollIntervalMinutes: d.pollIntervalMinutes,`):

```ts
    showAllAuthors: d.showAllAuthors,
```

Add this helper at the end of the file:

```ts
// Set the global "show all authors" flag (mine-only vs everyone's open PRs).
export function setShowAllAuthors(value: boolean, path: string = defaultConfigPath()): AppConfig {
  const cfg = loadConfig(path)
  cfg.showAllAuthors = value
  saveConfig(cfg, path)
  return cfg
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (all config tests, including the new `showAllAuthors` group).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/config.ts tests/config.test.ts
git commit -m "feat: persist showAllAuthors flag in config"
```

---

### Task 2: `listPrs` author scope + `viewerLogin`

**Files:**
- Modify: `src/main/gh.ts`
- Test: `tests/gh.test.ts`

**Interfaces:**
- Consumes: existing `GhRunner`, `envFor`, `ok`, `PR_FIELDS`.
- Produces:
  - `listPrs(run, owner, repo, account, allAuthors?: boolean): Promise<RawPr[]>` — `allAuthors` defaults to `false` (keeps `--author @me`); `true` omits the author filter.
  - `viewerLogin(run: GhRunner, account: string | undefined): Promise<string>` — cached per account.

- [ ] **Step 1: Write the failing tests**

Add to `tests/gh.test.ts` (extend the top import to include `viewerLogin`):

```ts
describe('listPrs author scope', () => {
  it('keeps --author @me by default and when allAuthors is false', async () => {
    const { run, calls } = runnerFrom({ 'pr list': { stdout: '[]' } })
    await listPrs(run, 'o', 'r', undefined)
    await listPrs(run, 'o', 'r', undefined, false)
    for (const c of calls.filter((c) => c.args[0] === 'pr' && c.args[1] === 'list')) {
      expect(c.args).toContain('--author')
      expect(c.args).toContain('@me')
    }
  })

  it('omits --author when allAuthors is true', async () => {
    const { run, calls } = runnerFrom({ 'pr list': { stdout: '[]' } })
    await listPrs(run, 'o', 'r', undefined, true)
    const list = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'list')!
    expect(list.args).not.toContain('--author')
    expect(list.args).not.toContain('@me')
    expect(list.args).toContain('--state')
    expect(list.args).toContain('open')
  })
})

describe('viewerLogin', () => {
  it('queries `api user --jq .login`, trims, and caches per account', async () => {
    const { run, calls } = runnerFrom({
      'auth token': { stdout: 'gho_VL\n' },
      'api user': { stdout: 'octocat\n' }
    })
    expect(await viewerLogin(run, 'acctVL')).toBe('octocat')
    expect(await viewerLogin(run, 'acctVL')).toBe('octocat')
    const apiCalls = calls.filter((c) => c.args[0] === 'api' && c.args[1] === 'user')
    expect(apiCalls).toHaveLength(1)
    expect(apiCalls[0]!.args).toEqual(['api', 'user', '--jq', '.login'])
    expect(apiCalls[0]!.env?.GH_TOKEN).toBe('gho_VL')
  })
})
```

Update the top import line:

```ts
import { deriveCiStatus, listPrs, listMergedPrs, mergePr, closePr, viewerLogin, type GhRunner } from '../src/main/gh'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/gh.test.ts -t "author scope|viewerLogin"`
Expected: FAIL — `viewerLogin` not exported; `allAuthors` param ignored.

- [ ] **Step 3: Implement the signature change + `viewerLogin`**

In `src/main/gh.ts`, replace the existing `listPrs` function with:

```ts
export async function listPrs(
  run: GhRunner,
  owner: string,
  repo: string,
  account: string | undefined,
  allAuthors = false
): Promise<RawPr[]> {
  const env = await envFor(run, account)
  // Default scopes to the authenticated account's own PRs (`--author @me`).
  // When allAuthors is on, we drop that filter so every open PR is returned.
  const args = ['pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'open']
  if (!allAuthors) args.push('--author', '@me')
  args.push('--json', PR_FIELDS)
  const out = await ok(run, args, env)
  return JSON.parse(out) as RawPr[]
}
```

Add, next to the `tokenCache` block (after `envFor`):

```ts
// Signed-in login per account (or the active account when undefined), cached.
// Only queried when the "show all authors" toggle is on, to tag PR ownership.
const loginCache = new Map<string, string>()

export async function viewerLogin(run: GhRunner, account: string | undefined): Promise<string> {
  const cacheKey = account ?? ''
  const hit = loginCache.get(cacheKey)
  if (hit !== undefined) return hit
  const env = await envFor(run, account)
  const login = (await ok(run, ['api', 'user', '--jq', '.login'], env)).trim()
  loginCache.set(cacheKey, login)
  return login
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/gh.test.ts`
Expected: PASS (existing gh tests still pass — the default `listPrs(run,'o','r',undefined)` still contains `--author @me`).

- [ ] **Step 5: Commit**

```bash
git add src/main/gh.ts tests/gh.test.ts
git commit -m "feat: allAuthors scope for listPrs + cached viewerLogin"
```

---

### Task 3: `PrView.isMine` + `buildView` ownership tagging

**Files:**
- Modify: `src/shared/types.ts` (add `isMine` to `PrView`)
- Modify: `src/main/view.ts`
- Test: `tests/view.test.ts`

**Interfaces:**
- Consumes: `RawPr`, `RepoConfig`, `StateMap`.
- Produces:
  - `PrView.isMine: boolean`
  - `buildView(results, state, companies)` where each `results` entry is now
    `{ repo: RepoConfig; prs: RawPr[]; viewerLogin?: string }`. When `viewerLogin` is
    present, `isMine = author.login.toLowerCase() === viewerLogin.toLowerCase()`;
    when absent, `isMine = true`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/view.test.ts`. First add an author-aware PR factory below the existing `mkPr`:

```ts
const mkPrBy = (n: number, login: string): RawPr => ({
  number: n, title: `PR ${n}`, body: '', headRefName: 'h', baseRefName: 'main',
  url: `u${n}`, author: { login }, createdAt: `2026-01-0${n}T00:00:00Z`, statusCheckRollup: []
})
```

Then add:

```ts
describe('buildView isMine', () => {
  it('marks every PR mine when viewerLogin is absent', () => {
    const { groups } = buildView([{ repo: alphaRepo, prs: [mkPr(1, 'a')] }], {}, COMPANIES)
    expect(groups[0]!.prs[0]!.isMine).toBe(true)
  })

  it('tags ownership by viewerLogin (case-insensitive) when present', () => {
    const { groups } = buildView(
      [{ repo: alphaRepo, prs: [mkPrBy(1, 'Octocat'), mkPrBy(2, 'teammate')], viewerLogin: 'octocat' }],
      {},
      COMPANIES
    )
    const byNum = Object.fromEntries(groups[0]!.prs.map((p) => [p.number, p.isMine]))
    expect(byNum[1]).toBe(true)
    expect(byNum[2]).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/view.test.ts -t isMine`
Expected: FAIL — `isMine` is `undefined` on `PrView`.

- [ ] **Step 3: Add `isMine` to `PrView`**

In `src/shared/types.ts`, inside `interface PrView`, add after `author: string`:

```ts
  /** True when the signed-in user authored this PR. Always true unless the
   *  "show all authors" toggle surfaced a teammate's PR. */
  isMine: boolean
```

- [ ] **Step 4: Compute `isMine` in `buildView`**

In `src/main/view.ts`, update the `results` parameter type and the loop.

Change the signature's first parameter type from
`results: Array<{ repo: RepoConfig; prs: RawPr[] }>` to:

```ts
  results: Array<{ repo: RepoConfig; prs: RawPr[]; viewerLogin?: string }>,
```

Inside the outer loop, change `for (const { repo, prs } of results) {` to:

```ts
  for (const { repo, prs, viewerLogin } of results) {
```

In the `view` object literal, add after `author: pr.author?.login ?? 'unknown',`:

```ts
        isMine: !viewerLogin || (pr.author?.login ?? '').toLowerCase() === viewerLogin.toLowerCase(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/view.test.ts`
Expected: PASS (existing buildView tests still pass — they pass no `viewerLogin`, so `isMine` is `true`).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/view.ts tests/view.test.ts
git commit -m "feat: tag PrView.isMine via viewerLogin in buildView"
```

---

### Task 4: Poller wiring

**Files:**
- Modify: `src/main/poller.ts`

**Interfaces:**
- Consumes: `loadConfig().showAllAuthors`, `listPrs(..., allAuthors)`, `viewerLogin`, `buildView` (viewerLogin-aware).
- Produces: no signature change to `pollOnce` — behavior only.

- [ ] **Step 1: Update imports**

In `src/main/poller.ts`, change the gh import to include `viewerLogin`:

```ts
import { listPrs, viewerLogin, defaultRunner, type GhRunner } from './gh'
```

- [ ] **Step 2: Thread the flag and resolve viewerLogin per repo**

Replace the `mapPool` block inside `pollOnce` with:

```ts
  const allAuthors = cfg.showAllAuthors
  const results = await mapPool(cfg.repos, 6, async (repo: RepoConfig) => {
    try {
      const prs = await listPrs(run, repo.owner, repo.repo, repo.account, allAuthors)
      // Only resolve the signed-in login when we need it to distinguish
      // teammates' PRs from the user's own. viewerLogin caches per account,
      // so this is ~one gh call per distinct account per cycle.
      const login = allAuthors ? await viewerLogin(run, repo.account) : undefined
      return { repo, prs, viewerLogin: login }
    } catch (e) {
      failures.push(`${repo.owner}/${repo.repo}: ${(e as Error).message}`)
      return { repo, prs: [] as Awaited<ReturnType<typeof listPrs>>, viewerLogin: undefined }
    }
  })
```

(The `buildView(results, state, cfg.companies)` call below is unchanged — the result entries now simply carry `viewerLogin`.)

- [ ] **Step 3: Verify the whole main-process suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — all tests green, no type errors. (No poller unit test exists in this repo; correctness of the wiring is covered by Tasks 2–3 plus typecheck, and the manual check in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/main/poller.ts
git commit -m "feat: poll all-authors PRs and resolve ownership when toggle is on"
```

---

### Task 5: IPC + preload + renderer typings

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/global.d.ts`

**Interfaces:**
- Produces:
  - IPC `prw:get-settings` → `{ showAllAuthors: boolean }`
  - IPC `prw:set-show-all` `(value: boolean)` → `ActionResult`
  - `window.prwidget.getSettings(): Promise<{ showAllAuthors: boolean }>`
  - `window.prwidget.setShowAllAuthors(value: boolean): Promise<ActionResult>`

- [ ] **Step 1: Add IPC handlers**

In `src/main/ipc.ts`, update the config import to include `setShowAllAuthors`:

```ts
import { loadConfig, addCompany, addRepo, removeCompany, removeRepo, setShowAllAuthors } from './config'
```

Add these two handlers inside `registerIpc`, after the `prw:repos` handler:

```ts
  // Read global settings (currently just the mine-vs-everyone author scope).
  ipcMain.handle('prw:get-settings', async (): Promise<{ showAllAuthors: boolean }> => {
    try {
      return { showAllAuthors: loadConfig().showAllAuthors }
    } catch {
      return { showAllAuthors: false }
    }
  })

  // Flip the global author-scope flag, then repoll so the list updates.
  ipcMain.handle('prw:set-show-all', async (_e, value: boolean): Promise<ActionResult> => {
    try {
      setShowAllAuthors(value)
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
```

- [ ] **Step 2: Expose them in preload**

In `src/preload/index.ts`, add inside the `exposeInMainWorld('prwidget', { ... })` object (after `getRepos`):

```ts
  getSettings: (): Promise<{ showAllAuthors: boolean }> => ipcRenderer.invoke('prw:get-settings'),
  setShowAllAuthors: (value: boolean): Promise<ActionResult> => ipcRenderer.invoke('prw:set-show-all', value)
```

(Add a trailing comma to the previous `getRepos` line so the object stays valid.)

- [ ] **Step 3: Update renderer typings**

In `src/renderer/global.d.ts`, add inside the `prwidget:` interface (after `getRepos`):

```ts
      getSettings: () => Promise<{ showAllAuthors: boolean }>
      setShowAllAuthors: (value: boolean) => Promise<ActionResult>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/global.d.ts
git commit -m "feat: IPC + preload for reading/setting showAllAuthors"
```

---

### Task 6: Titlebar `Mine | All` toggle

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `window.prwidget.getSettings()`, `window.prwidget.setShowAllAuthors(value)`.

- [ ] **Step 1: Add state + load in App**

In `src/renderer/App.tsx`, add a state hook alongside the others (after `const [companyName, setCompanyName] = useState('')`):

```ts
  const [showAll, setShowAll] = useState(false)
```

In the mount `useEffect`, after `loadRepos()`, add:

```ts
    void window.prwidget.getSettings().then((s) => setShowAll(s.showAllAuthors))
```

Add a handler above the `return` (after `submitCompany`):

```ts
  const setAuthorScope = (value: boolean) => {
    setShowAll(value) // optimistic; the ensuing refresh repopulates the list
    void window.prwidget.setShowAllAuthors(value)
  }
```

- [ ] **Step 2: Render the toggle in the titlebar**

In `src/renderer/App.tsx`, replace the `titlebar-actions` block with the `mode-toggle` added before the refresh button:

```tsx
        <div className="titlebar-actions">
          <div className="mode-toggle" role="group" aria-label="PR author scope">
            <button
              className={showAll ? 'seg' : 'seg active'}
              title="Show only my PRs"
              onClick={() => setAuthorScope(false)}
            >
              Mine
            </button>
            <button
              className={showAll ? 'seg active' : 'seg'}
              title="Show everyone's PRs"
              onClick={() => setAuthorScope(true)}
            >
              All
            </button>
          </div>
          <button className="icon-btn" title="Refresh" onClick={() => window.prwidget.refresh()}>⟳</button>
          <button className="icon-btn" title="Hide" onClick={() => window.prwidget.hide()}>✕</button>
        </div>
```

- [ ] **Step 3: Style the toggle**

Append to `src/renderer/styles.css`:

```css
/* Mine | All author-scope toggle in the titlebar */
.mode-toggle {
  display: flex;
  gap: 1px;
  padding: 1px;
  border-radius: 7px;
  background: var(--chip);
  -webkit-app-region: no-drag;
}
.mode-toggle .seg {
  border: none;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.mode-toggle .seg:hover { color: var(--text); }
.mode-toggle .seg.active { background: var(--accent); color: #fff; }
```

- [ ] **Step 4: Build to verify the renderer compiles**

Run: `npm run build`
Expected: PASS — electron-vite builds main, preload, and renderer with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: Mine|All author-scope toggle in titlebar"
```

---

### Task 7: Read-only teammate PRs in `PrCard`

**Files:**
- Modify: `src/renderer/components/PrCard.tsx`

**Interfaces:**
- Consumes: `pr.isMine: boolean`.

- [ ] **Step 1: Gate the action controls**

In `src/renderer/components/PrCard.tsx`, gate both the Fix button and the actions row on `pr.isMine`.

Change the fix button's render condition from `{needsFix && (` to:

```tsx
      {pr.isMine && needsFix && (
```

Wrap the `.card-actions` block so it only renders for your own PRs:

```tsx
      {pr.isMine && (
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button disabled={busy} onClick={() => setPending('merge')}>Merge</button>
          <button disabled={busy} className="danger" onClick={() => setPending('discard')}>Discard</button>
        </div>
      )}
```

(The confirm-dialog blocks below can stay as-is; they only mount when `pending` is set, which is now unreachable for teammates' PRs since the buttons that set it are gone.)

- [ ] **Step 2: Build to verify the renderer compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual verification (whole feature)**

Run: `npm run dev`

Verify:
1. Titlebar shows `Mine | All`, defaulting to **Mine** highlighted.
2. **Mine** view matches today (only your PRs; Merge/Discard/Fix present).
3. Click **All** → the list refreshes and teammates' open PRs appear.
4. Teammates' cards have **no** Merge/Discard/Fix buttons; they still open the detail window and link to GitHub. Your own cards keep all actions.
5. Each company's "Completed" dropdown is unchanged (still only your merged PRs).
6. Toggle back to **Mine**; re-open the app — it reopens on the last-saved scope (`~/.pr-widget/config.json` shows `"showAllAuthors": <value>`).

- [ ] **Step 4: Final full check + commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all PASS.

```bash
git add src/renderer/components/PrCard.tsx
git commit -m "feat: hide merge/discard/fix on teammates' PRs (read-only)"
```

---

## Self-Review

**Spec coverage:**
- Persistence & config → Task 1. ✓
- `listPrs` author scope + `viewerLogin` → Task 2. ✓
- `PrView.isMine` + `buildView` ownership → Task 3. ✓
- Poller wiring (flag + per-repo viewerLogin) → Task 4. ✓
- IPC `get-settings`/`set-show-all` + preload + typings → Task 5. ✓
- Titlebar `Mine | All` toggle → Task 6. ✓
- Read-only teammate cards (`PrCard`) → Task 7. ✓
- Non-goals (Completed untouched, no per-repo scope) → honored; `listMergedPrs` never modified. ✓
- `PrDetail` has no action buttons → no gating needed (confirmed during design). ✓

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `showAllAuthors: boolean` (Task 1) matches its reads in Tasks 4/5; `allAuthors` param (Task 2) matches the call in Task 4; `viewerLogin(run, account)` signature (Task 2) matches Task 4's call and Task 3's result-entry `viewerLogin?: string`; `isMine` (Task 3) matches Task 7's `pr.isMine` and the preload/`global.d.ts` `getSettings`/`setShowAllAuthors` shapes align across Tasks 5–6.
