// src/main/fix.ts
import { spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { openSync, mkdirSync } from 'fs'
import { homedir } from 'os'

// Launch a detached, headless Claude run that checks out the PR branch,
// fixes the failing/missing checks, commits, and pushes an update to the
// same branch. Fire-and-forget: the widget does not wait for completion —
// the next poll surfaces the updated PR. Output is logged for inspection.
export function spawnFix(owner: string, repo: string, number: number, account?: string): string {
  const workDir = join(homedir(), '.pr-widget', 'work')
  mkdirSync(workDir, { recursive: true })
  const logPath = join(workDir, `fix-${owner}-${repo}-${number}.log`)
  const fd = openSync(logPath, 'a')
  // In dev the script sits next to the source tree; in a packaged app it is
  // copied out of the asar via electron-builder's extraResources.
  const scriptRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const script = join(scriptRoot, 'scripts', 'fix-pr.sh')
  const child = spawn('bash', [script, owner, repo, String(number), account ?? ''], {
    detached: true,
    stdio: ['ignore', fd, fd]
  })
  child.unref()
  return logPath
}
