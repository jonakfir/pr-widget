import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { PrView } from '../../shared/types'
import { CiStatusBadge } from './CiStatusBadge'

// Rendered in the standalone detail window (renderer loaded with #detail).
// Receives its PR once from the main process after the window loads.
export function PrDetail() {
  const [pr, setPr] = useState<PrView | null>(null)

  useEffect(() => {
    window.prwidget.onDetailData((p) => {
      setPr(p)
      document.title = `#${p.number} · ${p.title}`
    })
  }, [])

  if (!pr) return <div className="detail detail-empty">Loading…</div>

  return (
    <div className="detail">
      <div className="detail-head">
        <a href={pr.url} target="_blank" rel="noreferrer" className="detail-title">
          #{pr.number} {pr.title}
        </a>
        <CiStatusBadge status={pr.ciStatus} />
      </div>
      <div className="detail-meta">
        {pr.headRefName} → {pr.baseRefName} · @{pr.author} ·{' '}
        {new Date(pr.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
      </div>
      <div className="detail-body">
        <ReactMarkdown>{pr.body || '_No description_'}</ReactMarkdown>
      </div>
    </div>
  )
}
