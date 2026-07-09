import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import type { StateMap } from '../shared/types'

export function prKey(owner: string, repo: string, number: number): string {
  return `${owner}/${repo}#${number}`
}

export function defaultStatePath(): string {
  return join(homedir(), '.pr-widget', 'state.json')
}

export function loadState(path: string = defaultStatePath()): StateMap {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StateMap
  } catch {
    return {}
  }
}

export function saveState(state: StateMap, path: string = defaultStatePath()): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2))
}

export function markDismissed(state: StateMap, key: string, nowIso: string): StateMap {
  return { ...state, [key]: { dismissed: true, dismissedAt: nowIso } }
}

export function pruneState(state: StateMap, openKeys: string[]): StateMap {
  const open = new Set(openKeys)
  const out: StateMap = {}
  for (const [k, v] of Object.entries(state)) {
    if (open.has(k)) out[k] = v
  }
  return out
}
