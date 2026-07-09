import React, { useEffect, useMemo, useState } from 'react'
import type { Company, CompanyGroup, RepoConfig } from '../shared/types'
import { CompanySection } from './components/CompanySection'
import { CompletedSection } from './components/CompletedSection'
import { TabManage } from './components/TabManage'

export default function App() {
  const [groups, setGroups] = useState<CompanyGroup[]>([])
  const [repos, setRepos] = useState<RepoConfig[]>([])
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<Company | null>(null)
  const [addingCompany, setAddingCompany] = useState(false)
  const [companyName, setCompanyName] = useState('')

  useEffect(() => {
    const loadRepos = () => { void window.prwidget.getRepos().then(setRepos) }
    window.prwidget.onData((g) => { setGroups(g); setError(null); loadRepos() })
    window.prwidget.onError((m) => setError(m))
    window.prwidget.refresh()
    loadRepos()
  }, [])

  // Default the active tab to the first company with open PRs (fall back to first company).
  // Preserve the user's current selection across refreshes when it still exists.
  useEffect(() => {
    if (groups.length === 0) { setActive(null); return }
    setActive((prev) => {
      if (prev && groups.some((g) => g.company === prev)) return prev
      const firstWithPrs = groups.find((g) => g.prs.length > 0) ?? groups[0]
      return firstWithPrs ? firstWithPrs.company : null
    })
  }, [groups])

  const activeGroup = useMemo(
    () => groups.find((g) => g.company === active) ?? null,
    [groups, active]
  )
  const activeRepos = useMemo(
    () => repos.filter((r) => r.company === active),
    [repos, active]
  )

  const cancelAddCompany = () => { setAddingCompany(false); setCompanyName('') }

  const submitCompany = async () => {
    const name = companyName.trim()
    if (!name) return
    const res = await window.prwidget.addCompany(name)
    if (res.ok) { setCompanyName(''); setAddingCompany(false); setActive(name) }
    else alert(res.error ?? 'Failed to add company')
  }

  return (
    <div className="app">
      <header className="titlebar">
        <div className="titlebar-title">
          <span className="dot" title="Live — auto-refreshing" />
        </div>
        <div className="titlebar-actions">
          <button className="icon-btn" title="Refresh" onClick={() => window.prwidget.refresh()}>⟳</button>
          <button className="icon-btn" title="Hide" onClick={() => window.prwidget.hide()}>✕</button>
        </div>
      </header>

      <nav className="tabs">
        {groups.map((g) => (
          <button
            key={g.company}
            className={g.company === active ? 'tab active' : 'tab'}
            onClick={() => setActive(g.company)}
          >
            {g.company}
            {g.prs.length > 0 && <span className="tab-badge">{g.prs.length}</span>}
          </button>
        ))}
        {addingCompany ? (
          <input
            className="tab-add-input"
            autoFocus
            placeholder="New company"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCompany()
              if (e.key === 'Escape') cancelAddCompany()
            }}
            onBlur={() => { if (!companyName.trim()) cancelAddCompany() }}
          />
        ) : (
          <button className="tab-add" title="Add company" onClick={() => setAddingCompany(true)}>+</button>
        )}
      </nav>

      <div className="scroll">
        {error && <div className="banner">{error}</div>}
        {activeGroup && <CompanySection group={activeGroup} hideHeader />}
        {active && <CompletedSection key={active} company={active} />}
        {active && <TabManage key={`manage-${active}`} company={active} repos={activeRepos} />}
      </div>
    </div>
  )
}
