import { describe, expect, it } from 'vitest'
import {
  canGet,
  canPost,
  firstAllowedPath,
  GET_FINANCE,
  GET_PROCUREMENT,
  GET_SALES,
  GET_WAREHOUSE,
  navFor,
  POST,
} from './rbac.ts'

describe('RBAC mirrors Stage 2 requireRoles', () => {
  it('sales can see warehouse+sales and cannot POST procurement/finance', () => {
    const sales = ['sales']
    expect(navFor(sales)).toEqual({
      warehouse: true,
      procurement: false,
      sales: true,
      finance: false,
    })
    expect(canPost(sales, POST.createSO)).toBe(true)
    expect(canPost(sales, POST.createPO)).toBe(false)
    expect(canPost(sales, POST.goodsReceipt)).toBe(false)
    expect(canPost(sales, POST.adjustStock)).toBe(false)
    expect(canGet(sales, GET_FINANCE)).toBe(false)
    expect(canGet(sales, GET_PROCUREMENT)).toBe(false)
  })

  it('warehouse can GR+fulfill and cannot create PO/SO', () => {
    const wh = ['warehouse']
    expect(navFor(wh)).toEqual({
      warehouse: true,
      procurement: true,
      sales: true,
      finance: false,
    })
    expect(canPost(wh, POST.goodsReceipt)).toBe(true)
    expect(canPost(wh, POST.fulfillSO)).toBe(true)
    expect(canPost(wh, POST.createPO)).toBe(false)
    expect(canPost(wh, POST.createSO)).toBe(false)
    expect(canPost(wh, POST.approvePO)).toBe(false)
  })

  it('auditor GET-bypasses every view but cannot POST', () => {
    const auditor = ['auditor']
    expect(canGet(auditor, GET_WAREHOUSE)).toBe(true)
    expect(canGet(auditor, GET_PROCUREMENT)).toBe(true)
    expect(canGet(auditor, GET_SALES)).toBe(true)
    expect(canGet(auditor, GET_FINANCE)).toBe(true)
    expect(canPost(auditor, POST.createSO)).toBe(false)
    expect(canPost(auditor, POST.reverseJournal)).toBe(false)
    expect(firstAllowedPath(auditor)).toBe('/warehouse')
  })

  it('admin is not god-mode for writes', () => {
    const admin = ['admin']
    expect(canGet(admin, GET_FINANCE)).toBe(true)
    expect(canPost(admin, POST.createPO)).toBe(false)
    expect(canPost(admin, POST.createSO)).toBe(false)
    expect(canPost(admin, POST.goodsReceipt)).toBe(false)
    expect(canPost(admin, POST.adjustStock)).toBe(false)
  })
})
