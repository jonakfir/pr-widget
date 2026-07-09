import React, { useState } from 'react'
import type { Company, RepoConfig, ActionResult } from '../../shared/types'
import { AddRepo } from './AddRepo'
import { ConfirmDialog } from './ConfirmDialog'

type Pending = null | { type: 'repo'; owner: string; repo: string } | { type: 'company' }

// Per-tab management footer: list the tab's configured repos (each removable,
// including repos with no open PRs), add a repo, or remove the whole company.
// Removals only stop the widget tracking them — nothing on GitHub is touched.
export function TabManage({ company, repos }: { company: Company; repos: RepoConfig[] }) {
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) alert(r.error ?? 'Failed')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <div className="manage">
      {repos.length > 0 && (
        <div className="manage-repos">
          {repos.map((r) => (
            <div className="manage-repo" key={`${r.owner}/${r.repo}`}>
              <span className="manage-repo-name">{r.owner}/{r.repo}</span>
              <button
                className="manage-x"
                title="Remove repo"
                disabled={busy}
                onClick={() => setPending({ type: 'repo', owner: r.owner, repo: r.repo })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <AddRepo company={company} />

      <button className="remove-company" disabled={busy} onClick={() => setPending({ type: 'company' })}>
        Remove “{company}” tab
      </button>

      {pending?.type === 'repo' && (
        <ConfirmDialog
          message={`Remove ${pending.owner}/${pending.repo}?`}
          detail="Stops tracking this repo in the widget. The repo on GitHub is untouched."
          confirmLabel="Remove"
          onCancel={() => setPending(null)}
          onConfirm={() => run(() => window.prwidget.removeRepo(pending.owner, pending.repo))}
        />
      )}
      {pending?.type === 'company' && (
        <ConfirmDialog
          message={`Remove the “${company}” tab?`}
          detail={`Removes the tab and its ${repos.length} repo${repos.length === 1 ? '' : 's'} from the widget. Nothing on GitHub is affected.`}
          confirmLabel="Remove"
          onCancel={() => setPending(null)}
          onConfirm={() => run(() => window.prwidget.removeCompany(company))}
        />
      )}
    </div>
  )
}
