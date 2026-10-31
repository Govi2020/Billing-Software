import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addBillingPeriods, calculateInvoiceLines, centsToMoney,
} from '../src/modules/billing/math.js';

test('invoice calculations apply discounts before percentage tax', () => {
  const result = calculateInvoiceLines([{
    id: 1,
    product_id: 4,
    description: 'Seats',
    quantity: 3,
    unit_price: '1000.00',
    tax_kind: 'percentage',
    tax_rate: '18.0000',
    sort_order: 0,
  }], [{
    id: 7,
    kind: 'percentage',
    value: '10.00',
    scope: 'subscription',
    min_purchase_amount: '0.00',
    min_quantity: 0,
    product_ids: [],
  }]);

  assert.equal(centsToMoney(result.subtotalCents), '3000.00');
  assert.equal(centsToMoney(result.discountTotalCents), '300.00');
  assert.equal(centsToMoney(result.taxTotalCents), '486.00');
  assert.equal(centsToMoney(result.totalCents), '3186.00');
});

test('fixed-per-unit tax rounds half up to cents', () => {
  const result = calculateInvoiceLines([{
    id: 1,
    product_id: 4,
    description: 'Seats',
    quantity: 2,
    unit_price: '10.00',
    tax_kind: 'fixed',
    tax_rate: '1.2345',
    sort_order: 0,
  }], []);

  assert.equal(centsToMoney(result.taxTotalCents), '2.47');
});

test('minimum-purchase discount thresholds use pre-discount line value', () => {
  const result = calculateInvoiceLines([{
    id: 1,
    product_id: 4,
    description: 'Seats',
    quantity: 1,
    unit_price: '100.00',
    sort_order: 0,
  }], [
    {
      id: 1,
      kind: 'fixed',
      value: '60.00',
      scope: 'subscription',
      min_purchase_amount: '0.00',
      min_quantity: 0,
      product_ids: [],
    },
    {
      id: 2,
      kind: 'percentage',
      value: '20.00',
      scope: 'subscription',
      min_purchase_amount: '90.00',
      min_quantity: 0,
      product_ids: [],
    },
  ]);

  assert.equal(centsToMoney(result.discountTotalCents), '68.00');
  assert.equal(centsToMoney(result.totalCents), '32.00');
});

test('monthly billing periods preserve the original month-end anchor', () => {
  assert.equal(addBillingPeriods('2024-01-31', 'monthly', 1), '2024-02-29');
  assert.equal(addBillingPeriods('2024-01-31', 'monthly', 2), '2024-03-31');
  assert.equal(addBillingPeriods('2023-01-31', 'monthly', 1), '2023-02-28');
});

test('daily and weekly billing periods advance by whole periods', () => {
  assert.equal(addBillingPeriods('2025-01-31', 'daily', 1), '2025-02-01');
  assert.equal(addBillingPeriods('2025-01-31', 'weekly', 2), '2025-02-14');
});

test('yearly billing periods clamp leap-day anchors without drift', () => {
  assert.equal(addBillingPeriods('2024-02-29', 'yearly', 1), '2025-02-28');
  assert.equal(addBillingPeriods('2024-02-29', 'yearly', 4), '2028-02-29');
});
