// src/main/ipc.ts
import { ipcMain } from 'electron'
import { loadConfig, addCompany, addRepo, removeCompany, removeRepo } from './config'
import { loadState, saveState, markDismissed, prKey } from './state'
import { mergePr, closePr, listMergedPrs, listAccounts, repoAccessible, defaultRunner } from './gh'
import { spawnFix } from './fix'
import type { ActionResult, MergedResult, MergedRepoGroup, RepoConfig } from '../shared/types'

// Accepts https://github.com/owner/repo(.git), git@github.com:owner/repo(.git),
// or a bare owner/repo. Returns null if it isn't a recognizable GitHub repo ref.
function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const s = input.trim()
  let m = s.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/)
  if (m?.[1] && m[2]) return { owner: m[1], repo: m[2] }
  m = s.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+?)(?:\.git)?(?:[/#?].*)?$/i)
  if (m?.[1] && m[2]) return { owner: m[1], repo: m[2] }
  m = s.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/)
  if (m?.[1] && m[2]) return { owner: m[1], repo: m[2] }
  return null
}

function resolveRepo(key: string) {
  // key = `${owner}/${repo}#${number}`
  const [path, numStr] = key.split('#')
  if (path === undefined || numStr === undefined) throw new Error(`malformed PR key: ${key}`)
  const [owner, repo] = path.split('/')
  if (owner === undefined || repo === undefined) throw new Error(`malformed PR key: ${key}`)
  const number = Number(numStr)
  const cfg = loadConfig()
  const entry = cfg.repos.find((r) => r.owner === owner && r.repo === repo)
  if (!entry) throw new Error(`No configured repo for ${owner}/${repo} (key ${key})`)
  return { owner, repo, number, account: entry.account }
}

export function registerIpc(triggerRefresh: () => void): void {
  ipcMain.on('prw:refresh', () => triggerRefresh())

  ipcMain.handle('prw:complete', async (_e, key: string): Promise<ActionResult> => {
    try {
      const state = markDismissed(loadState(), key, new Date().toISOString())
      saveState(state)
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('prw:merge', async (_e, key: string): Promise<ActionResult> => {
    try {
      const { owner, repo, number, account } = resolveRepo(key)
      await mergePr(defaultRunner, owner, repo, number, account)
      saveState(markDismissed(loadState(), prKey(owner, repo, number), new Date().toISOString()))
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('prw:discard', async (_e, key: string): Promise<ActionResult> => {
    try {
      const { owner, repo, number, account } = resolveRepo(key)
      await closePr(defaultRunner, owner, repo, number, account)
      saveState(markDismissed(loadState(), prKey(owner, repo, number), new Date().toISOString()))
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Hand the PR to a detached, headless Claude run that fixes the failing
  // checks and pushes an update. Fire-and-forget — returns once the job spawns.
  ipcMain.handle('prw:fix', async (_e, key: string): Promise<ActionResult> => {
    try {
      const { owner, repo, number, account } = resolveRepo(key)
      spawnFix(owner, repo, number, account)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Add a new company (empty tab).
  ipcMain.handle('prw:add-company', async (_e, name: string): Promise<ActionResult> => {
    try {
      addCompany(name)
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Add a repo under a company from a pasted GitHub URL. Auto-detects which
  // authenticated gh account can see it (so private repos across accounts work).
  ipcMain.handle('prw:add-repo', async (_e, company: string, url: string): Promise<ActionResult> => {
    try {
      const parsed = parseRepoUrl(url)
      if (!parsed) return { ok: false, error: 'Not a GitHub repo URL — expected github.com/owner/repo' }
      const { owner, repo } = parsed
      const accounts = await listAccounts(defaultRunner)
      let account: string | undefined
      let accessible = false
      for (const a of accounts) {
        if (await repoAccessible(defaultRunner, owner, repo, a)) {
          account = a
          accessible = true
          break
        }
      }
      if (!accessible && accounts.length === 0) {
        accessible = await repoAccessible(defaultRunner, owner, repo) // active/unnamed account
      }
      if (!accessible) {
        return { ok: false, error: `No signed-in GitHub account can access ${owner}/${repo}` }
      }
      addRepo({ company, owner, repo, account })
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // The currently-configured repos (so the UI can manage/remove them, even
  // repos that have no open PRs and thus never appear in the poll view).
  ipcMain.handle('prw:repos', async (): Promise<RepoConfig[]> => {
    try {
      return loadConfig().repos
    } catch {
      return []
    }
  })

  // Remove a company (tab) and all its repos.
  ipcMain.handle('prw:remove-company', async (_e, name: string): Promise<ActionResult> => {
    try {
      removeCompany(name)
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Remove a single repo by owner/repo.
  ipcMain.handle('prw:remove-repo', async (_e, owner: string, repo: string): Promise<ActionResult> => {
    try {
      removeRepo(owner, repo)
      triggerRefresh()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Lazily load a company's recently-merged PRs for its Completed dropdown.
  // Per-repo failures are isolated so one bad repo yields an empty list.
  ipcMain.handle('prw:merged', async (_e, company: string): Promise<MergedResult> => {
    try {
      const repos = loadConfig().repos.filter((r) => r.company === company)
      const settled = await Promise.all(
        repos.map(async (r): Promise<MergedRepoGroup> => {
          try {
            const prs = await listMergedPrs(defaultRunner, r.owner, r.repo, r.account)
            return { repo: r.repo, prs }
          } catch {
            return { repo: r.repo, prs: [] }
          }
        })
      )
      const groups = settled
        .filter((g) => g.prs.length > 0)
        .sort((a, b) => (b.prs[0]?.mergedAt ?? '').localeCompare(a.prs[0]?.mergedAt ?? ''))
      return { ok: true, groups }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
}
