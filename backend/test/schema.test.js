import test from 'node:test';
import assert from 'node:assert/strict';
import { productPatchSchema, taxPatchSchema } from '../src/modules/catalog/schemas.js';
import { listSchema as subscriptionListSchema } from '../src/modules/subscriptions/schemas.js';

test('catalog patch schemas accept partial updates but reject empty updates', () => {
  assert.equal(productPatchSchema.safeParse({ sales_price: '12.50' }).success, true);
  assert.equal(productPatchSchema.safeParse({}).success, false);
  assert.equal(taxPatchSchema.safeParse({ rate: '18.0000' }).success, true);
  assert.equal(taxPatchSchema.safeParse({ kind: 'percentage', rate: '100.01' }).success, false);
});

test('subscription date filters reject inverted ranges', () => {
  assert.equal(subscriptionListSchema.safeParse({ startFrom: '2025-02-01', startTo: '2025-01-01' }).success, false);
  assert.equal(subscriptionListSchema.safeParse({ expiryFrom: '2025-01-01', expiryTo: '2025-02-01' }).success, true);
});
