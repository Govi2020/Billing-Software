function scaledInteger(value, scale) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * (10n ** BigInt(scale))
    + BigInt((fraction + '0'.repeat(scale)).slice(0, scale) || '0');
}

function roundHalfUp(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

export function moneyToCents(value) {
  return scaledInteger(value, 2);
}

export function centsToMoney(value) {
  const amount = BigInt(value);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function allocateDiscount(amount, eligibleLines) {
  const total = eligibleLines.reduce((sum, line) => sum + line.remainingCents, 0n);
  if (amount <= 0n || total <= 0n) return;
  const cappedAmount = amount > total ? total : amount;
  const shares = eligibleLines.map(line => {
    const numerator = cappedAmount * line.remainingCents;
    return {
      line,
      allocated: numerator / total,
      remainder: numerator % total,
    };
  });
  let remainder = cappedAmount - shares.reduce((sum, share) => sum + share.allocated, 0n);
  shares.sort((left, right) => left.remainder === right.remainder
    ? left.line.sort_order - right.line.sort_order || (left.line.id ?? 0) - (right.line.id ?? 0)
    : left.remainder > right.remainder ? -1 : 1);
  for (const share of shares) {
    if (remainder === 0n) break;
    if (share.allocated < share.line.remainingCents) {
      share.allocated += 1n;
      remainder -= 1n;
    }
  }
  for (const share of shares) {
    share.line.discountCents += share.allocated;
    share.line.remainingCents -= share.allocated;
  }
}

export function calculateInvoiceLines(lines, discounts) {
  const calculated = lines.map((line, index) => {
    const subtotalCents = BigInt(line.quantity) * moneyToCents(line.unit_price);
    return {
      ...line,
      id: line.id == null ? null : Number(line.id),
      sort_order: Number(line.sort_order ?? index),
      subtotalCents,
      discountCents: 0n,
      remainingCents: subtotalCents,
    };
  });

  const subtotalCents = calculated.reduce((sum, line) => sum + line.subtotalCents, 0n);
  const quantity = calculated.reduce((sum, line) => sum + Number(line.quantity), 0);
  const appliedDiscounts = [];

  for (const discount of discounts) {
    const eligible = calculated.filter(line => discount.scope !== 'product'
      || discount.product_ids.includes(String(line.product_id)));
    const basis = eligible.reduce((sum, line) => sum + line.remainingCents, 0n);
    const grossBasis = eligible.reduce((sum, line) => sum + line.subtotalCents, 0n);
    const eligibleQuantity = eligible.reduce((sum, line) => sum + Number(line.quantity), 0);
    if (basis === 0n
        || moneyToCents(discount.min_purchase_amount) > grossBasis
        || eligibleQuantity < Number(discount.min_quantity)) continue;
    const value = discount.kind === 'percentage'
      ? scaledInteger(discount.value, 2)
      : moneyToCents(discount.value);
    const amount = discount.kind === 'percentage'
      ? roundHalfUp(basis * value, 10_000n)
      : value > basis ? basis : value;
    if (amount <= 0n) continue;
    allocateDiscount(amount, eligible);
    appliedDiscounts.push({ id: discount.id, amountCents: amount });
  }

  const invoiceLines = calculated.map(line => {
    const taxableCents = line.subtotalCents - line.discountCents;
    const rateUnits = line.tax_rate === null || line.tax_rate === undefined
      ? 0n
      : scaledInteger(line.tax_rate, 4);
    const taxCents = line.tax_kind === 'percentage'
      ? roundHalfUp(taxableCents * rateUnits, 1_000_000n)
      : line.tax_kind === 'fixed'
        ? roundHalfUp(rateUnits * BigInt(line.quantity), 100n)
        : 0n;
    return {
      source: line,
      subtotalCents: line.subtotalCents,
      discountCents: line.discountCents,
      taxCents,
      totalCents: taxableCents + taxCents,
    };
  });
  const discountTotalCents = invoiceLines.reduce((sum, line) => sum + line.discountCents, 0n);
  const taxTotalCents = invoiceLines.reduce((sum, line) => sum + line.taxCents, 0n);
  return {
    invoiceLines,
    appliedDiscounts,
    subtotalCents,
    discountTotalCents,
    taxTotalCents,
    totalCents: subtotalCents - discountTotalCents + taxTotalCents,
    quantity,
  };
}

function dateParts(date) {
  const [year, month, day] = String(date).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

export function addBillingPeriods(anchor, billingPeriod, count) {
  const { year, month, day } = dateParts(anchor);
  if (billingPeriod === 'daily') return addDays(anchor, count);
  if (billingPeriod === 'weekly') return addDays(anchor, count * 7);
  const yearsToAdd = billingPeriod === 'yearly' ? count : 0;
  const monthsToAdd = billingPeriod === 'monthly' ? count : 0;
  const absoluteMonth = year * 12 + month - 1 + monthsToAdd + yearsToAdd * 12;
  const resultYear = Math.floor(absoluteMonth / 12);
  const resultMonth = absoluteMonth % 12 + 1;
  const lastDay = new Date(Date.UTC(resultYear, resultMonth, 0)).getUTCDate();
  return `${resultYear}-${String(resultMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function addDays(date, count) {
  const { year, month, day } = dateParts(date);
  const value = new Date(Date.UTC(year, month - 1, day + count));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}
