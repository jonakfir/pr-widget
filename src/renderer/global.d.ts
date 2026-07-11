import type { ActionResult, CompanyGroup, MergedResult, PrView, RepoConfig } from '../shared/types'

declare global {
  interface Window {
    prwidget: {
      onData: (cb: (groups: CompanyGroup[]) => void) => void
      onError: (cb: (message: string) => void) => void
      refresh: () => void
      hide: () => void
      complete: (key: string) => Promise<ActionResult>
      merge: (key: string) => Promise<ActionResult>
      discard: (key: string) => Promise<ActionResult>
      fix: (key: string) => Promise<ActionResult>
      openDetail: (pr: PrView) => void
      onDetailData: (cb: (pr: PrView) => void) => void
      getMerged: (company: string) => Promise<MergedResult>
      addCompany: (name: string) => Promise<ActionResult>
      addRepo: (company: string, url: string) => Promise<ActionResult>
      removeCompany: (name: string) => Promise<ActionResult>
      removeRepo: (owner: string, repo: string) => Promise<ActionResult>
      getRepos: () => Promise<RepoConfig[]>
      getSettings: () => Promise<{ showAllAuthors: boolean }>
      setShowAllAuthors: (value: boolean) => Promise<ActionResult>
    }
  }
}
export {}
