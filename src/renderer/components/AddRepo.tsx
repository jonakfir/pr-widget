import React, { useState } from 'react'
import type { Company } from '../../shared/types'

// "+ Add repo" affordance at the bottom of a company tab. Paste a GitHub repo
// URL; the main process resolves which signed-in account can see it.
export function AddRepo({ company }: { company: Company }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => { setOpen(false); setUrl(''); setError(null) }

  const submit = async () => {
    const value = url.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    const res = await window.prwidget.addRepo(company, value)
    setBusy(false)
    if (res.ok) reset()
    else setError(res.error ?? 'Failed to add repo')
  }

  if (!open) {
    return <button className="add-repo-toggle" onClick={() => setOpen(true)}>+ Add repo</button>
  }

  return (
    <div className="add-repo">
      <input
        className="add-input"
        autoFocus
        placeholder="Paste a GitHub repo URL…"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') reset()
        }}
      />
      <div className="add-row">
        <button disabled={busy || !url.trim()} onClick={() => void submit()}>{busy ? 'Adding…' : 'Add'}</button>
        <button className="ghost" disabled={busy} onClick={reset}>Cancel</button>
      </div>
      {error && <div className="add-error">{error}</div>}
    </div>
  )
}
