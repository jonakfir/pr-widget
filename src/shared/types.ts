// Companies are user-defined tabs, stored in config. A fresh config starts
// empty — the user adds companies from the UI ("+" in the tab bar).
export type Company = string

export const DEFAULT_COMPANIES: readonly string[] = []

export interface RepoConfig {
  owner: string
  repo: string
  company: Company
  /** gh account to use for this repo; omitted = whatever is currently active */
  account?: string
}

export interface AppConfig {
  pollIntervalMinutes: number
  /** When true, list every author's open PRs per repo; when false (default), only the signed-in user's. */
  showAllAuthors: boolean
  /** Ordered tab list. Derived from repos + defaults when absent from the file. */
  companies: string[]
  repos: RepoConfig[]
}

export type CiStatus = 'passing' | 'failing' | 'pending' | 'none'

/** A PR flattened into the shape the renderer consumes. */
export interface PrView {
  key: string // `${owner}/${repo}#${number}`
  company: Company
  owner: string
  repo: string
  number: number
  title: string
  body: string
  headRefName: string
  baseRefName: string
  url: string
  author: string
  createdAt: string
  ciStatus: CiStatus
}

export interface CompanyGroup {
  company: Company
  prs: PrView[]
}

export interface DismissRecord {
  dismissed: boolean
  dismissedAt: string // ISO8601
}

export type StateMap = Record<string, DismissRecord>

/** Result surface for a merge/discard action. */
export interface ActionResult {
  ok: boolean
  error?: string
}

/** A merged PR shown in a company's Completed dropdown. */
export interface MergedPr {
  number: number
  title: string
  url: string
  mergedAt: string // ISO8601
}

export interface MergedRepoGroup {
  repo: string
  prs: MergedPr[]
}

/** Result surface for the lazy "load a company's merged PRs" request. */
export interface MergedResult {
  ok: boolean
  error?: string
  groups?: MergedRepoGroup[]
}
