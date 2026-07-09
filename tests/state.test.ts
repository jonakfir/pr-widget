import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { prKey, loadState, saveState, markDismissed, pruneState } from '../src/main/state'

describe('state', () => {
  it('builds a stable key', () => {
    expect(prKey('octocat', 'hello-world', 42)).toBe('octocat/hello-world#42')
  })

  it('loadState returns {} when file missing', () => {
    expect(loadState('/no/such/state.json')).toEqual({})
  })

  it('round-trips through save/load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prw-'))
    const p = join(dir, 'state.json')
    const s = markDismissed({}, 'a/b#1', '2026-07-08T00:00:00Z')
    saveState(s, p)
    expect(loadState(p)).toEqual(s)
  })

  it('markDismissed is pure and sets the record', () => {
    const before: Record<string, never> = {}
    const after = markDismissed(before, 'a/b#1', '2026-07-08T00:00:00Z')
    expect(before).toEqual({})
    expect(after['a/b#1']).toEqual({ dismissed: true, dismissedAt: '2026-07-08T00:00:00Z' })
  })

  it('pruneState drops keys not currently open', () => {
    const s = {
      'a/b#1': { dismissed: true, dismissedAt: 'x' },
      'a/b#2': { dismissed: true, dismissedAt: 'y' }
    }
    expect(pruneState(s, ['a/b#2'])).toEqual({ 'a/b#2': { dismissed: true, dismissedAt: 'y' } })
  })
})
