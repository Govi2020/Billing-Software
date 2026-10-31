const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || 'The request could not be completed.');
    error.status = response.status;
    error.data = result.data;
    throw error;
  }
  return result.data;
}

function csrfToken() {
  return document.cookie
    .split('; ')
    .find(cookie => cookie.startsWith('brightloop_csrf='))
    ?.slice('brightloop_csrf='.length);
}

export const api = {
  hasSessionHint: () => document.cookie.split('; ').some(cookie => cookie.startsWith('brightloop_csrf=')),
  login: credentials => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  signup: details => request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(details),
  }),
  forgotPassword: email => request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  resetPassword: (token, newPassword) => request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  }),
  changePassword: (token, currentPassword, newPassword) => request('/auth/change-password', {
    method: 'POST',
    token,
    body: JSON.stringify({ currentPassword, newPassword }),
  }),
  subscribe: (token, planId) => request(`/marketplace/plans/${planId}/subscribe`, {
    method: 'POST',
    token,
  }),
  createPlan: (token, plan) => request('/plans', {
    method: 'POST',
    token,
    body: JSON.stringify(plan),
  }),
  updatePlan: (token, planId, plan) => request(`/plans/${planId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(plan),
  }),
  deactivatePlan: (token, planId) => request(`/plans/${planId}/deactivate`, {
    method: 'POST',
    token,
  }),
  createProduct: (token, product) => request('/products', {
    method: 'POST',
    token,
    body: JSON.stringify(product),
  }),
  updateProduct: (token, productId, product) => request(`/products/${productId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(product),
  }),
  createTax: (token, tax) => request('/taxes', {
    method: 'POST',
    token,
    body: JSON.stringify(tax),
  }),
  updateTax: (token, taxId, tax) => request(`/taxes/${taxId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(tax),
  }),
  deactivateCatalogRecord: (token, type, id) => {
    const collection = { product: 'products', tax: 'taxes', discount: 'discounts' }[type];
    return request(`/${collection}/${id}/deactivate`, { method: 'POST', token });
  },
  createProductVariant: (token, productId, variant) => request(`/products/${productId}/variants`, {
    method: 'POST',
    token,
    body: JSON.stringify(variant),
  }),
  updateProductVariant: (token, productId, variantId, variant) => request(`/products/${productId}/variants/${variantId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(variant),
  }),
  quotationTemplates: token => request('/quotation-templates', { token }),
  createQuotationTemplate: (token, template) => request('/quotation-templates', {
    method: 'POST',
    token,
    body: JSON.stringify(template),
  }),
  updateQuotationTemplate: (token, templateId, template) => request(`/quotation-templates/${templateId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(template),
  }),
  deactivateQuotationTemplate: (token, templateId) => request(`/quotation-templates/${templateId}/deactivate`, {
    method: 'POST',
    token,
  }),
  createDiscount: (token, discount) => request('/discounts', {
    method: 'POST',
    token,
    body: JSON.stringify(discount),
  }),
  updateDiscount: (token, discountId, discount) => request(`/discounts/${discountId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(discount),
  }),
  createCustomer: (token, customer) => request('/customers', {
    method: 'POST',
    token,
    body: JSON.stringify(customer),
  }),
  createQuotation: (token, quotation) => request('/subscriptions', {
    method: 'POST',
    token,
    body: JSON.stringify(quotation),
  }),
  subscriptionDetails: (token, subscriptionId) => request(`/subscriptions/${subscriptionId}`, { token }),
  updateSubscriptionLines: (token, subscriptionId, lines) => request(`/subscriptions/${subscriptionId}/lines`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ lines }),
  }),
  confirmQuotation: (token, subscriptionId) => request(`/subscriptions/${subscriptionId}/confirm`, {
    method: 'POST',
    token,
  }),
  acceptQuotation: (token, subscriptionId) => request(`/subscriptions/${subscriptionId}/accept`, {
    method: 'POST',
    token,
  }),
  renewSubscription: (token, subscriptionId) => request(`/subscriptions/${subscriptionId}/renew`, {
    method: 'POST',
    token,
  }),
  manageSubscription: (token, subscriptionId, action) => request(`/subscriptions/${subscriptionId}/action`, {
    method: 'POST',
    token,
    body: JSON.stringify({ action }),
  }),
  recordPayment: (token, invoiceId, payment) => request(`/invoices/${invoiceId}/payments`, {
    method: 'POST',
    token,
    body: JSON.stringify(payment),
  }),
  demoPayment: (token, invoiceId) => request(`/invoices/${invoiceId}/demo-payment`, {
    method: 'POST',
    token,
  }),
  invoiceDetails: (token, invoiceId) => request(`/invoices/${invoiceId}`, { token }),
  cancelInvoice: (token, invoiceId, reason) => request(`/invoices/${invoiceId}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  }),
  confirmInvoice: (token, invoiceId) => request(`/invoices/${invoiceId}/confirm`, { method: 'POST', token }),
  sendInvoice: (token, invoiceId) => request(`/invoices/${invoiceId}/send`, { method: 'POST', token }),
  remindInvoice: (token, invoiceId) => request(`/invoices/${invoiceId}/reminder`, { method: 'POST', token }),
  runBilling: (token, asOfDate) => request('/billing/runs', {
    method: 'POST',
    token,
    body: JSON.stringify(asOfDate ? { as_of_date: asOfDate } : {}),
  }),
  billingRuns: token => request('/billing/runs', { token }),
  billingReconciliation: token => request('/billing/reconciliation', { token }),
  adminHealth: token => request('/admin/health', { token }),
  auditLog: token => request('/admin/audit-log', { token }),
  updateSettings: (token, settings) => request('/admin/settings', {
    method: 'PATCH',
    token,
    body: JSON.stringify(settings),
  }),
  deactivateUser: (token, userId, updatedAt) => request(`/users/${userId}/deactivate`, {
    method: 'POST',
    token,
    headers: { 'If-Match': updatedAt },
  }),
  reactivateUser: (token, userId, updatedAt) => request(`/users/${userId}/reactivate`, {
    method: 'POST',
    token,
    headers: { 'If-Match': updatedAt },
  }),
  hardDeleteCustomer: (token, customerId, confirmation) => request(`/customers/${customerId}`, {
    method: 'DELETE',
    token,
    body: JSON.stringify({ confirmation }),
  }),
  updateCustomerProfile: (token, profile) => request('/me/customer', {
    method: 'PATCH',
    token,
    body: JSON.stringify(profile),
  }),
  createStaff: (token, staff) => request('/users', {
    method: 'POST',
    token,
    body: JSON.stringify(staff),
  }),
  refresh: () => request('/auth/refresh', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken() || '' },
  }),
  logout: token => request('/auth/logout', { method: 'POST', token }),
  workspace: token => request('/workspace', { token }),
};
