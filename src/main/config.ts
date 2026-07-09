import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { z } from 'zod'
import { DEFAULT_COMPANIES, type AppConfig } from '../shared/types'

const RepoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  company: z.string().min(1),
  account: z.string().min(1).optional()
})

const ConfigSchema = z.object({
  pollIntervalMinutes: z.number().positive().default(0.5),
  companies: z.array(z.string().min(1)).optional(),
  repos: z.array(RepoSchema)
})

export function defaultConfigPath(): string {
  return join(homedir(), '.pr-widget', 'config.json')
}

// Effective, ordered tab list: the explicit `companies` array if present
// (else the default seed), always augmented with any company a repo references
// so a configured repo can never be orphaned without a tab.
function effectiveCompanies(companies: string[] | undefined, repos: { company: string }[]): string[] {
  const out: string[] = companies ? [...companies] : [...DEFAULT_COMPANIES]
  for (const r of repos) if (!out.includes(r.company)) out.push(r.company)
  return out
}

export function loadConfig(path: string = defaultConfigPath()): AppConfig {
  if (!existsSync(path)) {
    throw new Error(`Config not found at ${path} — create it with { pollIntervalMinutes, companies, repos }`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`Config at ${path} is not valid JSON: ${(e as Error).message}`)
  }
  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid config: ${msg}`)
  }
  const d = parsed.data
  return {
    pollIntervalMinutes: d.pollIntervalMinutes,
    companies: effectiveCompanies(d.companies, d.repos),
    repos: d.repos
  }
}

export function saveConfig(cfg: AppConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2))
}

// Add a new empty company (tab). Case-insensitive duplicate check.
export function addCompany(name: string, path: string = defaultConfigPath()): AppConfig {
  const clean = name.trim()
  if (!clean) throw new Error('Company name is required')
  const cfg = loadConfig(path)
  if (cfg.companies.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`Company "${clean}" already exists`)
  }
  cfg.companies.push(clean)
  saveConfig(cfg, path)
  return cfg
}

// Add a repo under an existing company. Rejects unknown company and duplicates.
export function addRepo(
  entry: { company: string; owner: string; repo: string; account?: string },
  path: string = defaultConfigPath()
): AppConfig {
  const cfg = loadConfig(path)
  if (!cfg.companies.includes(entry.company)) throw new Error(`Unknown company "${entry.company}"`)
  if (cfg.repos.some((r) => r.owner === entry.owner && r.repo === entry.repo)) {
    throw new Error(`${entry.owner}/${entry.repo} is already added`)
  }
  cfg.repos.push(entry)
  saveConfig(cfg, path)
  return cfg
}

// Remove a company (tab) and every repo under it. No-op if it doesn't exist.
export function removeCompany(name: string, path: string = defaultConfigPath()): AppConfig {
  const cfg = loadConfig(path)
  cfg.companies = cfg.companies.filter((c) => c !== name)
  cfg.repos = cfg.repos.filter((r) => r.company !== name)
  saveConfig(cfg, path)
  return cfg
}

// Remove a single repo by owner/repo. No-op if it isn't configured.
export function removeRepo(owner: string, repo: string, path: string = defaultConfigPath()): AppConfig {
  const cfg = loadConfig(path)
  cfg.repos = cfg.repos.filter((r) => !(r.owner === owner && r.repo === repo))
  saveConfig(cfg, path)
  return cfg
}
