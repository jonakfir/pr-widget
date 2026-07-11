import { DEFAULT_COMPANIES, type CompanyGroup, type PrView, type RepoConfig, type StateMap } from '../shared/types'
import { deriveCiStatus, type RawPr } from './gh'
import { prKey } from './state'

export function buildView(
  results: Array<{ repo: RepoConfig; prs: RawPr[]; viewerLogin?: string }>,
  state: StateMap,
  companies: readonly string[] = DEFAULT_COMPANIES
): { groups: CompanyGroup[]; openKeys: string[]; undismissedCount: number } {
  // Emit a group per configured company, plus any company a result references
  // that isn't listed (defensive — keeps a repo's PRs from vanishing).
  const order: string[] = [...companies]
  for (const { repo } of results) if (!order.includes(repo.company)) order.push(repo.company)

  const byCompany = new Map<string, PrView[]>()
  for (const c of order) byCompany.set(c, [])
  const openKeys: string[] = []

  for (const { repo, prs, viewerLogin } of results) {
    for (const pr of prs) {
      const key = prKey(repo.owner, repo.repo, pr.number)
      openKeys.push(key)
      if (state[key]?.dismissed) continue
      const view: PrView = {
        key,
        company: repo.company,
        owner: repo.owner,
        repo: repo.repo,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        headRefName: pr.headRefName,
        baseRefName: pr.baseRefName,
        url: pr.url,
        author: pr.author?.login ?? 'unknown',
        isMine: !viewerLogin || (pr.author?.login ?? '').toLowerCase() === viewerLogin.toLowerCase(),
        createdAt: pr.createdAt,
        ciStatus: deriveCiStatus(pr.statusCheckRollup)
      }
      byCompany.get(repo.company)!.push(view)
    }
  }

  const groups: CompanyGroup[] = order.map((company) => ({
    company,
    prs: byCompany.get(company)!.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }))
  const undismissedCount = groups.reduce((n, g) => n + g.prs.length, 0)
  return { groups, openKeys, undismissedCount }
}
