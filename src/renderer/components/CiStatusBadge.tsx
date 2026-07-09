import React from 'react'
import type { CiStatus } from '../../shared/types'

const LABEL: Record<CiStatus, string> = {
  passing: '✓ checks',
  failing: '✕ checks',
  pending: '● checks',
  none: ''
}

export function CiStatusBadge({ status }: { status: CiStatus }) {
  if (status === 'none') return null
  return <span className={`ci ci-${status}`}>{LABEL[status]}</span>
}
