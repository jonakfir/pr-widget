import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig, addCompany, addRepo, removeCompany, removeRepo } from '../src/main/config'

function writeConfig(obj: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'prw-'))
  const p = join(dir, 'config.json')
  writeFileSync(p, JSON.stringify(obj))
  return p
}

describe('loadConfig', () => {
  it('parses a valid config', () => {
    const p = writeConfig({
      pollIntervalMinutes: 3,
      repos: [{ owner: 'octocat', repo: 'hello-world', company: 'Company A' }]
    })
    const cfg = loadConfig(p)
    expect(cfg.pollIntervalMinutes).toBe(3)
    expect(cfg.repos[0]).toEqual({ owner: 'octocat', repo: 'hello-world', company: 'Company A' })
  })

  it('keeps an optional account field', () => {
    const p = writeConfig({
      pollIntervalMinutes: 5,
      repos: [{ owner: 'x', repo: 'y', company: 'Company B', account: 'work' }]
    })
    expect(loadConfig(p).repos[0]!.account).toBe('work')
  })

  it('derives the company list from repos when absent', () => {
    const p = writeConfig({
      pollIntervalMinutes: 1,
      repos: [{ owner: 'x', repo: 'y', company: 'Acme' }]
    })
    // Defaults are empty, so the derived list is exactly the repo's company.
    expect(loadConfig(p).companies).toEqual(['Acme'])
  })

  it('uses an explicit companies array in order, augmented with repo companies', () => {
    const p = writeConfig({
      pollIntervalMinutes: 1,
      companies: ['Alpha', 'Beta'],
      repos: [{ owner: 'x', repo: 'y', company: 'Gamma' }]
    })
    expect(loadConfig(p).companies).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('rejects a repo missing owner/repo/company', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, repos: [{ owner: 'x', repo: 'y' }] })
    expect(() => loadConfig(p)).toThrow(/company/i)
  })

  it('rejects malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prw-'))
    const p = join(dir, 'config.json')
    writeFileSync(p, '{ not json')
    expect(() => loadConfig(p)).toThrow()
  })

  it('throws a clear error when the file is missing', () => {
    expect(() => loadConfig('/no/such/config.json')).toThrow(/not found|no such/i)
  })
})

describe('addCompany', () => {
  it('appends a new company and persists it', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, companies: ['Alpha'], repos: [] })
    addCompany('Beta', p)
    expect(loadConfig(p).companies).toEqual(['Alpha', 'Beta'])
    expect(JSON.parse(readFileSync(p, 'utf8')).companies).toContain('Beta')
  })

  it('rejects a case-insensitive duplicate', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, companies: ['Alpha'], repos: [] })
    expect(() => addCompany('alpha', p)).toThrow(/already exists/i)
  })

  it('rejects an empty name', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, companies: ['Alpha'], repos: [] })
    expect(() => addCompany('   ', p)).toThrow(/required/i)
  })
})

describe('addRepo', () => {
  it('appends a repo under an existing company', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, companies: ['Alpha'], repos: [] })
    addRepo({ company: 'Alpha', owner: 'o', repo: 'r', account: 'work' }, p)
    const repos = loadConfig(p).repos
    expect(repos).toHaveLength(1)
    expect(repos[0]).toEqual({ company: 'Alpha', owner: 'o', repo: 'r', account: 'work' })
  })

  it('rejects an unknown company', () => {
    const p = writeConfig({ pollIntervalMinutes: 1, companies: ['Alpha'], repos: [] })
    expect(() => addRepo({ company: 'Nope', owner: 'o', repo: 'r' }, p)).toThrow(/unknown company/i)
  })

  it('rejects a duplicate repo', () => {
    const p = writeConfig({
      pollIntervalMinutes: 1,
      companies: ['Alpha'],
      repos: [{ company: 'Alpha', owner: 'o', repo: 'r' }]
    })
    expect(() => addRepo({ company: 'Alpha', owner: 'o', repo: 'r' }, p)).toThrow(/already added/i)
  })
})

describe('removeCompany', () => {
  it('removes the company and all its repos, leaving others intact', () => {
    const p = writeConfig({
      pollIntervalMinutes: 1,
      companies: ['Alpha', 'Beta'],
      repos: [
        { company: 'Alpha', owner: 'o', repo: 'a' },
        { company: 'Beta', owner: 'o', repo: 'b' }
      ]
    })
    const cfg = removeCompany('Alpha', p)
    expect(cfg.companies).toEqual(['Beta'])
    expect(cfg.repos.map((r) => r.repo)).toEqual(['b'])
    // persisted
    expect(loadConfig(p).companies).toEqual(['Beta'])
  })
})

describe('removeRepo', () => {
  it('removes only the named repo, keeping the company', () => {
    const p = writeConfig({
      pollIntervalMinutes: 1,
      companies: ['Alpha'],
      repos: [
        { company: 'Alpha', owner: 'o', repo: 'a' },
        { company: 'Alpha', owner: 'o', repo: 'b' }
      ]
    })
    const cfg = removeRepo('o', 'a', p)
    expect(cfg.repos.map((r) => r.repo)).toEqual(['b'])
    expect(cfg.companies).toEqual(['Alpha'])
  })
})
