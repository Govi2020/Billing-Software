const cents = value => {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new TypeError(`Invalid money value: ${text}`);
  const amount = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
};
const scale4 = value => {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) throw new TypeError(`Invalid rate value: ${text}`);
  return BigInt(match[1]) * 10000n + BigInt((match[2] ?? '').padEnd(4, '0'));
};
const decimal = value => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;
const roundHalfUp = (numerator, denominator) => (numerator + denominator / 2n) / denominator;

export function allocateDiscount(total, weights) {
  const sum = weights.reduce((acc, item) => acc + item.amount, 0n);
  if (total <= 0n || sum <= 0n) return weights.map(() => 0n);
  const shares = weights.map(item => {
    const numerator = total * item.amount;
    return { floor: numerator / sum, remainder: numerator % sum };
  });
  let remainder = total - shares.reduce((acc, share) => acc + share.floor, 0n);
  const order = shares.map((share, index) => ({ ...share, index }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : (a.remainder > b.remainder ? -1 : 1));
  for (const share of order) {
    if (remainder === 0n) break;
    shares[share.index].floor += 1n;
    remainder -= 1n;
  }
  return shares.map((share, index) => share.floor > weights[index].amount ? weights[index].amount : share.floor);
}

export function computeInvoice(lines, discounts = [], stacking = 'sequential') {
  const state = lines.map(line => {
    const subtotal = line.line_subtotal === undefined
      ? cents(line.unit_price) * BigInt(line.quantity)
      : cents(line.line_subtotal);
    return { ...line, subtotal, remaining: subtotal, discount: 0n };
  });
  if (stacking === 'best_only') {
    let bestRule = null;
    let bestAmount = 0n;
    for (const rule of discounts) {
      const eligible = state.filter(line => rule.scope === 'subscription'
        || rule.product_ids.includes(String(line.product_id)));
      const base = eligible.reduce((sum, line) => sum + line.remaining, 0n);
      const quantity = eligible.reduce((sum, line) => sum + BigInt(line.quantity), 0n);
      if (!base || base < cents(rule.min_purchase_amount ?? '0')
          || quantity < BigInt(rule.min_quantity ?? 0)) continue;
      const requested = rule.kind === 'percentage'
        ? roundHalfUp(base * cents(rule.value), 10000n)
        : cents(rule.value);
      const amount = requested > base ? base : requested;
      if (amount > bestAmount) {
        bestAmount = amount;
        bestRule = rule;
      }
    }
    discounts = bestRule ? [bestRule] : [];
  }
  const redemptions = [];
  for (const rule of discounts) {
    const indexes = state.map((line, index) => ({ line, index }))
      .filter(({ line }) => rule.scope === 'subscription' || rule.product_ids.includes(String(line.product_id)));
    const base = indexes.reduce((sum, item) => sum + item.line.remaining, 0n);
    if (!base) continue;
    const thresholdBase = cents(rule.min_purchase_amount ?? '0');
    const quantity = indexes.reduce((sum, item) => sum + BigInt(item.line.quantity), 0n);
    if (base < thresholdBase || quantity < BigInt(rule.min_quantity ?? 0)) continue;
    const requested = rule.kind === 'percentage'
      ? roundHalfUp(base * cents(rule.value), 10000n)
      : cents(rule.value);
    const discount = requested > base ? base : requested;
    const allocated = allocateDiscount(discount, indexes.map(item => ({ amount: item.line.remaining })));
    allocated.forEach((amount, offset) => {
      const line = indexes[offset].line;
      line.discount += amount;
      line.remaining -= amount;
    });
    redemptions.push({ discount_id: String(rule.id), amount: discount });
  }
  const computed = state.map(line => {
    const taxRate = scale4(line.tax_rate ?? '0');
    const tax = line.tax_kind === 'fixed'
      ? roundHalfUp(taxRate * BigInt(line.quantity), 100n)
      : roundHalfUp(line.remaining * taxRate, 1000000n);
    return {
      ...line,
      tax,
      lineTotal: line.remaining + tax,
    };
  });
  const subtotal = state.reduce((sum, line) => sum + line.subtotal, 0n);
  const discountTotal = state.reduce((sum, line) => sum + line.discount, 0n);
  const taxTotal = computed.reduce((sum, line) => sum + line.tax, 0n);
  return {
    lines: computed.map(({ subtotal: lineSubtotal, remaining: _remaining, discount, tax, lineTotal, ...line }) => ({
      ...line,
      unit_price: String(line.unit_price),
      line_subtotal: decimal(lineSubtotal),
      discount_amount: decimal(discount),
      tax_amount: decimal(tax),
      line_total: decimal(lineTotal),
    })),
    redemptions: redemptions.map(item => ({ ...item, amount: decimal(item.amount) })),
    subtotal: decimal(subtotal),
    discount_total: decimal(discountTotal),
    tax_total: decimal(taxTotal),
    total: decimal(subtotal - discountTotal + taxTotal),
  };
}

export function addPeriod(anchor, index, period) {
  const [year, month, day] = anchor.split('-').map(Number);
  if (period === 'daily' || period === 'weekly') {
    const date = new Date(Date.UTC(year, month - 1, day + index * (period === 'daily' ? 1 : 7)));
    return date.toISOString().slice(0, 10);
  }
  const months = period === 'monthly' ? index : index * 12;
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetLastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, targetLastDay);
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function periodIndex(anchor, date, period) {
  const [ay, am, ad] = anchor.split('-').map(Number);
  const [dy, dm, dd] = date.split('-').map(Number);
  let guess = period === 'daily'
    ? Math.floor((Date.UTC(dy, dm - 1, dd) - Date.UTC(ay, am - 1, ad)) / 86400000)
    : period === 'weekly'
      ? Math.floor((Date.UTC(dy, dm - 1, dd) - Date.UTC(ay, am - 1, ad)) / (7 * 86400000))
      : period === 'monthly' ? (dy - ay) * 12 + dm - am : dy - ay;
  while (guess > 0 && addPeriod(anchor, guess, period) > date) guess--;
  while (addPeriod(anchor, guess + 1, period) <= date) guess++;
  return guess;
}

export const toCents = cents;
export const fromCents = decimal;
