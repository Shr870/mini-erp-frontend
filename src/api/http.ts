export class ApiError extends Error {
  status: number
  code: string
  detail?: string
  extra: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    detail?: string,
    extra: Record<string, unknown> = {},
  ) {
    super(detail || code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
    this.extra = extra
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

export function operatorMessage(err: unknown): string {
  if (!isApiError(err)) {
    return err instanceof Error ? err.message : 'Unexpected error'
  }
  const avail = err.extra.available
  const ordered = err.extra.ordered
  const requested = err.extra.requested
  const reserved = err.extra.reserved
  switch (err.code) {
    case 'insufficient_stock':
      return `Reservation rejected (409 insufficient_stock). Available ${avail ?? '—'}, ordered ${ordered ?? requested ?? '—'}. Backend did not reserve.`
    case 'over_receipt':
      return `Goods receipt rejected (422 over_receipt). Quantity exceeds outstanding on the PO line. Outstanding was not changed.`
    case 'exceeds_reservation':
      return `Fulfillment rejected (422 exceeds_reservation). Requested ${requested ?? '—'}, reserved ${reserved ?? '—'}.`
    case 'would_consume_reserved_stock':
      return `Adjustment rejected (422 would_consume_reserved_stock). Available ${avail ?? '—'}.`
    case 'forbidden':
      return `Not permitted (403). ${err.detail ?? 'This role cannot perform that operation; the API is authoritative.'}`
    case 'unauthorized':
      return 'Session expired or missing (401). Sign in again.'
    case 'invalid_credentials':
      return 'Email or password is wrong.'
    case 'idempotency_key_conflict':
      return `Idempotency key reused with a different payload (409).`
    default:
      return `${err.status} ${err.code}${err.detail ? ` — ${err.detail}` : ''}`
  }
}

type RequestOpts = {
  method?: string
  body?: unknown
  token?: string | null
  idempotencyKey?: string
  signal?: AbortSignal
}

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export async function apiRequest<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey.slice(0, 64)

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: 'invalid_json', detail: text.slice(0, 200) }
    }
  }

  if (!res.ok) {
    const body = (parsed ?? {}) as Record<string, unknown>
    const { error, detail, ...rest } = body
    throw new ApiError(
      res.status,
      String(error ?? 'error'),
      typeof detail === 'string' ? detail : undefined,
      rest,
    )
  }
  return parsed as T
}
