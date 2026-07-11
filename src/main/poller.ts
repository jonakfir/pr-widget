// src/main/poller.ts
import { loadConfig } from './config'
import { loadState, saveState, pruneState } from './state'
import { listPrs, viewerLogin, defaultRunner, type GhRunner } from './gh'
import { buildView } from './view'
import type { CompanyGroup, RepoConfig } from '../shared/types'

export interface PollOutcome {
  groups: CompanyGroup[]
  undismissedCount: number
}

// Run `fn` over items with at most `limit` in flight at once. Preserves order.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const idx = next++
      out[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Runs one poll cycle: reads config, lists PRs per repo, prunes state, returns
 * the grouped view. Each repo is polled independently with bounded concurrency
 * so one repo that times out or is inaccessible yields an empty list for itself
 * instead of failing the whole cycle. Only when EVERY repo fails do we throw
 * (surfacing the error banner). State is pruned only on a fully-clean cycle, so
 * a transient failure never resurrects a dismissed PR.
 */
export async function pollOnce(run: GhRunner = defaultRunner): Promise<PollOutcome> {
  const cfg = loadConfig()
  const state = loadState()
  const failures: string[] = []
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
  if (cfg.repos.length > 0 && failures.length === cfg.repos.length) {
    throw new Error(failures[0] ?? 'all repositories failed to load')
  }
  const { groups, openKeys, undismissedCount } = buildView(results, state, cfg.companies)
  if (failures.length === 0) saveState(pruneState(state, openKeys))
  return { groups, undismissedCount }
}

export function pollIntervalMs(): number {
  try {
    return loadConfig().pollIntervalMinutes * 60_000
  } catch {
    return 3 * 60_000
  }
}
