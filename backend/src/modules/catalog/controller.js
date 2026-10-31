import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';

const resources = {
  taxes: {
    table: 'taxes', fields: ['name', 'kind', 'rate', 'is_active'], audit: false,
    search: ['name'],
  },
  products: {
    table: 'products', fields: ['name', 'type', 'sales_price', 'cost_price', 'tax_id', 'notes', 'is_active'],
    search: ['name', 'notes'],
  },
  plans: {
    table: 'plans', fields: ['name', 'price', 'billing_period', 'min_quantity', 'available_from', 'available_to', 'auto_close', 'is_closable', 'is_pausable', 'is_renewable', 'is_active'],
    search: ['name'],
  },
  'payment-terms': {
    table: 'payment_terms', fields: ['name', 'due_days', 'is_active'], audit: false,
    search: ['name'],
  },
};

function serialize(row, role) {
  const result = { ...row };
  for (const field of ['sales_price', 'cost_price', 'price', 'rate']) {
    if (result[field] !== undefined && result[field] !== null) result[field] = String(result[field]);
  }
  if (role === 'staff') delete result.cost_price;
  return result;
}

export async function list(resource, req, res) {
  const definition = resources[resource];
  const { page, limit, q } = req.validated.query;
  const params = [];
  const filters = [];
  if (q) {
    params.push(`%${q}%`);
    filters.push(`(${definition.search.map(field => `CAST(${field} AS TEXT) ILIKE $1`).join(' OR ')})`);
  }
  if (req.auth.role !== 'admin') filters.push('is_active = TRUE');
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const count = await pool.query(`SELECT count(*)::int AS total FROM ${definition.table} ${where}`, params);
  params.push(limit, (page - 1) * limit);
  const columns = resource === 'products' && req.auth.role === 'staff'
    ? definition.fields.filter(field => field !== 'cost_price').join(', ')
    : definition.fields.join(', ');
  const timestamps = ', created_at, updated_at';
  const rows = await pool.query(
    `SELECT id, ${columns}${timestamps} FROM ${definition.table} ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ data: rows.rows.map(row => serialize(row, req.auth.role)), meta: { page, limit, total: count.rows[0].total } });
}

export async function getProduct(req, res) {
  const result = await pool.query(
    `SELECT id, name, type, sales_price, cost_price, tax_id, notes, is_active, created_at, updated_at
       FROM products WHERE id=$1`,
    [req.validated.params.id],
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Product not found.');
  res.json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function create(resource, req, res) {
  const definition = resources[resource];
  const fields = Object.keys(req.validated.body);
  const values = fields.map(field => req.validated.body[field]);
  if (resource === 'products' && req.validated.body.tax_id) {
    const tax = await pool.query('SELECT is_active FROM taxes WHERE id = $1', [req.validated.body.tax_id]);
    if (!tax.rows[0]?.is_active) throw new AppError(422, 'INVALID_TAX', 'The selected tax is missing or inactive.');
  }
  const auditFields = definition.audit === false ? [] : ['created_by'];
  const auditValues = definition.audit === false ? [] : [req.auth.userId];
  const result = await pool.query(
    `INSERT INTO ${definition.table} (${[...fields, ...auditFields].join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).concat(auditValues.map((_, index) => `$${fields.length + index + 1}`)).join(', ')}) RETURNING *`,
    [...values, ...auditValues],
  );
  res.status(201).json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function update(resource, req, res) {
  const definition = resources[resource];
  const fields = Object.keys(req.validated.body);
  const values = fields.map(field => req.validated.body[field]);
  if (resource === 'products' && req.validated.body.tax_id) {
    const tax = await pool.query('SELECT is_active FROM taxes WHERE id=$1', [req.validated.body.tax_id]);
    if (!tax.rows[0]?.is_active) throw new AppError(422, 'INVALID_TAX', 'The selected tax is missing or inactive.');
  }
  const set = fields.map((field, index) => `${field} = $${index + 1}`);
  values.push(req.validated.params.id);
  values.push(req.ifMatch);
  const result = await pool.query(
    `UPDATE ${definition.table} SET ${set.join(', ')}
      WHERE id = $${values.length - 1} AND updated_at=$${values.length}::timestamptz RETURNING *`,
    values,
  );
  if (!result.rowCount) {
    const exists = await pool.query(`SELECT 1 FROM ${definition.table} WHERE id=$1`, [req.validated.params.id]);
    if (!exists.rowCount) throw new AppError(404, 'NOT_FOUND', 'Catalog record not found.');
    throw new AppError(409, 'STALE_RECORD', 'The catalog record changed since it was loaded.');
  }
  res.json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function listVariants(req, res) {
  const result = await pool.query(
    'SELECT id, product_id, attribute, value, extra_price, is_active, updated_at FROM product_variants WHERE product_id = $1 ORDER BY id',
    [req.validated.params.id],
  );
  res.json({ data: result.rows.map(row => serialize(row, req.auth.role)) });
}

export async function createVariant(req, res) {
  const result = await pool.query(
    `INSERT INTO product_variants (product_id, attribute, value, extra_price, is_active)
     SELECT id, $2, $3, $4, $5 FROM products WHERE id = $1 AND is_active
     RETURNING id, product_id, attribute, value, extra_price, is_active, updated_at`,
    [req.validated.params.id, ...Object.values(req.validated.body)],
  );
  if (!result.rowCount) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Active product not found.');
  res.status(201).json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function updateVariant(req, res) {
  const { id, variantId } = req.validated.params;
  const body = req.validated.body;
  const fields = Object.keys(body);
  const values = fields.map(field => body[field]);
  values.push(id, variantId, req.ifMatch);
  const result = await pool.query(
    `UPDATE product_variants SET ${fields.map((field, index) => `${field}=$${index + 1}`).join(', ')}
     WHERE product_id = $${fields.length + 1} AND id = $${fields.length + 2}
       AND updated_at=$${fields.length + 3}::timestamptz
     RETURNING id, product_id, attribute, value, extra_price, is_active, updated_at`,
    values,
  );
  if (!result.rowCount) throw new AppError(409, 'STALE_RECORD', 'The product variant changed or was removed.');
  res.json({ data: serialize(result.rows[0], req.auth.role) });
}

async function deactivate(table, id, ifMatch) {
  const result = await pool.query(`UPDATE ${table} SET is_active = FALSE WHERE id = $1 AND updated_at=$2::timestamptz RETURNING *`, [id, ifMatch]);
  if (!result.rowCount) throw new AppError(409, 'STALE_RECORD', 'The catalog record changed or was removed.');
  return result.rows[0];
}

export async function deactivateProduct(req, res) {
  res.json({ data: serialize(await deactivate('products', req.validated.params.id, req.ifMatch), req.auth.role) });
}

export async function deactivatePlan(req, res) {
  res.json({ data: serialize(await deactivate('plans', req.validated.params.id, req.ifMatch), req.auth.role) });
}

export async function listDiscounts(req, res) {
  const { page, limit, q } = req.validated.query;
  const search = q ? `%${q}%` : null;
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM discount_rules
     WHERE ($1::text IS NULL OR name ILIKE $1) AND ($2::boolean OR is_active)`,
    [search, req.auth.role === 'admin'],
  );
  const result = await pool.query(
    `SELECT id, name, kind, value, scope, min_purchase_amount, min_quantity,
            start_date, end_date, usage_limit, times_used, is_active, created_at, updated_at
       FROM discount_rules
      WHERE ($1::text IS NULL OR name ILIKE $1) AND ($2::boolean OR is_active)
      ORDER BY id DESC LIMIT $3 OFFSET $4`,
    [search, req.auth.role === 'admin', limit, (page - 1) * limit],
  );
  res.json({ data: result.rows.map(row => serialize(row, req.auth.role)), meta: { page, limit, total: count.rows[0].total } });
}

function discountValues(body) {
  return [
    body.name, body.kind, body.value, body.scope, body.min_purchase_amount,
    body.min_quantity, body.start_date, body.end_date ?? null,
    body.usage_limit ?? null, body.is_active,
  ];
}

export async function createDiscount(req, res) {
  const result = await pool.query(
    `INSERT INTO discount_rules
       (name, kind, value, scope, min_purchase_amount, min_quantity, start_date,
        end_date, usage_limit, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [...discountValues(req.validated.body), req.auth.userId],
  );
  res.status(201).json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function updateDiscount(req, res) {
  const fields = Object.keys(req.validated.body);
  const values = fields.map(field => req.validated.body[field]);
  values.push(req.validated.params.id, req.ifMatch);
  const result = await pool.query(
    `UPDATE discount_rules SET ${fields.map((field, index) => `${field}=$${index + 1}`).join(', ')}
      WHERE id=$${fields.length + 1} AND updated_at=$${fields.length + 2}::timestamptz RETURNING *`,
    values,
  );
  if (!result.rowCount) throw new AppError(409, 'STALE_RECORD', 'The discount rule changed or was removed.');
  res.json({ data: serialize(result.rows[0], req.auth.role) });
}

export async function deactivateDiscount(req, res) {
  res.json({ data: serialize(await deactivate('discount_rules', req.validated.params.id, req.ifMatch), req.auth.role) });
}

export async function setDiscountProducts(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const discount = await client.query('SELECT scope,updated_at FROM discount_rules WHERE id=$1 FOR UPDATE', [req.validated.params.id]);
    if (!discount.rowCount) throw new AppError(404, 'NOT_FOUND', 'Discount rule not found.');
    if (new Date(discount.rows[0].updated_at).getTime() !== new Date(req.ifMatch).getTime()) {
      throw new AppError(409, 'STALE_RECORD', 'The discount rule changed since it was loaded.');
    }
    if (discount.rows[0].scope !== 'product') {
      throw new AppError(422, 'INVALID_SCOPE', 'Products can only be assigned to product-scope discounts.');
    }
    const { product_ids: productIds } = req.validated.body;
    if (productIds.length) {
      const found = await client.query(
        'SELECT count(DISTINCT id)::int AS count FROM products WHERE id = ANY($1::bigint[])',
        [productIds],
      );
      if (found.rows[0].count !== productIds.length) throw new AppError(422, 'INVALID_PRODUCT', 'One or more products do not exist.');
    }
    await client.query('DELETE FROM discount_products WHERE discount_id=$1', [req.validated.params.id]);
    if (productIds.length) {
      await client.query(
        `INSERT INTO discount_products (discount_id, product_id)
         SELECT $1, unnest($2::bigint[])`,
        [req.validated.params.id, productIds],
      );
    }
    await client.query('UPDATE discount_rules SET updated_at=now() WHERE id=$1', [req.validated.params.id]);
    await client.query('COMMIT');
    res.json({ data: { discount_id: req.validated.params.id, product_ids: productIds } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listRedemptions(req, res) {
  const { page, limit } = req.validated.query;
  const id = req.validated.params.id;
  const count = await pool.query('SELECT count(*)::int AS total FROM discount_redemptions WHERE discount_id=$1', [id]);
  const result = await pool.query(
    `SELECT id, discount_id, subscription_id, invoice_id, amount, created_at
       FROM discount_redemptions WHERE discount_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [id, limit, (page - 1) * limit],
  );
  res.json({ data: result.rows.map(row => serialize(row, req.auth.role)), meta: { page, limit, total: count.rows[0].total } });
}

export async function listTemplates(req, res) {
  const { page, limit, q } = req.validated.query;
  const search = q ? `%${q}%` : null;
  const activeOnly = req.auth.role !== 'admin';
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM quotation_templates
      WHERE ($1::text IS NULL OR name ILIKE $1) AND ($2::boolean = FALSE OR is_active)`,
    [search, activeOnly],
  );
  const result = await pool.query(
    `SELECT id, name, plan_id, validity_days, notes, is_active, created_at, updated_at
       FROM quotation_templates
      WHERE ($1::text IS NULL OR name ILIKE $1) AND ($2::boolean = FALSE OR is_active)
      ORDER BY id DESC LIMIT $3 OFFSET $4`,
    [search, activeOnly, limit, (page - 1) * limit],
  );
  res.json({ data: result.rows, meta: { page, limit, total: count.rows[0].total } });
}

export async function createTemplate(req, res) {
  const body = req.validated.body;
  const plan = await pool.query('SELECT is_active FROM plans WHERE id=$1', [body.plan_id]);
  if (!plan.rows[0]?.is_active) throw new AppError(422, 'INVALID_PLAN', 'The selected plan is missing or inactive.');
  const result = await pool.query(
    `INSERT INTO quotation_templates (name, plan_id, validity_days, notes, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [body.name, body.plan_id, body.validity_days, body.notes ?? null, body.is_active, req.auth.userId],
  );
  res.status(201).json({ data: result.rows[0] });
}

export async function getTemplate(req, res) {
  const result = await pool.query(
    `SELECT id, name, plan_id, validity_days, notes, is_active, created_at, updated_at
       FROM quotation_templates WHERE id=$1`,
    [req.validated.params.id],
  );
  if (!result.rowCount) throw new AppError(404, 'NOT_FOUND', 'Quotation template not found.');
  const lines = await pool.query(
    `SELECT id, product_id, variant_id, quantity, sort_order
       FROM quotation_template_lines WHERE template_id=$1 ORDER BY sort_order, id`,
    [req.validated.params.id],
  );
  res.json({ data: { ...result.rows[0], lines: lines.rows } });
}

export async function updateTemplate(req, res) {
  const body = req.validated.body;
  if (body.plan_id) {
    const plan = await pool.query('SELECT is_active FROM plans WHERE id=$1', [body.plan_id]);
    if (!plan.rows[0]?.is_active) throw new AppError(422, 'INVALID_PLAN', 'The selected plan is missing or inactive.');
  }
  const fields = Object.keys(body);
  const values = fields.map(field => body[field]);
  values.push(req.validated.params.id, req.ifMatch);
  const result = await pool.query(
    `UPDATE quotation_templates SET ${fields.map((field, index) => `${field}=$${index + 1}`).join(', ')}
      WHERE id=$${fields.length + 1} AND updated_at=$${fields.length + 2}::timestamptz RETURNING *`,
    values,
  );
  if (!result.rowCount) throw new AppError(409, 'STALE_RECORD', 'The quotation template changed or was removed.');
  res.json({ data: result.rows[0] });
}

export async function setTemplateLines(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const templateId = req.validated.params.id;
    const template = await client.query('SELECT id,updated_at FROM quotation_templates WHERE id=$1 FOR UPDATE', [templateId]);
    if (!template.rowCount) throw new AppError(404, 'NOT_FOUND', 'Quotation template not found.');
    if (new Date(template.rows[0].updated_at).getTime() !== new Date(req.ifMatch).getTime()) {
      throw new AppError(409, 'STALE_RECORD', 'The quotation template changed since it was loaded.');
    }
    for (const line of req.validated.body.lines) {
      const product = await client.query(
        `SELECT p.is_active, v.is_active AS variant_active
           FROM products p LEFT JOIN product_variants v ON v.id=$2 AND v.product_id=p.id
          WHERE p.id=$1`,
        [line.product_id, line.variant_id ?? null],
      );
      if (!product.rows[0]?.is_active || (line.variant_id && !product.rows[0]?.variant_active)) {
        throw new AppError(422, 'INVALID_TEMPLATE_LINE', 'Template lines require active products and matching active variants.');
      }
    }
    await client.query('DELETE FROM quotation_template_lines WHERE template_id=$1', [templateId]);
    if (req.validated.body.lines.length) {
      const lines = req.validated.body.lines;
      const values = [];
      const tuples = lines.map((line, index) => {
        const offset = index * 5;
        values.push(templateId, line.product_id, line.variant_id ?? null, line.quantity, line.sort_order);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5})`;
      });
      await client.query(
        `INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, sort_order)
         VALUES ${tuples.join(',')}`,
        values,
      );
    }
    await client.query('UPDATE quotation_templates SET updated_at=now() WHERE id=$1', [templateId]);
    await client.query('COMMIT');
    res.json({ data: { template_id: templateId, lines: req.validated.body.lines } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateTemplate(req, res) {
  res.json({ data: serialize(await deactivate('quotation_templates', req.validated.params.id, req.ifMatch), req.auth.role) });
}
