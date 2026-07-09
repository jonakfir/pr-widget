// src/main/tray.ts
import { Tray, nativeImage, Menu, type BrowserWindow, app } from 'electron'

let tray: Tray | null = null

export function ensureTray(getWindow: () => BrowserWindow | null): Tray {
  if (tray) return tray
  // 1x1 transparent image; the title text carries the badge on macOS.
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('PR Widget')
  tray.setTitle('PR') // visible menu-bar label so the widget is findable even at 0 PRs
  tray.on('click', () => {
    const w = getWindow()
    if (w) (w.isVisible() ? w.hide() : w.show())
  })
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => getWindow()?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  return tray
}

export function setBadge(count: number): void {
  if (!tray) return
  tray.setTitle(count > 0 ? `PR ${count}` : 'PR')
  if (process.platform === 'darwin') app.dock?.setBadge(count > 0 ? String(count) : '')
}
