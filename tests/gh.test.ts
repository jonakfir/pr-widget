import { describe, it, expect } from 'vitest'
import { deriveCiStatus, listPrs, listMergedPrs, mergePr, closePr, type GhRunner } from '../src/main/gh'

type Call = { args: string[]; env?: NodeJS.ProcessEnv }

function runnerFrom(map: Record<string, { stdout?: string; stderr?: string; code?: number }>): {
  run: GhRunner
  calls: Call[]
} {
  const calls: Call[] = []
  const run: GhRunner = async (args, env) => {
    calls.push({ args, env })
    const key = args.join(' ')
    const hit = Object.entries(map).find(([k]) => key.includes(k))
    const r = hit ? hit[1] : {}
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.code ?? 0 }
  }
  return { run, calls }
}

describe('deriveCiStatus', () => {
  it('none when empty', () => {
    expect(deriveCiStatus([])).toBe('none')
    expect(deriveCiStatus(null)).toBe('none')
  })
  it('failing when any check failed', () => {
    expect(deriveCiStatus([{ conclusion: 'SUCCESS', status: 'COMPLETED' }, { conclusion: 'FAILURE', status: 'COMPLETED' }])).toBe('failing')
  })
  it('pending when a check is still running', () => {
    expect(deriveCiStatus([{ status: 'IN_PROGRESS' }, { conclusion: 'SUCCESS', status: 'COMPLETED' }])).toBe('pending')
  })
  it('passing when all succeed', () => {
    expect(deriveCiStatus([{ conclusion: 'SUCCESS', status: 'COMPLETED' }, { state: 'SUCCESS' }])).toBe('passing')
  })
})

describe('token-based auth (no global account switch)', () => {
  it('never runs `auth switch` and passes no GH_TOKEN when account is undefined', async () => {
    const { run, calls } = runnerFrom({ 'pr list': { stdout: '[]' } })
    await listPrs(run, 'o', 'r', undefined)
    expect(calls.some((c) => c.args.join(' ').includes('auth switch'))).toBe(false)
    expect(calls.some((c) => c.args.join(' ').includes('auth token'))).toBe(false)
    const listCall = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'list')!
    expect(listCall.env).toBeUndefined()
  })

  it('fetches the account token and injects it as GH_TOKEN, without switching', async () => {
    const { run, calls } = runnerFrom({ 'auth token': { stdout: 'gho_ACCT_A\n' }, 'pr list': { stdout: '[]' } })
    await listPrs(run, 'o', 'r', 'acctA')
    const tokenCall = calls.find((c) => c.args.join(' ').includes('auth token'))!
    expect(tokenCall.args).toEqual(['auth', 'token', '--user', 'acctA'])
    expect(calls.some((c) => c.args.join(' ').includes('auth switch'))).toBe(false)
    const listCall = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'list')!
    expect(listCall.env?.GH_TOKEN).toBe('gho_ACCT_A')
  })

  it('caches the token per account (fetches once across multiple calls)', async () => {
    const { run, calls } = runnerFrom({ 'auth token': { stdout: 'gho_ACCT_CACHE\n' }, 'pr list': { stdout: '[]' } })
    await listPrs(run, 'o', 'r', 'acctCache')
    await listPrs(run, 'o2', 'r2', 'acctCache')
    const tokenCalls = calls.filter((c) => c.args.join(' ').includes('auth token'))
    expect(tokenCalls).toHaveLength(1)
  })
})

describe('listPrs / mergePr / closePr', () => {
  it('parses PR JSON', async () => {
    const prs = [{ number: 7, title: 'T', body: 'B', headRefName: 'h', baseRefName: 'main', url: 'u', author: { login: 'me' }, createdAt: 'c', statusCheckRollup: [] }]
    const { run, calls } = runnerFrom({ 'pr list': { stdout: JSON.stringify(prs) } })
    const out = await listPrs(run, 'o', 'r', undefined)
    expect(out[0]!.number).toBe(7)
    expect(out[0]!.baseRefName).toBe('main')
    // scoped to the authenticated user's own PRs only
    const list = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'list')!
    expect(list.args).toContain('--author')
    expect(list.args).toContain('@me')
  })

  it('mergePr uses --squash and injects the account token', async () => {
    const { run, calls } = runnerFrom({ 'auth token': { stdout: 'gho_MERGE\n' } })
    await mergePr(run, 'o', 'r', 7, 'acctMerge')
    const merge = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'merge')!
    expect(merge.args).toContain('--squash')
    expect(merge.args).toContain('7')
    expect(merge.env?.GH_TOKEN).toBe('gho_MERGE')
  })

  it('listMergedPrs queries merged state, own author, and parses', async () => {
    const merged = [{ number: 42, title: 'M', url: 'u', mergedAt: '2026-07-08T00:00:00Z' }]
    const { run, calls } = runnerFrom({ 'pr list': { stdout: JSON.stringify(merged) } })
    const out = await listMergedPrs(run, 'o', 'r', undefined, 15)
    expect(out[0]!.number).toBe(42)
    const list = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'list')!
    expect(list.args).toContain('--state')
    expect(list.args).toContain('merged')
    expect(list.args).toContain('--author')
    expect(list.args).toContain('@me')
  })

  it('closePr does not delete the branch', async () => {
    const { run, calls } = runnerFrom({})
    await closePr(run, 'o', 'r', 9, undefined)
    const close = calls.find((c) => c.args[0] === 'pr' && c.args[1] === 'close')!
    expect(close.args).toContain('9')
    expect(close.args.join(' ')).not.toContain('--delete-branch')
  })
})
