import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeCart } from '../src/pricing.mjs'

test('applies discount before tax', () => {
  assert.deepEqual(
    summarizeCart(
      [
        { unitPrice: 20, quantity: 2 },
        { unitPrice: 10, quantity: 1 },
      ],
      { discountRate: 0.1, taxRate: 0.2 },
    ),
    {
      subtotal: 50,
      discount: 5,
      tax: 9,
      total: 54,
    },
  )
})

test('keeps zero-rate behavior stable', () => {
  assert.deepEqual(summarizeCart([{ unitPrice: 12.5, quantity: 2 }]), {
    subtotal: 25,
    discount: 0,
    tax: 0,
    total: 25,
  })
})
