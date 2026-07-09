import React from 'react'

export function ConfirmDialog({
  message, detail, confirmLabel, onConfirm, onCancel
}: {
  message: string
  detail?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="modal-msg">{message}</p>
        {detail && <p className="modal-detail">{detail}</p>}
        <div className="modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
