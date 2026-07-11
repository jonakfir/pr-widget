import { describe, it, expect } from 'vitest'
import { buildView } from '../src/main/view'
import type { RawPr } from '../src/main/gh'
import type { RepoConfig } from '../src/shared/types'

const mkPr = (n: number, created: string): RawPr => ({
  number: n, title: `PR ${n}`, body: '', headRefName: 'h', baseRefName: 'main',
  url: `u${n}`, author: { login: 'me' }, createdAt: created, statusCheckRollup: []
})

const mkPrBy = (n: number, login: string): RawPr => ({
  number: n, title: `PR ${n}`, body: '', headRefName: 'h', baseRefName: 'main',
  url: `u${n}`, author: { login }, createdAt: `2026-01-0${n}T00:00:00Z`, statusCheckRollup: []
})

const alphaRepo: RepoConfig = { owner: 'o', repo: 'r', company: 'Alpha' }
const COMPANIES = ['Alpha', 'Beta', 'Gamma', 'Delta']

describe('buildView', () => {
  it('emits one group per company in the given order', () => {
    const { groups } = buildView([{ repo: alphaRepo, prs: [mkPr(1, '2026-01-01T00:00:00Z')] }], {}, COMPANIES)
    expect(groups.map((g) => g.company)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
    expect(groups[0]!.prs).toHaveLength(1)
    expect(groups[1]!.prs).toHaveLength(0)
  })

  it('adds a group for a repo company missing from the list (never orphans PRs)', () => {
    const acme: RepoConfig = { owner: 'a', repo: 'b', company: 'Acme' }
    const { groups } = buildView([{ repo: acme, prs: [mkPr(9, 'z')] }], {}, COMPANIES)
    const acmeGroup = groups.find((g) => g.company === 'Acme')
    expect(acmeGroup?.prs.map((p) => p.number)).toEqual([9])
  })

  it('excludes dismissed PRs but still reports them in openKeys', () => {
    const state = { 'o/r#1': { dismissed: true, dismissedAt: 'x' } }
    const { groups, openKeys, undismissedCount } = buildView(
      [{ repo: alphaRepo, prs: [mkPr(1, 'a'), mkPr(2, 'b')] }],
      state,
      COMPANIES
    )
    expect(groups[0]!.prs.map((p) => p.number)).toEqual([2])
    expect(openKeys.sort()).toEqual(['o/r#1', 'o/r#2'])
    expect(undismissedCount).toBe(1)
  })

  it('sorts newest-first within a group', () => {
    const { groups } = buildView(
      [{ repo: alphaRepo, prs: [mkPr(1, '2026-01-01T00:00:00Z'), mkPr(2, '2026-02-01T00:00:00Z')] }],
      {},
      COMPANIES
    )
    expect(groups[0]!.prs.map((p) => p.number)).toEqual([2, 1])
  })
})

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
