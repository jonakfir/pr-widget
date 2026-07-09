// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { ActionResult, CompanyGroup, MergedResult, PrView, RepoConfig } from '../shared/types'

contextBridge.exposeInMainWorld('prwidget', {
  onData: (cb: (groups: CompanyGroup[]) => void) =>
    ipcRenderer.on('prw:data', (_e, groups: CompanyGroup[]) => cb(groups)),
  onError: (cb: (message: string) => void) =>
    ipcRenderer.on('prw:error', (_e, message: string) => cb(message)),
  refresh: () => ipcRenderer.send('prw:refresh'),
  hide: () => ipcRenderer.send('prw:hide'),
  complete: (key: string): Promise<ActionResult> => ipcRenderer.invoke('prw:complete', key),
  merge: (key: string): Promise<ActionResult> => ipcRenderer.invoke('prw:merge', key),
  discard: (key: string): Promise<ActionResult> => ipcRenderer.invoke('prw:discard', key),
  fix: (key: string): Promise<ActionResult> => ipcRenderer.invoke('prw:fix', key),
  openDetail: (pr: PrView) => ipcRenderer.send('prw:open-detail', pr),
  onDetailData: (cb: (pr: PrView) => void) =>
    ipcRenderer.on('prw:detail-data', (_e, pr: PrView) => cb(pr)),
  getMerged: (company: string): Promise<MergedResult> => ipcRenderer.invoke('prw:merged', company),
  addCompany: (name: string): Promise<ActionResult> => ipcRenderer.invoke('prw:add-company', name),
  addRepo: (company: string, url: string): Promise<ActionResult> => ipcRenderer.invoke('prw:add-repo', company, url),
  removeCompany: (name: string): Promise<ActionResult> => ipcRenderer.invoke('prw:remove-company', name),
  removeRepo: (owner: string, repo: string): Promise<ActionResult> => ipcRenderer.invoke('prw:remove-repo', owner, repo),
  getRepos: (): Promise<RepoConfig[]> => ipcRenderer.invoke('prw:repos')
})
