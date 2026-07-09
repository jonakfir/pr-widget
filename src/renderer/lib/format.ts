// Compact relative age, e.g. "3h ago", "2d ago", "just now".
export function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const days = Math.floor(secs / 86400)
  if (days >= 1) return days === 1 ? '1d ago' : `${days}d ago`
  const hours = Math.floor(secs / 3600)
  if (hours >= 1) return hours === 1 ? '1h ago' : `${hours}h ago`
  const mins = Math.floor(secs / 60)
  if (mins >= 1) return `${mins}m ago`
  return 'just now'
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
