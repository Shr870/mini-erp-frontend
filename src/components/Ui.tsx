import type { ButtonHTMLAttributes } from 'react'
import { isApiError, operatorMessage } from '../api/http.ts'

export function ErrorBanner({ err, onRetry }: { err: unknown; onRetry?: () => void }) {
  if (!err) return null
  const status = isApiError(err) ? err.status : undefined
  const code = isApiError(err) ? err.code : undefined
  return (
    <div className={`banner banner-error`} role="alert">
      <div>
        <strong>{status ? `${status}` : 'Error'}{code ? ` · ${code}` : ''}</strong>
        <p>{operatorMessage(err)}</p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint ? <p className="muted">{hint}</p> : null}
    </div>
  )
}

export function LoadingState({ label = 'Loading from API…' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      {label}
    </div>
  )
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? 'unknown').toLowerCase()
  return <span className={`pill pill-${s.replace(/_/g, '-')}`}>{status ?? '—'}</span>
}

export function BusyButton({
  busy,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button className={className ?? 'btn btn-primary'} {...rest} disabled={rest.disabled || busy} aria-busy={busy}>
      {busy ? 'Working…' : children}
    </button>
  )
}
