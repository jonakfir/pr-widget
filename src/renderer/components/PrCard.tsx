import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { PrView, ActionResult } from '../../shared/types'
import { CiStatusBadge } from './CiStatusBadge'
import { ConfirmDialog } from './ConfirmDialog'
import { timeAgo, fullDate } from '../lib/format'

type Pending = null | 'merge' | 'discard' | 'fix'

export function PrCard({ pr }: { pr: PrView }) {
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  // Only offer a Claude fix when checks actually FAILED (red ✗). `none` just
  // means the repo has no CI configured — nothing to fix.
  const needsFix = pr.ciStatus === 'failing'

  const ciWarn =
    pr.ciStatus === 'failing' ? 'Checks are failing. ' :
    pr.ciStatus === 'pending' ? 'Checks are still running. ' : ''

  const run = async (fn: () => Promise<ActionResult>, successMsg?: string) => {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) alert(r.error ?? 'Action failed')
      else if (successMsg) alert(successMsg)
    } catch (e) {
      alert((e as Error).message ?? 'Action failed')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div
      className="card"
      onClick={() => window.prwidget.openDetail(pr)}
      title="Open in a window"
    >
      <div className="card-head">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="card-title"
          onClick={(e) => e.stopPropagation()}
        >
          #{pr.number} {pr.title}
        </a>
        <CiStatusBadge status={pr.ciStatus} />
      </div>
      <div className="card-meta">
        {pr.headRefName} → {pr.baseRefName} · @{pr.author} · <span title={fullDate(pr.createdAt)}>{timeAgo(pr.createdAt)}</span>
      </div>
      <div className="card-body"><ReactMarkdown>{pr.body || '_No description_'}</ReactMarkdown></div>

      {pr.isMine && needsFix && (
        <button className="fix-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); setPending('fix') }}>
          ✦ Fix with Claude
        </button>
      )}
      {pr.isMine && (
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button disabled={busy} onClick={() => setPending('merge')}>Merge</button>
          <button disabled={busy} className="danger" onClick={() => setPending('discard')}>Discard</button>
        </div>
      )}

      {pending === 'merge' && (
        <ConfirmDialog
          message={`Merge PR #${pr.number} into ${pr.baseRefName}?`}
          detail={`${ciWarn}This squash-merges the PR.`}
          confirmLabel="Merge"
          onCancel={() => setPending(null)}
          onConfirm={() => run(() => window.prwidget.merge(pr.key))}
        />
      )}
      {pending === 'discard' && (
        <ConfirmDialog
          message={`Discard PR #${pr.number}?`}
          detail="Closes the PR without merging. The branch is left intact."
          confirmLabel="Discard"
          onCancel={() => setPending(null)}
          onConfirm={() => run(() => window.prwidget.discard(pr.key))}
        />
      )}
      {pending === 'fix' && (
        <ConfirmDialog
          message={`Hand PR #${pr.number} to Claude?`}
          detail="Claude checks out this branch, fixes the failing checks, and pushes an update to the PR automatically."
          confirmLabel="Fix with Claude"
          onCancel={() => setPending(null)}
          onConfirm={() =>
            run(
              () => window.prwidget.fix(pr.key),
              `Claude is now working on #${pr.number}. It will push an update to the branch when done — watch the checks refresh.`
            )
          }
        />
      )}
    </div>
  )
}
