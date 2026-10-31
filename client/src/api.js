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
  verifyEmail: token => request(`/auth/verify-email?${new URLSearchParams({ token })}`),
  subscribe: (token, planId) => request(`/marketplace/plans/${planId}/subscribe`, {
    method: 'POST',
    token,
  }),
  createPlan: (token, plan) => request('/plans', {
    method: 'POST',
    token,
    body: JSON.stringify(plan),
  }),
  createProduct: (token, product) => request('/products', {
    method: 'POST',
    token,
    body: JSON.stringify(product),
  }),
  createTax: (token, tax) => request('/taxes', {
    method: 'POST',
    token,
    body: JSON.stringify(tax),
  }),
  createDiscount: (token, discount) => request('/discounts', {
    method: 'POST',
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
  confirmQuotation: (token, subscriptionId) => request(`/subscriptions/${subscriptionId}/confirm`, {
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
