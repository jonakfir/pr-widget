// src/main/index.ts
import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { pollOnce, pollIntervalMs } from './poller'
import { registerIpc } from './ipc'
import { ensureTray, setBadge } from './tray'
import type { PrView } from '../shared/types'

let win: BrowserWindow | null = null
let timer: NodeJS.Timeout | null = null
const getWindow = () => win

function createWindow(): void {
  win = new BrowserWindow({
    width: 380,
    height: 620,
    minWidth: 320,
    minHeight: 380,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    roundedCorners: true,
    hasShadow: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.once('ready-to-show', () => win?.show()) // show as a movable window once the UI is painted
  win.on('close', (e) => { e.preventDefault(); win?.hide() }) // keep running in the tray
}

// Open a standalone, resizable, Notes-app-sized window showing one PR in full.
// Reuses the same renderer bundle via the #detail hash; the PR is pushed in
// once the window's renderer has loaded.
function openDetailWindow(pr: PrView): void {
  const detail = new BrowserWindow({
    width: 720,
    height: 640,
    minWidth: 380,
    minHeight: 300,
    title: `#${pr.number} ${pr.title}`,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c20' : '#fafafc',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (process.env.ELECTRON_RENDERER_URL) detail.loadURL(`${process.env.ELECTRON_RENDERER_URL}#detail`)
  else detail.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'detail' })
  detail.once('ready-to-show', () => detail.show())
  detail.webContents.once('did-finish-load', () => detail.webContents.send('prw:detail-data', pr))
}

async function refresh(): Promise<void> {
  try {
    const { groups, undismissedCount } = await pollOnce()
    win?.webContents.send('prw:data', groups)
    setBadge(undismissedCount)
  } catch (e) {
    win?.webContents.send('prw:error', (e as Error).message)
  }
}

app.whenReady().then(() => {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true }) // only register auto-launch for the installed app, not dev runs
  createWindow()
  ensureTray(getWindow)
  registerIpc(() => void refresh())
  ipcMain.on('prw:hide', () => win?.hide()) // custom titlebar hide button (frameless window)
  ipcMain.on('prw:open-detail', (_e, pr: PrView) => openDetailWindow(pr))
  void refresh()
  timer = setInterval(() => void refresh(), pollIntervalMs())
})

app.on('window-all-closed', () => { /* stay alive in tray */ })
app.on('before-quit', () => { if (timer) clearInterval(timer) })
