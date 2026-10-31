import test from 'node:test';
import assert from 'node:assert/strict';
import { addPeriod, allocateDiscount, computeInvoice, periodIndex } from '../src/modules/billing/math.js';

test('largest remainder allocation conserves every cent', () => {
  const shares = allocateDiscount(10n, [{ amount: 3333n }, { amount: 3333n }, { amount: 3334n }]);
  assert.deepEqual(shares, [3n, 3n, 4n]);
  assert.equal(shares.reduce((sum, value) => sum + value, 0n), 10n);
});

test('monthly billing dates stay anchored to the original day', () => {
  assert.equal(addPeriod('2024-01-31', 1, 'monthly'), '2024-02-29');
  assert.equal(addPeriod('2024-01-31', 2, 'monthly'), '2024-03-31');
  assert.equal(periodIndex('2024-01-31', '2024-03-31', 'monthly'), 2);
});

test('daily and weekly dates advance in whole date units', () => {
  assert.equal(addPeriod('2024-02-28', 1, 'daily'), '2024-02-29');
  assert.equal(addPeriod('2024-02-28', 2, 'daily'), '2024-03-01');
  assert.equal(addPeriod('2024-01-31', 1, 'weekly'), '2024-02-07');
  assert.equal(periodIndex('2024-01-31', '2043-04-01', 'weekly'), 1000);
});

test('invoice math applies percentage discounts before percentage tax', () => {
  const totals = computeInvoice([{
    product_id: '1', quantity: 3, unit_price: '1000.00', line_subtotal: '3000.00',
    tax_kind: 'percentage', tax_rate: '18.0000',
  }], [{
    id: '2', scope: 'subscription', kind: 'percentage', value: '10.00',
    min_purchase_amount: '0.00', min_quantity: 0, product_ids: [],
  }]);
  assert.equal(totals.subtotal, '3000.00');
  assert.equal(totals.discount_total, '300.00');
  assert.equal(totals.tax_total, '486.00');
  assert.equal(totals.total, '3186.00');
  assert.doesNotThrow(() => JSON.stringify(totals));
});

test('fixed per-unit tax is multiplied by quantity and rounded to cents', () => {
  const totals = computeInvoice([{
    product_id: '1', quantity: 3, unit_price: '1.00', line_subtotal: '3.00',
    tax_kind: 'fixed', tax_rate: '0.3333',
  }]);
  assert.equal(totals.tax_total, '1.00');
  assert.equal(totals.total, '4.00');
});
