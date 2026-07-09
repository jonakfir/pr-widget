import React, { useState } from 'react'
import type { CompanyGroup, PrView } from '../../shared/types'
import { PrCard } from './PrCard'

interface RepoGroup { key: string; repo: string; prs: PrView[] }

// Group a company's PRs by repo, sorted by repo name. PRs stay in their
// incoming (newest-first) order within each repo.
function groupByRepo(prs: PrView[]): RepoGroup[] {
  const map = new Map<string, RepoGroup>()
  for (const pr of prs) {
    const key = `${pr.owner}/${pr.repo}`
    const existing = map.get(key)
    if (existing) existing.prs.push(pr)
    else map.set(key, { key, repo: pr.repo, prs: [pr] })
  }
  return [...map.values()].sort((a, b) => a.repo.localeCompare(b.repo))
}

export function CompanySection({ group, hideHeader = false }: { group: CompanyGroup; hideHeader?: boolean }) {
  const repos = groupByRepo(group.prs)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <section className="company">
      {!hideHeader && <h2>{group.company} <span className="count">{group.prs.length}</span></h2>}
      {group.prs.length === 0 && <p className="empty">No open PRs</p>}
      {repos.map(({ key, repo, prs }) => {
        const isCollapsed = collapsed.has(key)
        return (
          <div className="repo" key={key}>
            <button className="repo-head" onClick={() => toggle(key)}>
              <span className={isCollapsed ? 'chevron' : 'chevron open'}>▸</span>
              <span className="repo-name">{repo}</span>
              <span className="repo-count">{prs.length}</span>
            </button>
            {!isCollapsed && prs.map((pr) => <PrCard key={pr.key} pr={pr} />)}
          </div>
        )
      })}
    </section>
  )
}
