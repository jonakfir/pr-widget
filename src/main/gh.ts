import { execFile } from 'child_process'
import type { CiStatus } from '../shared/types'

export interface RawPr {
  number: number
  title: string
  body: string
  headRefName: string
  baseRefName: string
  url: string
  author: { login: string }
  createdAt: string
  statusCheckRollup:
    | Array<{ state?: string; status?: string; conclusion?: string }>
    | null
}

export type GhRunner = (
  args: string[],
  env?: NodeJS.ProcessEnv
) => Promise<{ stdout: string; stderr: string; code: number }>

export const defaultRunner: GhRunner = (args, env) =>
  new Promise((resolve) => {
    const options = {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 25_000, // fail a hung gh call fast so the poller can isolate it
      env: env ? { ...process.env, ...env } : process.env
    }
    execFile('gh', args, options, (err, stdout, stderr) => {
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code: err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0 })
    })
  })

const PR_FIELDS = 'number,title,body,headRefName,baseRefName,url,author,createdAt,statusCheckRollup'

export function deriveCiStatus(rollup: RawPr['statusCheckRollup']): CiStatus {
  if (!rollup || rollup.length === 0) return 'none'
  const classify = (c: { state?: string; status?: string; conclusion?: string }): CiStatus => {
    if (c.status && c.status !== 'COMPLETED') return 'pending'
    const outcome = (c.conclusion ?? c.state ?? '').toUpperCase()
    if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(outcome)) return 'passing'
    if (['PENDING', 'EXPECTED', ''].includes(outcome)) return 'pending'
    return 'failing'
  }
  const results = rollup.map(classify)
  if (results.includes('failing')) return 'failing'
  if (results.includes('pending')) return 'pending'
  return 'passing'
}

async function ok(run: GhRunner, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const r = await run(args, env)
  if (r.code !== 0) throw new Error(r.stderr.trim() || `gh ${args.join(' ')} failed (code ${r.code})`)
  return r.stdout
}

// Per-account token cache. We authenticate each call by injecting the account's
// token via GH_TOKEN rather than mutating the globally-active gh account with
// `gh auth switch` — switching is not concurrency-safe (parallel switches race
// on the keyring) and corrupts polling when many repos use a non-default account.
const tokenCache = new Map<string, string>()

async function envFor(run: GhRunner, account: string | undefined): Promise<NodeJS.ProcessEnv | undefined> {
  if (!account) return undefined
  let token = tokenCache.get(account)
  if (!token) {
    token = (await ok(run, ['auth', 'token', '--user', account])).trim()
    tokenCache.set(account, token)
  }
  return { GH_TOKEN: token }
}

// All logged-in gh account names (parsed from `gh auth status`, which may print
// to stdout or stderr depending on version).
export async function listAccounts(run: GhRunner): Promise<string[]> {
  const r = await run(['auth', 'status'])
  const names: string[] = []
  for (const m of `${r.stdout}\n${r.stderr}`.matchAll(/account\s+([A-Za-z0-9-]+)/g)) {
    const name = m[1]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

// Whether the given account (or the active one when undefined) can see the repo.
export async function repoAccessible(
  run: GhRunner,
  owner: string,
  repo: string,
  account?: string
): Promise<boolean> {
  const env = await envFor(run, account)
  const r = await run(['repo', 'view', `${owner}/${repo}`, '--json', 'name'], env)
  return r.code === 0
}

export async function listPrs(run: GhRunner, owner: string, repo: string, account: string | undefined): Promise<RawPr[]> {
  const env = await envFor(run, account)
  // `--author @me` scopes to PRs authored by the authenticated account, so
  // teammates' PRs never show.
  const out = await ok(run, ['pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'open', '--author', '@me', '--json', PR_FIELDS], env)
  return JSON.parse(out) as RawPr[]
}

export interface RawMergedPr {
  number: number
  title: string
  url: string
  mergedAt: string
}

// Recently-merged PRs authored by the authenticated account, newest first.
export async function listMergedPrs(
  run: GhRunner,
  owner: string,
  repo: string,
  account: string | undefined,
  limit = 15
): Promise<RawMergedPr[]> {
  const env = await envFor(run, account)
  const out = await ok(
    run,
    ['pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'merged', '--author', '@me', '--limit', String(limit), '--json', 'number,title,url,mergedAt'],
    env
  )
  return JSON.parse(out) as RawMergedPr[]
}

export async function mergePr(run: GhRunner, owner: string, repo: string, number: number, account: string | undefined): Promise<void> {
  const env = await envFor(run, account)
  await ok(run, ['pr', 'merge', String(number), '--repo', `${owner}/${repo}`, '--squash'], env)
}

export async function closePr(run: GhRunner, owner: string, repo: string, number: number, account: string | undefined): Promise<void> {
  const env = await envFor(run, account)
  await ok(run, ['pr', 'close', String(number), '--repo', `${owner}/${repo}`], env)
}
