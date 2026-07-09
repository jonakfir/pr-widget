import React, { useState } from 'react'
import type { Company, MergedRepoGroup } from '../../shared/types'
import { timeAgo, fullDate } from '../lib/format'

// Collapsible "Completed" dropdown shown under a company's open PRs.
// Lazily fetches that company's recently-merged PRs from GitHub on open,
// re-fetching each time it is opened so it stays current after a merge.
export function CompletedSection({ company }: { company: Company }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<MergedRepoGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next) return
    setLoading(true)
    setError(null)
    const res = await window.prwidget.getMerged(company)
    if (res.ok) setGroups(res.groups ?? [])
    else setError(res.error ?? 'Failed to load merged PRs')
    setLoading(false)
  }

  const total = groups?.reduce((n, g) => n + g.prs.length, 0) ?? 0

  return (
    <div className="completed">
      <button className="completed-toggle" onClick={toggle}>
        <span className={open ? 'chev open' : 'chev'}>▸</span>
        Completed{!loading && groups ? ` (${total})` : ''}
      </button>
      {open && (
        <div className="completed-body">
          {loading && <div className="completed-empty">Loading…</div>}
          {error && <div className="banner">{error}</div>}
          {!loading && !error && total === 0 && <div className="completed-empty">Nothing merged recently.</div>}
          {!loading &&
            groups?.map((g) =>
              g.prs.length === 0 ? null : (
                <div key={g.repo} className="completed-repo">
                  <div className="completed-repo-name">{g.repo}</div>
                  {g.prs.map((pr) => (
                    <a
                      key={pr.number}
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="completed-item"
                      title={`Merged ${fullDate(pr.mergedAt)}`}
                    >
                      <span className="completed-num">#{pr.number}</span>
                      <span className="completed-title">{pr.title}</span>
                      <span className="completed-when">{timeAgo(pr.mergedAt)}</span>
                    </a>
                  ))}
                </div>
              )
            )}
        </div>
      )}
    </div>
  )
}
