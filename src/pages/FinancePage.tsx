import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/endpoints.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { canPost, POST } from '../auth/rbac.ts'
import { BusyButton, EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../components/Ui.tsx'
import { inr, qty, when } from '../lib/format.ts'

export function FinancePage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const canReverse = canPost(user?.roles ?? [], POST.reverseJournal)
  const [jeId, setJeId] = useState<string | null>(null)

  const reconQ = useQuery({
    queryKey: ['recon', token],
    queryFn: () => api.recon({ token }),
    enabled: Boolean(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const listQ = useQuery({
    queryKey: ['journals', token],
    queryFn: () => api.listJournals({ token }),
    enabled: Boolean(token),
    staleTime: 0,
  })
  const detailQ = useQuery({
    queryKey: ['journal', token, jeId],
    queryFn: () => api.getJournal({ token }, jeId!),
    enabled: Boolean(token && jeId),
  })

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Finance</h1>
          <p className="muted">
            Indicator is <code>GET /api/v1/ledger/reconciliation</code> — the console does not compute match/mismatch.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => void reconQ.refetch()}>
          Refresh recon
        </button>
      </header>

      {reconQ.isLoading ? <LoadingState label="Loading reconciliation…" /> : null}
      {reconQ.error ? <ErrorBanner err={reconQ.error} onRetry={() => void reconQ.refetch()} /> : null}
      {reconQ.data ? (
        <div className={`recon-hero ${reconQ.data.reconciled ? 'is-ok' : 'is-bad'}`}>
          <p className="recon-kicker">
            GET /ledger/reconciliation · last fetch{' '}
            {reconQ.dataUpdatedAt ? new Date(reconQ.dataUpdatedAt).toLocaleString('en-IN', { hour12: false }) : '—'}
          </p>
          <p className="recon-answer">
            Ledger balance matches inventory movements:{' '}
            <strong>{reconQ.data.reconciled ? 'YES' : 'NO'}</strong>
          </p>
          <dl className="kpi">
            <div>
              <dt>Movement carrying value</dt>
              <dd>{inr(reconQ.data.derivation.movement_carrying_value)}</dd>
            </div>
            <div>
              <dt>Ledger 1300</dt>
              <dd>{inr(reconQ.data.derivation.ledger_inventory_1300)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd>{inr(reconQ.data.derivation.difference)}</dd>
            </div>
            <div>
              <dt>Physical qty (all WH)</dt>
              <dd>{qty(reconQ.data.derivation.physical_qty_all_warehouses)}</dd>
            </div>
          </dl>
          <p className="mono formula">{reconQ.data.formula}</p>
          <p className="muted">{reconQ.data.on_failure}</p>
        </div>
      ) : null}

      <div className="split">
        <div className="panel">
          <h2>Journal</h2>
          {listQ.isLoading ? <LoadingState /> : null}
          {listQ.error ? <ErrorBanner err={listQ.error} /> : null}
          {listQ.data && listQ.data.journal_entries.length === 0 ? (
            <EmptyState title="No journal entries" hint="Post a GR, fulfillment, or adjustment first." />
          ) : null}
          {listQ.data && listQ.data.journal_entries.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Ref</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {listQ.data.journal_entries.map((je) => (
                  <tr
                    key={je.id}
                    className={jeId === je.id ? 'is-selected' : undefined}
                    onClick={() => setJeId(je.id)}
                  >
                    <td>{je.entry_number}</td>
                    <td>{je.description}</td>
                    <td>{je.reference_type}</td>
                    <td className="num">{inr(je.total_debit)}</td>
                    <td className="num">{inr(je.total_credit)}</td>
                    <td>{when(je.posted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <div className="panel">
          {!jeId ? <p className="muted">Select a journal entry.</p> : null}
          {detailQ.isLoading ? <LoadingState /> : null}
          {detailQ.error ? <ErrorBanner err={detailQ.error} /> : null}
          {detailQ.data ? (
            <>
              <h2>
                {detailQ.data.entry_number}{' '}
                <StatusBadge status={detailQ.data.balanced ? 'balanced' : 'unbalanced'} />
              </h2>
              <p>{detailQ.data.description}</p>
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="num">Debit</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(detailQ.data.lines ?? []).map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.account_code} {l.account_name}
                      </td>
                      <td className="num">{inr(l.debit)}</td>
                      <td className="num">{inr(l.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canReverse ? (
                <ReverseButton
                  id={detailQ.data.id}
                  onDone={() => {
                    void qc.invalidateQueries({ queryKey: ['journals'] })
                    void qc.invalidateQueries({ queryKey: ['journal'] })
                    void qc.invalidateQueries({ queryKey: ['recon'] })
                  }}
                />
              ) : (
                <p className="muted">Reversal is POST …/reverse (finance only). Auditor/admin cannot post it.</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ReverseButton({ id, onDone }: { id: string; onDone: () => void }) {
  const { token } = useAuth()
  const mut = useMutation({
    mutationFn: () => api.reverseJournal({ token }, id),
    onSuccess: onDone,
  })
  return (
    <div>
      {mut.error ? <ErrorBanner err={mut.error} /> : null}
      <BusyButton type="button" className="btn btn-danger" busy={mut.isPending} onClick={() => mut.mutate()}>
        Post reversing entry
      </BusyButton>
    </div>
  )
}
