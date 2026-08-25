import { describe, expect, it } from 'vitest'
import { ApiError, operatorMessage } from './http.ts'

describe('operatorMessage', () => {
  it('surfaces 409 insufficient_stock with backend extra fields', () => {
    const err = new ApiError(409, 'insufficient_stock', 'No available stock', {
      available: '0',
      ordered: '1',
    })
    expect(operatorMessage(err)).toMatch(/409 insufficient_stock/)
    expect(operatorMessage(err)).toMatch(/Available 0/)
  })

  it('surfaces 422 over_receipt without implying the PO changed', () => {
    const err = new ApiError(422, 'over_receipt')
    expect(operatorMessage(err)).toMatch(/422 over_receipt/)
    expect(operatorMessage(err)).toMatch(/Outstanding was not changed/)
  })

  it('surfaces 403 with API detail', () => {
    const err = new ApiError(403, 'forbidden', 'requires one of: procurement')
    expect(operatorMessage(err)).toMatch(/403/)
    expect(operatorMessage(err)).toMatch(/procurement/)
  })
})
