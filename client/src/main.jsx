import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import './styles.css';

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
const navByRole = {
  admin: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['CONFIGURATION', 'Products & plans'], ['CONFIGURATION', 'Quotation templates'], ['CONFIGURATION', 'Discounts'], ['CONFIGURATION', 'Staff'], ['INSIGHTS', 'Finance'], ['INSIGHTS', 'Statistics'], ['ADMIN', 'Audit log'], ['ADMIN', 'Settings'], ['ADMIN', 'System health']],
  staff: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['INSIGHTS', 'Finance'], ['INSIGHTS', 'Statistics'], ['INSIGHTS', 'Catalog'], ['INSIGHTS', 'Quotation templates']],
  customer: [['YOUR ACCOUNT', 'Overview'], ['DISCOVER', 'Marketplace'], ['YOUR ACCOUNT', 'Subscriptions'], ['YOUR ACCOUNT', 'Invoices'], ['YOUR ACCOUNT', 'Payments'], ['YOUR ACCOUNT', 'Profile']],
};
function Badge({ children }) { return <span className={`badge ${children.toLowerCase()}`}>{children}</span>; }
function Icon({ name }) {
  const icons = { Dashboard: '⌂', Overview: '⌂', Marketplace: '▦', Customers: '◉', Subscriptions: '↻', Invoices: '▤', Payments: '↗', 'Products & plans': '◇', 'Quotation templates': '▤', Discounts: '%', Staff: '♧', Finance: '▥', Statistics: '▥', 'Audit log': '≡', Settings: '⚙', 'System health': '✓', Catalog: '▦', Profile: '◎' };
  return <span className="nav-icon" aria-hidden="true">{icons[name] || '·'}</span>;
}
function Login({ onLogin, onSignup, onForgotPassword, initialError }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [signupComplete, setSignupComplete] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);
  const submit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'signup') {
        await onSignup({ full_name: fullName, email, password });
        setSignupComplete(true);
      } else if (mode === 'forgot') {
        await onForgotPassword(email);
        setResetRequested(true);
      } else {
        await onLogin({ email, password });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };
  return <main className="login-page">
    <section className="login-aside">
      <a className="brand brand-light" href="#"><span className="brand-mark">b</span> brightloop</a>
      <div className="login-message"><span className="eyebrow">SUBSCRIPTION OPERATIONS</span><h1>Make recurring<br />revenue feel routine.</h1><p>One clear view of the customers, plans and payments that keep your business moving.</p></div>
      <div className="aside-foot"><span>BRIGHTLOOP SOFTWARE</span><span>BUILT FOR THE EVERYDAY</span></div>
    </section>
    <section className="login-main"><form className="login-card" onSubmit={submit}>
      <div className="mobile-brand"><span className="brand-mark">b</span> brightloop</div>
      <span className="eyebrow">{mode === 'signup' ? 'GET STARTED' : mode === 'forgot' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</span><h2>{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in to your workspace'}</h2><p className="muted">{mode === 'signup' ? 'Create a customer account to access your subscriptions.' : mode === 'forgot' ? 'Enter your email and we will send a reset link if the account exists.' : 'Sign in with your Brightloop account.'}</p>
      {mode === 'signup' && <label>Full name<input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={160} /></label>}
      <label>Email address<input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {mode !== 'forgot' && <label>Password<input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 9 : undefined} maxLength={128} /></label>}
      {mode === 'signup' && <p className="auth-hint">Use at least 9 characters with uppercase, lowercase, and a symbol.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {signupComplete && <p className="signup-success" role="status">Account created. Check your email for a verification link before signing in.</p>}
      {resetRequested && <p className="signup-success" role="status">If an account exists for this address, a reset link will be sent.</p>}
      {!signupComplete && !resetRequested && <button className="button primary full" type="submit" disabled={submitting}>{submitting ? (mode === 'signup' ? 'Creating account…' : mode === 'forgot' ? 'Sending…' : 'Signing in…') : (mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in')} <span>→</span></button>}
      {mode === 'login' && <button className="text-button auth-forgot" type="button" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}
      <p className="auth-switch">
        {mode === 'forgot' || signupComplete ? 'Remembered your password?' : mode === 'signup' ? 'Already have an account?' : 'New to Brightloop?'}
        {' '}<button type="button" onClick={() => { setMode(mode === 'signup' || mode === 'forgot' ? 'login' : 'signup'); setError(''); setSignupComplete(false); setResetRequested(false); }}>{mode === 'signup' || mode === 'forgot' || signupComplete ? 'Sign in' : 'Create an account'}</button>
      </p>
    </form></section>
  </main>;
}

function EmailVerification() {
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token. Request a new signup email or contact support.');
      return () => { active = false; };
    }
    api.verifyEmail(token)
      .then(() => {
        if (active) {
          setStatus('verified');
          window.history.replaceState(null, '', '/verify-email');
        }
      })
      .catch(error => {
        if (active) {
          setStatus('error');
          setMessage(error.message);
        }
      });
    return () => { active = false; };
  }, []);
  return <main className="verification-page">
    <section className="verification-card">
      <a className="brand" href="/"><span className="brand-mark">b</span> brightloop</a>
      {status === 'verifying' && <><span className="eyebrow">EMAIL VERIFICATION</span><h1>Verifying your email…</h1><p className="muted">Please keep this page open for a moment.</p></>}
      {status === 'verified' && <><span className="verification-mark">✓</span><span className="eyebrow">EMAIL VERIFIED</span><h1>Your account is ready.</h1><p className="muted">Your email address has been verified. You can now sign in to Brightloop.</p><a className="button primary verification-action" href="/">Continue to sign in <span>→</span></a></>}
      {status === 'error' && <><span className="eyebrow">VERIFICATION LINK UNAVAILABLE</span><h1>We couldn’t verify your email.</h1><p className="form-error" role="alert">{message}</p><p className="muted">Verification links can only be used once and expire after 24 hours.</p><a className="button secondary verification-action" href="/">Return to sign in</a></>}
    </section>
  </main>;
}

function exportPage(page, datasets) {
  const keys = {
    Customers: 'customers',
    Subscriptions: 'subscriptions',
    Invoices: 'invoices',
    Payments: 'payments',
    'Products & plans': 'catalog',
    Catalog: 'catalog',
    Staff: 'staff',
    Discounts: 'discounts',
    Finance: 'invoices',
  };
  const rows = datasets[keys[page]] || [];
  const columns = Object.keys(rows[0] || {});
  if (!columns.length) return;
  const csvValue = value => {
    const text = String(value ?? '').replace(/^[=+\-@]/, "'$&");
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = [columns.map(csvValue).join(','), ...rows.map(row => columns.map(column => csvValue(row[column])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `brightloop-${page.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  if (window.location.pathname === '/verify-email') return <EmailVerification />;
  if (window.location.pathname === '/reset') return <PasswordReset />;
  return <WorkspaceApp />;
}

function PasswordReset() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('This reset link is missing its token. Request another link.');
      return;
    }
    setSaving(true);
    try {
      await api.resetPassword(token, password);
      setMessage('Password updated. You can now sign in with your new password.');
      window.history.replaceState(null, '', '/reset');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <main className="verification-page"><form className="verification-card" onSubmit={submit}>
    <a className="brand" href="/"><span className="brand-mark">b</span> brightloop</a>
    <span className="eyebrow">ACCOUNT RECOVERY</span><h1>Set a new password</h1>
    <label>New password<input type="password" autoComplete="new-password" minLength={9} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
    <label>Confirm password<input type="password" autoComplete="new-password" minLength={9} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
    <p className="auth-hint">Use at least 9 characters with uppercase, lowercase, and a symbol.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="signup-success" role="status">{message}</p>}
    {!message && <button className="button primary verification-action" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</button>}
    {message && <a className="button secondary verification-action" href="/">Continue to sign in</a>}
  </form></main>;
}

function CustomerForm({ onSave, onCancel }) {
  const [values, setValues] = useState({ name: '', email: '', company_name: '', phone: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ ...values, company_name: values.company_name || null, phone: values.phone || null });
      onCancel();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <form className="panel plan-form" onSubmit={submit}>
    <h2>New customer</h2>
    <div className="plan-form-grid">
      <label>Full name<input required maxLength={160} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /></label>
      <label>Email<input type="email" required maxLength={254} value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} /></label>
      <label>Company<input maxLength={160} value={values.company_name} onChange={event => setValues({ ...values, company_name: event.target.value })} /></label>
      <label>Phone<input maxLength={40} value={values.phone} onChange={event => setValues({ ...values, phone: event.target.value })} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Create customer'}</button><button type="button" className="button secondary" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function QuotationForm({ customers, plans, templates, onSave, onCancel }) {
  const [values, setValues] = useState({ customer_id: '', plan_id: '', template_id: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(values);
      onCancel();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <form className="panel plan-form" onSubmit={submit}>
    <h2>New quotation</h2>
    <div className="plan-form-grid">
      <label>Customer<select required value={values.customer_id} onChange={event => setValues({ ...values, customer_id: event.target.value })}><option value="">Select a customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>)}</select></label>
      <label>Plan<select required value={values.plan_id} onChange={event => setValues({ ...values, plan_id: event.target.value })}><option value="">Select a plan</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} · {money(Number(plan.price) * plan.min_quantity)} / {plan.period.toLowerCase()}</option>)}</select></label>
      <label>Quotation template<select value={values.template_id} onChange={event => setValues({ ...values, template_id: event.target.value || null })}><option value="">Start without a template</option>{templates.filter(template => template.is_active && String(template.plan_id) === values.plan_id).map(template => <option key={template.id} value={template.id}>{template.name} · valid {template.validity_days} days</option>)}</select></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button primary" disabled={saving || !customers.length || !plans.length}>{saving ? 'Saving…' : 'Create quotation'}</button><button type="button" className="button secondary" onClick={onCancel}>Cancel</button></div>
    {(!customers.length || !plans.length) && <p className="permission-note">Add a customer and publish an available plan before creating a quotation.</p>}
  </form>;
}

function WorkspaceApp() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [workspace, setWorkspace] = useState(null);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceAttempt, setWorkspaceAttempt] = useState(0);
  const [page, setPage] = useState(null);
  const [search, setSearch] = useState('');
  const [createMode, setCreateMode] = useState(null);
  const searchRef = useRef(null);
  useEffect(() => {
    const handleShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  useEffect(() => {
    let active = true;
    if (!api.hasSessionHint()) {
      setSessionLoading(false);
      return () => { active = false; };
    }
    api.refresh()
      .then(session => {
        if (!active) return;
        setToken(session.accessToken);
        setUser({ ...session.user, name: session.user.full_name });
      })
      .catch(error => {
        if (active && error.status !== 401) setAuthError(error.message);
      })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    setWorkspaceError('');
    api.workspace(token)
      .then(data => { if (active) setWorkspace(data); })
      .catch(error => {
        if (!active) return;
        setWorkspaceError(error.message);
        if (error.status === 401) {
          setAuthError('Your session expired. Sign in again.');
          setUser(null);
          setToken(null);
          setWorkspace(null);
        }
      });
    return () => { active = false; };
  }, [token, workspaceAttempt]);
  const login = async credentials => {
    const session = await api.login(credentials);
    setUser({ ...session.user, name: session.user.full_name });
    setToken(session.accessToken);
    setAuthError('');
    setWorkspace(null);
    setWorkspaceError('');
    setPage(null);
  };
  const signup = async details => api.signup(details);
  const subscribe = async planId => {
    const result = await api.subscribe(token, planId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createPlan = async plan => {
    const result = await api.createPlan(token, plan);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createProduct = async product => {
    const result = await api.createProduct(token, product);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createProductVariant = async (productId, variant) => {
    const result = await api.createProductVariant(token, productId, variant);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updateProductVariant = async (productId, variantId, variant) => {
    const result = await api.updateProductVariant(token, productId, variantId, variant);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createTax = async tax => {
    const result = await api.createTax(token, tax);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createDiscount = async discount => {
    const result = await api.createDiscount(token, discount);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updateDiscount = async (discountId, discount) => {
    const result = await api.updateDiscount(token, discountId, discount);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updatePlan = async (planId, plan) => {
    const result = await api.updatePlan(token, planId, plan);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updateProduct = async (productId, product) => {
    const result = await api.updateProduct(token, productId, product);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updateTax = async (taxId, tax) => {
    const result = await api.updateTax(token, taxId, tax);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const deactivateRecord = async (type, id) => {
    const result = type === 'plan'
      ? await api.deactivatePlan(token, id)
      : await api.deactivateCatalogRecord(token, type, id);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createCustomer = async customer => {
    const result = await api.createCustomer(token, customer);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createQuotation = async quotation => {
    const result = await api.createQuotation(token, quotation);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const saveQuotationTemplate = async (template, templateId = null) => {
    const result = templateId
      ? await api.updateQuotationTemplate(token, templateId, template)
      : await api.createQuotationTemplate(token, template);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const deactivateTemplate = async templateId => {
    const result = await api.deactivateQuotationTemplate(token, templateId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const confirmQuotation = async subscriptionId => {
    const result = await api.confirmQuotation(token, subscriptionId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const acceptQuotation = async subscriptionId => {
    const result = await api.acceptQuotation(token, subscriptionId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const renewSubscription = async subscriptionId => {
    const result = await api.renewSubscription(token, subscriptionId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const getSubscriptionDetails = subscriptionId => api.subscriptionDetails(token, subscriptionId);
  const updateSubscriptionLines = async (subscriptionId, lines) => {
    const result = await api.updateSubscriptionLines(token, subscriptionId, lines);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const manageSubscription = async (subscriptionId, action) => {
    const result = await api.manageSubscription(token, subscriptionId, action);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const recordPayment = async (invoiceId, payment) => {
    const result = await api.recordPayment(token, invoiceId, payment);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const updateCustomerProfile = async profile => {
    const result = await api.updateCustomerProfile(token, profile);
    setUser(current => ({ ...current, name: result.name, full_name: result.name }));
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const createStaff = async staff => {
    const result = await api.createStaff(token, staff);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const forgotPassword = email => api.forgotPassword(email);
  const changePassword = async (currentPassword, newPassword) => {
    await api.changePassword(token, currentPassword, newPassword);
    setUser(null);
    setToken(null);
    setWorkspace(null);
    setAuthError('Your password has been changed. Sign in again.');
  };
  const deactivateUser = async (userId, updatedAt) => {
    const result = await api.deactivateUser(token, userId, updatedAt);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const reactivateUser = async (userId, updatedAt) => {
    const result = await api.reactivateUser(token, userId, updatedAt);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const runBilling = async () => {
    const result = await api.runBilling(token);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const cancelInvoice = async (invoiceId, reason) => {
    const result = await api.cancelInvoice(token, invoiceId, reason);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const confirmInvoice = async invoiceId => {
    const result = await api.confirmInvoice(token, invoiceId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const sendInvoice = async invoiceId => {
    const result = await api.sendInvoice(token, invoiceId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const remindInvoice = async invoiceId => {
    const result = await api.remindInvoice(token, invoiceId);
    setWorkspaceAttempt(attempt => attempt + 1);
    return result;
  };
  const logout = async () => {
    try {
      await api.logout(token);
      setAuthError('');
    } catch (error) {
      setAuthError(`Could not end the server session: ${error.message}`);
    } finally {
      setUser(null);
      setToken(null);
      setWorkspace(null);
      setPage(null);
    }
  };
  if (sessionLoading) return <main className="loading-screen">Connecting to Brightloop…</main>;
  if (!user) return <Login onLogin={login} onSignup={signup} onForgotPassword={forgotPassword} initialError={authError} />;
  if (!workspace && !workspaceError) return <main className="loading-screen">Loading your workspace…</main>;
  if (workspaceError && !workspace) return <main className="loading-screen"><p role="alert">{workspaceError}</p><button className="button secondary" onClick={() => setWorkspaceAttempt(attempt => attempt + 1)}>Try again</button></main>;
  const role = user.role;
  const activePage = page || (role === 'customer' ? 'Overview' : 'Dashboard');
  const isCustomer = role === 'customer';
  const isAdmin = role === 'admin';
  const customers = workspace?.customers || [];
  const subscriptions = workspace?.subscriptions || [];
  const invoices = workspace?.invoices || [];
  const summary = workspace?.summary || {};
  const filteredCustomers = customers.filter(c => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
  const filteredSubs = subscriptions.filter(s => `${s.id} ${s.customer} ${s.plan}`.toLowerCase().includes(search.toLowerCase()));
  const filteredInvoices = invoices.filter(i => `${i.id} ${i.customer}`.toLowerCase().includes(search.toLowerCase()));
  const heading = activePage === 'Dashboard' ? (isAdmin ? 'Control room' : 'My work') : activePage === 'Overview' ? `Hello, ${user.name.split(' ')[0]}` : activePage;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage(isCustomer ? 'Overview' : 'Dashboard'); }}><span className="brand-mark">b</span> brightloop</a>
      <div className="workspace-switch"><span className="workspace-avatar">B</span><span><b>Brightloop Software</b><small>Workspace</small></span><span className="switch-caret">⌄</span></div>
      <nav>{navByRole[role].map(([group, item], i) => <React.Fragment key={item}>{(i === 0 || navByRole[role][i - 1][0] !== group) && <div className="nav-group">{group}</div>}<button className={`nav-link ${activePage === item ? 'selected' : ''}`} onClick={() => { setPage(item); setSearch(''); }}><Icon name={item} />{item}{item === 'Invoices' && !isCustomer && <span className="nav-count">{invoices.filter(invoice => invoice.status === 'Confirmed').length}</span>}</button></React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><b>Need a hand?</b><small>Use the support email configured by your workspace.</small></div><button className="profile-row" onClick={() => setPage('Profile')}><span className="user-avatar">{user.name.split(' ').map(x => x[0]).join('')}</span><span><b>{user.name}</b><small>{role[0].toUpperCase() + role.slice(1)}</small></span><span className="more">···</span></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Brightloop <span>/</span> {activePage}</div><div className="top-actions"><label className="searchbox"><span>⌕</span><input ref={searchRef} aria-label="Search" placeholder="Search customers, SUB-, INV-…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd>{search && <button className="search-clear" type="button" aria-label="Clear search" title="Clear search" onClick={() => setSearch('')}>×</button>}</label><span className="icon-button notification" aria-label="Notifications" title="Notifications are shown in Needs attention">♧</span><button className="user-menu" onClick={logout} title="Sign out"><span className="user-avatar">{user.name.split(' ').map(x => x[0]).join('')}</span><span className="logout-label">Sign out</span>⌄</button></div></header>
      {workspaceError && <p className="workspace-error" role="alert">Workspace data could not be refreshed: {workspaceError}</p>}
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{isCustomer ? 'CUSTOMER PORTAL' : isAdmin ? 'ADMINISTRATION' : 'OPERATIONS'}</div><h1>{heading}</h1><p>{isCustomer ? 'Your subscriptions, invoices and account details.' : activePage === 'Dashboard' ? (isAdmin ? 'A clear view of what is happening across your business.' : 'Here is what needs your attention today.') : `Manage and review ${activePage.toLowerCase()} across your workspace.`}</p></div>{!isCustomer && <div className="heading-actions">{['Customers', 'Subscriptions', 'Invoices', 'Payments', 'Products & plans', 'Catalog', 'Discounts', 'Staff', 'Finance'].includes(activePage) && <button className="button secondary" onClick={() => exportPage(activePage, { customers: filteredCustomers, subscriptions: filteredSubs, invoices: filteredInvoices, payments: workspace.payments, catalog: [...workspace.products.map(item => ({ type: 'Product', ...item })), ...workspace.plans.map(item => ({ type: 'Plan', ...item })), ...workspace.taxes.map(item => ({ type: 'Tax', ...item }))], staff: workspace.staff, discounts: workspace.discounts })}>Export <span>↓</span></button>}{['Customers', 'Subscriptions'].includes(activePage) && <button className="button primary" onClick={() => setCreateMode(createMode ? null : activePage === 'Customers' ? 'customer' : 'quotation')}>＋ {activePage === 'Customers' ? 'Add customer' : 'New quotation'}</button>}</div>}</div>
        {activePage === 'Dashboard' || activePage === 'Overview' ? <Dashboard user={user} isAdmin={isAdmin} isCustomer={isCustomer} onNavigate={setPage} onConfirm={confirmQuotation} onManage={manageSubscription} rows={filteredSubs} bills={filteredInvoices} summary={summary} monthlyRevenue={workspace.monthlyRevenue} latestBillingRun={workspace.latestBillingRun} missingInvoices={workspace.missingInvoices} /> :
        activePage === 'Marketplace' ? <Marketplace plans={workspace.plans} onSubscribe={subscribe} onNavigate={setPage} /> :
        activePage === 'Customers' ? <>{createMode === 'customer' && <CustomerForm onSave={createCustomer} onCancel={() => setCreateMode(null)} />}<CustomerTable data={filteredCustomers} isAdmin={isAdmin} onDeactivate={deactivateUser} onReactivate={reactivateUser} /></> :
        activePage === 'Subscriptions' ? <>{createMode === 'quotation' && <QuotationForm customers={customers} plans={workspace.plans} templates={workspace.quotationTemplates || []} onSave={createQuotation} onCancel={() => setCreateMode(null)} />}<SubscriptionTable data={filteredSubs} products={workspace.products || []} onDetails={getSubscriptionDetails} onUpdateLines={isCustomer ? null : updateSubscriptionLines} onConfirm={isCustomer ? null : confirmQuotation} onAccept={isCustomer ? acceptQuotation : null} onRenew={renewSubscription} onManage={manageSubscription} isCustomer={isCustomer} /></> :
        activePage === 'Invoices' ? <InvoiceWorkspace data={filteredInvoices} isCustomer={isCustomer} onRecordPayment={isCustomer ? null : recordPayment} onConfirmInvoice={isCustomer ? null : confirmInvoice} onCancelInvoice={isCustomer ? null : cancelInvoice} onSendInvoice={isCustomer ? null : sendInvoice} onRemindInvoice={isCustomer ? null : remindInvoice} token={token} /> :
        activePage === 'Payments' ? <Payments data={workspace.payments} isCustomer={isCustomer} invoices={invoices} /> :
        activePage === 'Products & plans' || activePage === 'Catalog' ? <Catalog isAdmin={isAdmin} products={workspace.products} plans={workspace.plans} taxes={workspace.taxes} onCreatePlan={createPlan} onUpdatePlan={updatePlan} onCreateProduct={createProduct} onUpdateProduct={updateProduct} onCreateVariant={createProductVariant} onUpdateVariant={updateProductVariant} onCreateTax={createTax} onUpdateTax={updateTax} onDeactivate={deactivateRecord} /> :
        activePage === 'Finance' ? <Finance isAdmin={isAdmin} summary={summary} invoices={invoices} /> :
        activePage === 'Statistics' ? <Statistics token={token} refreshKey={workspaceAttempt} summary={summary} growth={workspace.growth} monthlyRevenue={workspace.monthlyRevenue} missingInvoices={workspace.missingInvoices || []} latestBillingRun={workspace.latestBillingRun} onNavigate={setPage} onRunBilling={runBilling} isAdmin={isAdmin} /> :
        activePage === 'Quotation templates' ? <QuotationTemplates data={workspace.quotationTemplates || []} products={workspace.products || []} plans={workspace.plans || []} isAdmin={isAdmin} onSave={saveQuotationTemplate} onDeactivate={deactivateTemplate} /> :
        activePage === 'Audit log' ? <AuditLog data={workspace.auditLog || []} /> :
        activePage === 'Settings' ? <Settings token={token} initialSettings={workspace.settings || {}} onSave={async settings => { const result = await api.updateSettings(token, settings); setWorkspaceAttempt(attempt => attempt + 1); return result; }} /> :
        activePage === 'System health' ? <SystemHealth token={token} /> :
        activePage === 'Discounts' ? <Discounts data={workspace.discounts} products={workspace.products} isAdmin={isAdmin} onCreate={createDiscount} onUpdate={updateDiscount} onDeactivate={deactivateRecord} /> :
        activePage === 'Staff' ? <Staff data={workspace.staff} isAdmin={isAdmin} onCreate={createStaff} /> :
        activePage === 'Profile' ? <Profile user={user} customer={customers[0]} isCustomer={isCustomer} onSave={updateCustomerProfile} onChangePassword={changePassword} /> :
        <div className="empty-panel"><span className="empty-symbol">✳</span><h2>{activePage}</h2><p>This prototype focuses on role-specific dashboards and seeded records.</p><button className="button secondary" onClick={() => setPage(isCustomer ? 'Overview' : 'Dashboard')}>Back to overview</button></div>}
        <footer className="page-footer"><span>© 2026 Brightloop Software</span><span><i className="online-dot" /> Live workspace data <span className="footer-sep">·</span> <span>Contact your workspace administrator for support</span></span></footer>
      </div>
    </main>
  </div>;
}

function Dashboard({ isAdmin, isCustomer, onNavigate, onConfirm, onManage, rows, bills, summary, monthlyRevenue = [], latestBillingRun, missingInvoices = [] }) {
  const overdue = bills.filter(invoice => invoice.is_overdue);
  const attentionSubscriptions = rows.filter(subscription => ['Draft', 'Quotation'].includes(subscription.status));
  const attentionItems = [
    ...overdue.map(invoice => ({ type: 'invoice', item: invoice })),
    ...attentionSubscriptions.map(subscription => ({ type: 'subscription', item: subscription })),
  ].slice(0, 3);
  const pipeline = ['Draft', 'Quotation', 'Confirmed'].map(status => ({
    status,
    count: rows.filter(subscription => subscription.status === status).length,
  }));
  const revenue = monthlyRevenue.map(item => ({ ...item, amount: Number(item.amount) }));
  const maxRevenue = Math.max(0, ...revenue.map(item => item.amount));
  const chartScale = Math.max(1, maxRevenue);
  const points = revenue.map((item, index) => ({
    x: revenue.length > 1 ? index * (600 / (revenue.length - 1)) : 300,
    y: 140 - (item.amount / chartScale) * 120,
  }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `M0 150 ${points.map(point => `L${point.x} ${point.y}`).join(' ')} L600 150 Z` : '';
  const nextSubscription = rows.find(subscription => subscription.status === 'Active');
  const nextInvoice = bills
    .filter(invoice => invoice.status === 'Confirmed' && !invoice.is_overdue)
    .sort((left, right) => left.due.localeCompare(right.due))[0];
  if (isCustomer) {
    return <>
      <div className="metric-grid four">
        <Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Across your account" icon="↻" />
        <Metric label="Next payment" value={money(nextInvoice?.amount_due || 0)} foot={nextInvoice?.due || nextSubscription?.date || 'No upcoming invoice'} icon="↗" />
        <Metric label="Pending payments" value={money(summary.outstanding_amount || 0)} foot={`${bills.filter(invoice => invoice.status === 'Confirmed').length} invoices awaiting payment`} icon="▤" />
        <Metric label="Overdue" value={money(summary.overdue_amount || 0)} foot={summary.overdue_invoices ? `${summary.overdue_invoices} invoices past due` : 'You are all caught up'} icon="✓" positive={!summary.overdue_invoices} warning={Boolean(summary.overdue_invoices)} />
      </div>
      <div className="section-grid">
        <section className="panel"><PanelTitle title="Your subscriptions" action="View all" onClick={() => onNavigate('Subscriptions')} /><SubscriptionTable compact data={rows} /></section>
        <section className="panel"><PanelTitle title="Recent invoices" action="View all" onClick={() => onNavigate('Invoices')} /><InvoiceTable compact data={bills} isCustomer /></section>
      </div>
      <div className="callout"><span className="callout-icon">i</span><span><b>Everything in one place.</b> Your plan changes and invoices are available anytime from the left menu.</span><button onClick={() => onNavigate('Profile')}>Review profile →</button></div>
    </>;
  }
  return <>
    <div className="metric-grid four">
      <Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Current active subscriptions" icon="↻" />
      <Metric label="Revenue this month" value={money(summary.revenue_this_month || 0)} foot="Payments received this month" icon="↗" />
      <Metric label="Pending payments" value={money(summary.outstanding_amount || 0)} foot={`${bills.filter(invoice => invoice.status === 'Confirmed').length} invoices awaiting payment`} icon="◷" />
      <Metric label="Overdue invoices" value={summary.overdue_invoices || 0} foot={`${money(summary.overdue_amount || 0)} needs follow-up`} icon="!" warning={Boolean(summary.overdue_invoices)} />
    </div>
    <div className="section-grid dashboard-grid">
      <section className="panel attention-panel">
        <PanelTitle title="Needs attention" badge={`${attentionItems.length} ITEMS`} />
        {attentionItems.map(({ type, item }) => <div className="attention-item" key={`${type}-${item.id}`}>
          <span className={`attention-mark ${type === 'invoice' ? 'red' : 'amber'}`}>{type === 'invoice' ? '!' : '◷'}</span>
          <div><b>{item.id} · {type === 'invoice' ? item.customer : item.status}</b><p>{type === 'invoice' ? `${item.days_overdue} days overdue · ${money(item.amount_due)}` : item.plan}</p></div>
          <button className="text-button" onClick={() => onNavigate(type === 'invoice' ? 'Invoices' : 'Subscriptions')}>Review →</button>
        </div>)}
        {!attentionItems.length && <p className="muted attention-empty">No items need attention.</p>}
      </section>
      {isAdmin ? <section className="panel chart-panel">
        <PanelTitle title="Revenue collected" action="Last 6 months" />
        <div className="chart-total">{money(summary.revenue_this_month || 0)}<span> this month</span></div>
        <div className="chart"><div className="chart-y"><span>{money(maxRevenue)}</span><span>{money(maxRevenue / 2)}</span><span>{money(0)}</span></div><div className="chart-area">
          <div className="grid-line one" /><div className="grid-line two" /><div className="grid-line three" />
          <svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Revenue trend"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#78a795" stopOpacity=".22" /><stop offset="100%" stopColor="#78a795" stopOpacity="0" /></linearGradient></defs>{area && <path d={area} fill="url(#fill)" />}<polyline points={line} fill="none" stroke="#377b63" strokeWidth="2.5" /></svg>
          <div className="chart-x">{revenue.map((item, index) => <span key={`${item.month}-${index}`}>{item.month}</span>)}</div>
        </div></div><div className="chart-legend"><i /> Collected revenue <span>Updated from payments</span></div>
      </section> : <section className="panel pipeline">
        <PanelTitle title="Quotation pipeline" action="View subscriptions" onClick={() => onNavigate('Subscriptions')} />
        <div className="pipeline-bars">{pipeline.map(item => <div key={item.status}><span>{item.status}</span><b>{item.count}</b><i style={{ '--bar': `${Math.max(3, (item.count / Math.max(1, ...pipeline.map(value => value.count))) * 100)}%` }} /></div>)}</div>
        <div className="pipeline-note"><span className="online-dot" /> {pipeline.find(item => item.status === 'Quotation').count} quotations are waiting for customer response</div>
      </section>}
    </div>
    <section className="panel table-panel"><PanelTitle title="Recent subscriptions" action="View all" onClick={() => onNavigate('Subscriptions')} /><SubscriptionTable compact data={rows.slice(0, 4)} onConfirm={isAdmin ? onConfirm : null} onManage={isAdmin ? onManage : null} allowCompactActions={isAdmin} isCustomer={isCustomer} /></section>
    {isAdmin && latestBillingRun && <div className="billing-health">
      <span className="health-check">{latestBillingRun.failed_count ? '!' : '✓'}</span>
      <div><b>Latest billing run: {latestBillingRun.status}</b><p>{new Date(latestBillingRun.started_at).toLocaleString()} · {latestBillingRun.invoiced_count} invoices · {latestBillingRun.failed_count} failures</p></div>
      <span className="health-right">{latestBillingRun.due_count} due</span>
    </div>}
    {isAdmin && <div className="billing-health">
      <span className={`health-check ${missingInvoices.length ? 'warning' : ''}`}>{missingInvoices.length ? '!' : '✓'}</span>
      <div><b>{missingInvoices.length} due subscriptions missing invoices</b><p>Includes active subscriptions with no non-cancelled invoice for their next billing date.</p></div>
      <button className="text-button" onClick={() => onNavigate('Statistics')}>Explain →</button>
    </div>}
  </>;
}
function Metric({ label, value, foot, icon, warning, positive, trend }) { return <section className="metric-card"><div className={`metric-icon ${warning ? 'warn' : positive ? 'good' : ''}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={`metric-foot ${warning ? 'red-text' : trend ? 'green-text' : ''}`}>{trend && <span>↗ </span>}{foot}</div></section>; }
function PanelTitle({ title, action, onClick, badge }) { return <div className="panel-title"><h2>{title}</h2>{badge && <span className="count-badge">{badge}</span>}{action && (onClick ? <button className="text-button" onClick={onClick}>{action} <span>→</span></button> : <span className="panel-meta">{action}</span>)}</div>; }
function SubscriptionTable({ data, compact, products = [], onConfirm, onAccept, onRenew, onManage, onDetails, onUpdateLines, allowCompactActions = false, isCustomer = false }) {
  const [working, setWorking] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState(null);
  const [editingLines, setEditingLines] = useState(null);
  const [lineError, setLineError] = useState('');
  const [savingLines, setSavingLines] = useState(false);
  const run = async (subscription, action) => {
    setWorking(`${subscription.id}:${action}`);
    setError('');
    setMessage('');
    try {
      if (action === 'confirm' || action === 'accept') {
        const result = action === 'accept'
          ? await onAccept(subscription.record_id)
          : await onConfirm(subscription.record_id);
        setMessage(`${subscription.id} ${action === 'accept' ? 'accepted' : 'confirmed'}. Invoice ${result.invoice.number} created.`);
      } else if (action === 'renew') {
        const result = await onRenew(subscription.record_id);
        setMessage(`Renewal ${result.number} created as a draft.`);
      } else if (action === 'details') {
        setDetail(await onDetails(subscription.record_id));
        setEditingLines(null);
      } else {
        const result = await onManage(subscription.record_id, action);
        setMessage(`${subscription.id} ${result.status.toLowerCase()}.`);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };
  const actionsEnabled = Boolean(onConfirm || onAccept || onRenew || onManage || onDetails);
  const showActions = actionsEnabled && (!compact || allowCompactActions);
  const startEditingLines = () => {
    setLineError('');
    setEditingLines(detail.lines.map(line => ({
      product_id: String(line.product_id),
      variant_id: line.variant_id ? String(line.variant_id) : '',
      quantity: String(line.quantity),
    })));
  };
  const saveLines = async event => {
    event.preventDefault();
    setSavingLines(true);
    setLineError('');
    try {
      const updated = await onUpdateLines(detail.id, editingLines.map(line => ({
        product_id: line.product_id,
        variant_id: line.variant_id || null,
        quantity: Number(line.quantity),
      })));
      setDetail(updated);
      setEditingLines(null);
      setMessage('Subscription lines updated.');
    } catch (requestError) {
      setLineError(requestError.message);
    } finally {
      setSavingLines(false);
    }
  };
  return <>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="signup-success action-feedback" role="status">{message}</p>}<div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th>{!compact && <th>CUSTOMER</th>}<th>PLAN</th><th>STATUS</th><th>{compact ? 'NEXT INVOICE' : 'AMOUNT / PERIOD'}</th>{showActions && <th>ACTION</th>}</tr></thead><tbody>{data.length ? data.map(s => <tr key={s.id}><td><span className="record-link">{s.id}</span></td>{!compact && <td>{s.customer}</td>}<td>{s.plan}</td><td><Badge>{s.status}</Badge></td><td>{compact ? s.date : money(s.amount)}</td>{showActions && <td className="row-actions">{onDetails && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'details')}>Details / history</button>}{s.status === 'Quotation' && onAccept && <button className="button primary small" disabled={working !== null} onClick={() => run(s, 'accept')}>{working === `${s.id}:accept` ? 'Accepting…' : 'Accept quote'}</button>}{s.status === 'Quotation' && onConfirm && <button className="button primary small" disabled={working !== null} onClick={() => run(s, 'confirm')}>{working === `${s.id}:confirm` ? 'Confirming…' : 'Confirm & invoice'}</button>}{s.status === 'Active' && s.is_pausable && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'pause')}>{working === `${s.id}:pause` ? 'Pausing…' : 'Pause'}</button>}{s.status === 'Paused' && s.is_pausable && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'resume')}>{working === `${s.id}:resume` ? 'Resuming…' : 'Resume'}</button>}{['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused'].includes(s.status) && s.is_closable && <button className="button danger small" disabled={working !== null} onClick={() => run(s, 'close')}>{working === `${s.id}:close` ? 'Cancelling…' : isCustomer ? 'Close' : 'Cancel'}</button>}{onRenew && s.is_renewable && ['Active', 'Closed'].includes(s.status) && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'renew')}>{working === `${s.id}:renew` ? 'Creating…' : 'Renew'}</button>}</td>}</tr>) : <tr><td colSpan={compact ? (showActions ? 5 : 4) : (showActions ? 6 : 5)} className="table-empty">No subscriptions found.</td></tr>}</tbody></table></div>
    {detail && <section className="panel table-panel">
      <div className="list-toolbar"><b>{detail.number} · {detail.customer} · {detail.plan}</b><button className="button secondary small" onClick={() => { setDetail(null); setEditingLines(null); }}>Close details</button></div>
      <p className="permission-note">Status: {detail.status} · Term: {detail.start_date} to {detail.expiry_date} · Next invoice: {detail.next_invoice_date || '—'}{detail.quotation_valid_until ? ` · Quote valid until ${detail.quotation_valid_until}` : ''}</p>
      <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>VARIANT</th><th>QTY</th><th>UNIT PRICE</th><th>TAX</th><th>SUBTOTAL</th></tr></thead><tbody>{detail.lines.length ? detail.lines.map(line => <tr key={line.id}><td>{line.product}</td><td>{line.variant || '—'}</td><td>{line.quantity}</td><td>{money(line.unit_price)}</td><td>{line.tax ? `${line.tax} (${line.tax_kind} ${line.tax_rate})` : '—'}</td><td>{money(line.subtotal)}</td></tr>) : <tr><td colSpan="6" className="table-empty">No detailed product lines on this subscription.</td></tr>}</tbody></table></div>
      {onUpdateLines && ['draft', 'quotation'].includes(String(detail.status).toLowerCase()) && <div className="form-actions"><button className="button secondary small" onClick={() => editingLines ? setEditingLines(null) : startEditingLines()}>{editingLines ? 'Cancel line editing' : 'Edit lines'}</button></div>}
      {editingLines && <form className="plan-form" onSubmit={saveLines}>
        <h3>Edit subscription lines</h3>
        {editingLines.map((line, index) => <div className="plan-form-grid" key={index}>
          <label>Product<select required value={line.product_id} onChange={event => setEditingLines(current => current.map((item, i) => i === index ? { ...item, product_id: event.target.value, variant_id: '' } : item))}><option value="">Select product</option>{products.filter(product => product.status === 'Active').map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label>Variant<select value={line.variant_id} onChange={event => setEditingLines(current => current.map((item, i) => i === index ? { ...item, variant_id: event.target.value } : item))}><option value="">Standard</option>{(products.find(product => String(product.id) === line.product_id)?.variants || []).filter(variant => variant.is_active).map(variant => <option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value} (+{money(variant.extra_price)})</option>)}</select></label>
          <label>Quantity<input type="number" min="1" max="100000" required value={line.quantity} onChange={event => setEditingLines(current => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} /></label>
          <button type="button" className="button danger small" disabled={editingLines.length === 1} onClick={() => setEditingLines(current => current.filter((_, i) => i !== index))}>Remove line</button>
        </div>)}
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => setEditingLines(current => [...current, { product_id: '', variant_id: '', quantity: '1' }])}>Add line</button><button className="button primary" disabled={savingLines}>{savingLines ? 'Saving…' : 'Save lines'}</button></div>
        {lineError && <p className="form-error" role="alert">{lineError}</p>}
      </form>}
      <h3>Status history</h3><div className="table-wrap"><table><thead><tr><th>WHEN</th><th>FROM</th><th>TO</th><th>NOTE</th></tr></thead><tbody>{detail.history.length ? detail.history.map((item, index) => <tr key={`${item.changed_at}-${index}`}><td>{new Date(item.changed_at).toLocaleString()}</td><td>{item.from_status || 'Created'}</td><td>{item.to_status}</td><td>{item.note || '—'}</td></tr>) : <tr><td colSpan="4" className="table-empty">No status changes recorded.</td></tr>}</tbody></table></div>
    </section>}
  </>;
}
function escapePrintHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
async function printInvoice(token, invoiceId) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups to print this invoice.');
  popup.opener = null;
  try {
    const invoice = await api.invoiceDetails(token, invoiceId);
    const lines = invoice.lines.map(line => `<tr><td>${escapePrintHtml(line.description)}</td><td>${line.quantity}</td><td>${money(line.unit_price)}</td><td>${money(line.subtotal)}</td><td>${money(line.discount_amount)}</td><td>${money(line.tax_amount)}</td><td>${money(line.total)}</td></tr>`).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><title>${escapePrintHtml(invoice.number)}</title><style>body{font:14px Arial,sans-serif;color:#20312c;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #377b63;padding-bottom:18px}h1{margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}th{background:#f2f7f6}.totals{margin-left:auto;width:300px}.totals div{display:flex;justify-content:space-between;padding:5px}.muted{color:#667}.print{padding:10px 18px}@media print{.print{display:none}body{margin:0}}</style></head><body><button class="print" onclick="window.print()">Print / save PDF</button><header><div><h1>Brightloop Software</h1><p>${escapePrintHtml(invoice.bill_to_name)}<br>${escapePrintHtml(invoice.bill_to_address)}</p></div><div><h2>Invoice ${escapePrintHtml(invoice.number)}</h2><p>Status: ${escapePrintHtml(invoice.status)}<br>Issued: ${escapePrintHtml(invoice.invoice_date)}<br>Due: ${escapePrintHtml(invoice.due_date)}<br>Period: ${escapePrintHtml(invoice.period_start)} – ${escapePrintHtml(invoice.period_end)}</p></div></header><table><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>SUBTOTAL</th><th>DISCOUNT</th><th>TAX</th><th>TOTAL</th></tr></thead><tbody>${lines}</tbody></table><div class="totals"><div><span>Subtotal</span><b>${money(invoice.subtotal)}</b></div><div><span>Discount</span><b>${money(invoice.discount_total)}</b></div><div><span>Tax</span><b>${money(invoice.tax_total)}</b></div><div><span>Total</span><b>${money(invoice.total)}</b></div><div><span>Paid</span><b>${money(invoice.amount_paid)}</b></div><div><span>Balance due</span><b>${money(Number(invoice.total) - Number(invoice.amount_paid))}</b></div></div></body></html>`);
    popup.document.querySelector('header h1').textContent = invoice.company_name || 'Brightloop Software';
    if (invoice.invoice_footer) {
      const footer = popup.document.createElement('footer');
      footer.textContent = invoice.invoice_footer;
      footer.style.marginTop = '32px';
      popup.document.body.append(footer);
    }
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 150);
  } catch (error) {
    popup.close();
    throw error;
  }
}
function InvoiceWorkspace({ data, ...tableProps }) {
  const [filter, setFilter] = useState('All invoices');
  const filters = ['All invoices', 'Needs payment', 'Overdue', 'Paid', 'Draft', 'Cancelled'];
  const overdue = data.filter(invoice => invoice.is_overdue);
  const open = data.filter(invoice => invoice.status === 'Confirmed');
  const paid = data.filter(invoice => invoice.status === 'Paid');
  const filtered = data.filter(invoice => {
    if (filter === 'Needs payment') return invoice.status === 'Confirmed' && Number(invoice.amount_due) > 0;
    if (filter === 'Overdue') return invoice.is_overdue;
    if (filter === 'Paid') return invoice.status === 'Paid';
    if (filter === 'Draft') return invoice.status === 'Draft';
    if (filter === 'Cancelled') return invoice.status === 'Cancelled';
    return true;
  });
  return <>
    <div className="metric-grid four invoice-summary">
      <Metric label="Invoices" value={data.length} foot="All invoices in this view" icon="▤" />
      <Metric label="Awaiting payment" value={money(open.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0))} foot={`${open.length} unpaid or partly paid`} icon="◷" warning={open.length > 0} />
      <Metric label="Overdue" value={money(overdue.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0))} foot={`${overdue.length} past due`} icon="!" warning={overdue.length > 0} />
      <Metric label="Paid" value={money(paid.reduce((sum, invoice) => sum + Number(invoice.amount), 0))} foot={`${paid.length} settled invoices`} icon="✓" positive />
    </div>
    <section className="panel table-panel invoice-list-panel">
      <div className="list-toolbar invoice-toolbar">
        <div><b>Invoices</b><span>{filtered.length} shown · balances update as payments are recorded</span></div>
        <label className="filter-select">Show<select value={filter} onChange={event => setFilter(event.target.value)}>{filters.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <InvoiceTable data={filtered} {...tableProps} />
    </section>
  </>;
}

function InvoiceTable({ data, compact, isCustomer, onRecordPayment, onConfirmInvoice, onCancelInvoice, onSendInvoice, onRemindInvoice, token }) {
  const [paying, setPaying] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(null);
  const openPayment = invoice => {
    setPaying(invoice);
    setAmount(String(invoice.amount_due ?? invoice.amount));
    setReference(invoice.id);
    setError('');
  };
  const submitPayment = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onRecordPayment(paying.record_id, {
        amount: Number(amount),
        method,
        payment_date: new Date().toISOString().slice(0, 10),
        reference: reference || null,
        note: null,
      });
      setPaying(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const performAction = async (invoice, action) => {
    setError('');
    setMessage('');
    if (action === 'cancel') {
      const reason = window.prompt(`Why are you cancelling ${invoice.id}?`);
      if (!reason?.trim()) return;
      setWorking(`${invoice.id}:cancel`);
      try {
        await onCancelInvoice(invoice.record_id, reason.trim());
        setMessage(`${invoice.id} was cancelled.`);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setWorking(null);
      }
      return;
    }
    if (action === 'print') {
      setWorking(`${invoice.id}:print`);
      try {
        await printInvoice(token, invoice.record_id);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setWorking(null);
      }
      return;
    }
    const callback = action === 'confirm' ? onConfirmInvoice : action === 'send' ? onSendInvoice : onRemindInvoice;
    setWorking(`${invoice.id}:${action}`);
    try {
      await callback(invoice.record_id);
      setMessage(action === 'confirm' ? `${invoice.id} confirmed.` : `${action === 'send' ? 'Invoice' : 'Reminder'} for ${invoice.id} queued for email.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };
  const showActions = !compact && (onRecordPayment || onConfirmInvoice || onCancelInvoice || onSendInvoice || onRemindInvoice || token);
  return <>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="signup-success" role="status">{message}</p>}
    <div className="table-wrap"><table><thead><tr><th>INVOICE</th>{!compact && !isCustomer && <th>CUSTOMER</th>}<th>ISSUED</th>{!compact && <th>DUE DATE</th>}<th>TOTAL</th>{!compact && <><th>PAID</th><th>BALANCE DUE</th></>}<th>STATUS</th>{showActions && <th>ACTION</th>}</tr></thead><tbody>{data.length ? data.map(i => <tr key={i.id}><td><span className="record-link">{i.id}</span></td>{!compact && !isCustomer && <td>{i.customer}</td>}<td>{i.date}</td>{!compact && <td>{i.due}</td>}<td>{money(i.amount)}</td>{!compact && <><td>{money(i.amount_paid)}</td><td className={Number(i.amount_due) > 0 ? 'amount-due' : ''}>{money(i.amount_due)}</td></>}<td><Badge>{i.is_overdue ? 'Overdue' : i.status}</Badge></td>{showActions && <td className="row-actions">{token && <button className="button secondary small" disabled={working !== null} onClick={() => performAction(i, 'print')}>{working === `${i.id}:print` ? 'Preparing…' : 'Print / PDF'}</button>}{i.status === 'Draft' && onConfirmInvoice && <button className="button primary small" disabled={working !== null} onClick={() => performAction(i, 'confirm')}>{working === `${i.id}:confirm` ? 'Confirming…' : 'Confirm'}</button>}{i.status === 'Confirmed' && onRecordPayment && <button className="button secondary small" onClick={() => openPayment(i)}>Record payment</button>}{i.status === 'Confirmed' && onSendInvoice && <button className="button secondary small" disabled={working !== null} onClick={() => performAction(i, 'send')}>Send</button>}{i.status === 'Confirmed' && onRemindInvoice && <button className="button secondary small" disabled={working !== null} onClick={() => performAction(i, 'remind')}>Reminder</button>}{['Draft', 'Confirmed'].includes(i.status) && Number(i.amount_paid || 0) === 0 && onCancelInvoice && <button className="button danger small" disabled={working !== null} onClick={() => performAction(i, 'cancel')}>{working === `${i.id}:cancel` ? 'Cancelling…' : 'Cancel'}</button>}</td>}</tr>) : <tr><td colSpan={compact ? (isCustomer ? 4 : 5) : (isCustomer ? (showActions ? 8 : 7) : showActions ? 9 : 8)} className="table-empty">No invoices match this filter.</td></tr>}</tbody></table></div>
    {paying && <form className="panel plan-form" onSubmit={submitPayment}>
      <h2>Record payment for {paying.id}</h2>
      <div className="plan-form-grid">
        <label>Amount (INR)<input type="number" min="0.01" max={paying.amount_due || paying.amount} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>Payment method<select value={method} onChange={event => setMethod(event.target.value)}><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
        <label>Reference<input maxLength={200} value={reference} onChange={event => setReference(event.target.value)} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Recording…' : 'Record payment'}</button><button type="button" className="button secondary" onClick={() => setPaying(null)}>Cancel</button></div>
    </form>}
  </>;
}
function CustomerTable({ data, isAdmin, onDeactivate, onReactivate }) {
  const [working, setWorking] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const setAccountActive = async (customer, active) => {
    if (!customer.user_id || customer.account_active === active) return;
    if (!active && !window.confirm(`Delete ${customer.name}'s login access? Their financial records will be retained, and access can be restored later.`)) return;
    setWorking(customer.user_id);
    setError('');
    setMessage('');
    try {
      await (active
        ? onReactivate(customer.user_id, customer.user_updated_at)
        : onDeactivate(customer.user_id, customer.user_updated_at));
      setMessage(active
        ? `${customer.name}'s login access was restored.`
        : `${customer.name}'s login access was removed. Financial records remain available.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };
  return <section className="panel table-panel">
    <div className="list-toolbar"><div><b>{data.length} customers</b><span>Search by name, company, or email using the page search.</span></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="signup-success" role="status">{message}</p>}
    <div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>EMAIL</th><th>SUBSCRIPTIONS</th><th>OUTSTANDING</th>{isAdmin && <th>ACCOUNT</th>}</tr></thead><tbody>{data.length ? data.map(customer => <tr key={customer.email}>
      <td><span className="table-avatar">{customer.name.split(' ').map(x => x[0]).join('')}</span><b>{customer.name}</b></td><td>{customer.company}</td><td>{customer.email}</td><td>{customer.subscriptions}</td><td>{money(customer.balance)}</td>
      {isAdmin && <td className="account-actions">{customer.user_id ? <><Badge>{customer.account_active ? 'Active' : 'Inactive'}</Badge><button className={`button small ${customer.account_active ? 'danger' : 'secondary'}`} disabled={working !== null} onClick={() => setAccountActive(customer, !customer.account_active)}>{working === customer.user_id ? 'Updating…' : customer.account_active ? 'Delete account' : 'Restore access'}</button></> : <span className="muted">No login account</span>}</td>}
    </tr>) : <tr><td colSpan={isAdmin ? 6 : 5} className="table-empty">No customers found.</td></tr>}</tbody></table></div>
    {isAdmin && <p className="permission-note">Delete account removes login access only. Customer, subscription, invoice, and payment records are retained; admins can restore access later.</p>}
  </section>;
}
function Marketplace({ plans, onSubscribe, onNavigate }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const subscribe = async plan => {
    setLoadingPlan(plan.id);
    setMessage('');
    setError('');
    try {
      const result = await onSubscribe(plan.id);
      setMessage(`Subscription requested. Invoice ${result.invoice.number} has been created and emailed to you.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingPlan(null);
    }
  };
  return <>
    {message && <p className="signup-success" role="status">{message} <button type="button" onClick={() => onNavigate('Invoices')}>View invoices</button></p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {plans.length ? <div className="marketplace-grid">{plans.map(plan => <article className="panel marketplace-card" key={plan.id}>
      <span className="eyebrow">BRIGHTLOOP PLAN</span>
      <h2>{plan.name}</h2>
      <div className="marketplace-price">{money(Number(plan.price) * plan.min_quantity)}<span> / {plan.period.toLowerCase()}</span></div>
      <p>Minimum quantity: {plan.min_quantity}</p>
      {plan.available_to && <p>Available until {plan.available_to}</p>}
      <button className="button primary" disabled={loadingPlan !== null} onClick={() => subscribe(plan)}>
        {loadingPlan === plan.id ? 'Requesting…' : 'Request subscription'}
      </button>
    </article>)}</div> : <section className="panel marketplace-empty"><h2>No plans available right now</h2><p>Check back later or contact Brightloop for help.</p></section>}
    <p className="permission-note">Requesting a plan creates an invoice. Your subscription becomes active after payment is recorded.</p>
  </>;
}
function PaymentInstructions({ instructions }) { return <section className="panel payment-instructions"><h2>Payment instructions</h2>{instructions?.upiId ? <><p>Pay via your UPI app to <b>{instructions.payeeName}</b>.</p><p className="upi-id">{instructions.upiId}</p><p>Include the invoice number as your payment reference. Your payment will be matched and recorded by the Brightloop team; this page does not confirm payments automatically.</p></> : <p>Contact Brightloop billing for UPI or bank-transfer instructions. Include your invoice number as the payment reference. Payments are confirmed after the team records them.</p>}</section>; }
function Profile({ user, customer, isCustomer, onSave, onChangePassword }) {
  const [values, setValues] = useState({
    name: customer?.name || user.name,
    company_name: customer?.company || '',
    phone: customer?.phone || '',
    address_line1: customer?.address_line1 || '',
    address_line2: customer?.address_line2 || '',
    city: customer?.city || '',
    state: customer?.state || '',
    postal_code: customer?.postal_code || '',
    country: customer?.country || 'IN',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await onSave(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value || null])));
      setMessage('Your billing profile has been updated.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const submitPassword = async event => {
    event.preventDefault();
    setPasswordError('');
    if (newPassword !== confirmPassword) {
      setPasswordError('The passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    try {
      await onChangePassword(currentPassword, newPassword);
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setPasswordSaving(false);
    }
  };
  return <section className="panel profile-panel">
    <div className="profile-large">{user.name.split(' ').map(x => x[0]).join('')}</div>
    <div><span className="eyebrow">ACCOUNT PROFILE</span><h2>{user.name}</h2><p>{user.email}</p><p>{user.role === 'customer' ? `Customer account${customer?.company ? ` · ${customer.company}` : ''}` : `${user.role[0].toUpperCase()}${user.role.slice(1)} account`}</p></div>
    {isCustomer && <form className="profile-form" onSubmit={submit}><h3>Billing details</h3><div className="plan-form-grid">{[['name', 'Full name'], ['company_name', 'Company'], ['phone', 'Phone'], ['address_line1', 'Address line 1'], ['address_line2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['postal_code', 'Postal code'], ['country', 'Country code']].map(([key, label]) => <label key={key}>{label}<input maxLength={key === 'country' ? 2 : 200} required={key === 'name' || key === 'country'} value={values[key] || ''} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div>{message && <p className="signup-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save billing details'}</button></form>}
    <form className="profile-form" onSubmit={submitPassword}>
      <h3>Change password</h3>
      <div className="plan-form-grid">
        <label>Current password<input type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type="password" autoComplete="new-password" minLength={9} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength={9} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>
      </div>
      <p className="auth-hint">Use at least 9 characters with uppercase, lowercase, and a symbol.</p>
      {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
      <button className="button primary" disabled={passwordSaving}>{passwordSaving ? 'Updating…' : 'Change password'}</button>
    </form>
  </section>;
}
function Payments({ data, isCustomer, invoices = [] }) {
  const collected = data.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const currentMonth = new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  const receivedThisMonth = data
    .filter(payment => payment.date?.includes(currentMonth))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pendingInvoices = invoices.filter(invoice => invoice.status === 'Confirmed');
  const outstanding = pendingInvoices.reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0);
  return <>
    <div className="metric-grid four">
      <Metric label="Received this month" value={money(receivedThisMonth)} foot={`${data.length} transactions · lifetime ${money(collected)}`} icon="↗" positive />
      <Metric label="Pending balance" value={money(outstanding)} foot={`${pendingInvoices.length} invoices awaiting payment`} icon="◷" warning={outstanding > 0} />
      <Metric label="Overdue balance" value={money(invoices.filter(invoice => invoice.is_overdue).reduce((sum, invoice) => sum + Number(invoice.amount_due || 0), 0))} foot={`${invoices.filter(invoice => invoice.is_overdue).length} invoices past due`} icon="!" warning={invoices.some(invoice => invoice.is_overdue)} />
      <Metric label="Latest payment" value={data[0] ? money(data[0].amount) : money(0)} foot={data[0] ? `${data[0].date} · ${data[0].method}` : 'No payments recorded'} icon="▤" />
    </div>
    <section className="panel table-panel">
      <div className="list-toolbar"><div><b>Payment history</b><span>Each row is a payment received against an invoice.</span></div></div>
      <div className="table-wrap"><table><thead><tr><th>PAYMENT</th><th>INVOICE</th>{!isCustomer && <th>CUSTOMER</th>}<th>DATE</th><th>METHOD</th><th>AMOUNT RECEIVED</th></tr></thead><tbody>{data.length ? data.map(payment => <tr key={payment.id}><td><span className="record-link">{payment.id}</span></td><td>{payment.invoice}</td>{!isCustomer && <td>{payment.customer}</td>}<td>{payment.date}</td><td>{payment.method}</td><td className="payment-amount">{money(payment.amount)}</td></tr>) : <tr><td colSpan={isCustomer ? 5 : 6} className="table-empty">No payments recorded yet. Payments appear here after they are received and entered.</td></tr>}</tbody></table></div>
    </section>
  </>;
}
function VariantManager({ product, onCreate, onUpdate }) {
  const [values, setValues] = useState({ attribute: 'Variant', value: '', extra_price: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await onCreate(product.id, { ...values, extra_price: Number(values.extra_price) });
      setValues({ attribute: 'Variant', value: '', extra_price: '' });
      setMessage('Variant added. Its price adjustment will be copied into new quotations.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async variant => {
    try {
      await onUpdate(product.id, variant.id, { ...variant, extra_price: Number(variant.extra_price), is_active: false });
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  if (!product) return null;
  return <section className="panel table-panel">
    <PanelTitle title={`${product.name} variants`} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="signup-success" role="status">{message}</p>}
    <div className="table-wrap"><table><thead><tr><th>ATTRIBUTE</th><th>VALUE</th><th>EXTRA PRICE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{product.variants.map(variant => <tr key={variant.id}><td>{variant.attribute}</td><td>{variant.value}</td><td>{money(variant.extra_price)}</td><td><Badge>{variant.is_active ? 'Active' : 'Inactive'}</Badge></td><td>{variant.is_active && <button className="button danger small" onClick={() => deactivate(variant)}>Deactivate</button>}</td></tr>)}{!product.variants.length && <tr><td colSpan="5" className="table-empty">No variants configured.</td></tr>}</tbody></table></div>
    <form className="plan-form" onSubmit={submit}><h3>Add product variant</h3><div className="plan-form-grid"><label>Attribute<input required maxLength={80} value={values.attribute} onChange={event => setValues({ ...values, attribute: event.target.value })} /></label><label>Value<input required maxLength={120} value={values.value} onChange={event => setValues({ ...values, value: event.target.value })} /></label><label>Additional price (INR)<input type="number" min="0" step="0.01" required value={values.extra_price} onChange={event => setValues({ ...values, extra_price: event.target.value })} /></label></div><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Add variant'}</button></form>
  </section>;
}
function Catalog({ isAdmin, products, plans, taxes, onCreatePlan, onUpdatePlan, onCreateProduct, onUpdateProduct, onCreateVariant, onUpdateVariant, onCreateTax, onUpdateTax, onDeactivate }) {
  const localToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  };
  const [activeTab, setActiveTab] = useState('products');
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deactivatingId, setDeactivatingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedVariantProductId, setSelectedVariantProductId] = useState(null);
  const [product, setProduct] = useState({ name: '', type: 'software', sales_price: '', cost_price: '0', tax_id: '', notes: '' });
  const [tax, setTax] = useState({ name: '', kind: 'percentage', rate: '' });
  const [plan, setPlan] = useState({
    name: '',
    price: '',
    billing_period: 'monthly',
    min_quantity: '1',
    available_from: localToday(),
    available_to: '',
    auto_close: false,
    is_closable: true,
    is_pausable: false,
    is_renewable: true,
  });
  const update = event => {
    const { name, value, checked, type } = event.target;
    setPlan(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  };
  const saveCatalogRecord = async (event, save, payload, success) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const created = await save(payload);
      setMessage(success(created));
      setFormOpen(false);
      setEditingRecord(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const savePlan = async event => {
    const save = editingRecord
      ? payload => onUpdatePlan(editingRecord.id, payload)
      : onCreatePlan;
    await saveCatalogRecord(event, save, {
        ...plan,
        price: Number(plan.price),
        min_quantity: Number(plan.min_quantity),
        available_to: plan.available_to || null,
      }, created => editingRecord ? `${created.name} was updated.` : `${created.name} is now available to customers.`);
  };
  const editRecord = (tab, item) => {
    setActiveTab(tab);
    setEditingRecord(item);
    setFormOpen(true);
    setError('');
    if (tab === 'products') setProduct({
      name: item.name, type: item.type, sales_price: String(item.price),
      cost_price: String(item.cost ?? 0), tax_id: item.tax_id ? String(item.tax_id) : '',
      notes: item.notes || '',
    });
    if (tab === 'plans') setPlan({
      name: item.name, price: String(item.price), billing_period: item.billing_period,
      min_quantity: String(item.min_quantity), available_from: item.available_from,
      available_to: item.available_to || '', auto_close: item.auto_close,
      is_closable: item.is_closable, is_pausable: item.is_pausable,
      is_renewable: item.is_renewable,
    });
    if (tab === 'taxes') setTax({ name: item.name, kind: item.kind, rate: String(item.rate) });
  };
  const deactivateRecord = async (type, item) => {
    if (!window.confirm(`Delete "${item.name}"? It will be deactivated and kept for historical records.`)) return;
    setDeactivatingId(`${type}-${item.id}`);
    setError('');
    setMessage('');
    try {
      await onDeactivate(type, item.id);
      setMessage(`${item.name} was deactivated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeactivatingId(null);
    }
  };
  const cancelEdit = () => {
    setFormOpen(false);
    setEditingRecord(null);
  };
  const addRecord = () => {
    setEditingRecord(null);
    setError('');
    if (activeTab === 'products') setProduct({ name: '', type: 'software', sales_price: '', cost_price: '0', tax_id: '', notes: '' });
    if (activeTab === 'plans') setPlan({
      name: '', price: '', billing_period: 'monthly', min_quantity: '1',
      available_from: localToday(), available_to: '', auto_close: false,
      is_closable: true, is_pausable: false, is_renewable: true,
    });
    if (activeTab === 'taxes') setTax({ name: '', kind: 'percentage', rate: '' });
    setFormOpen(true);
  };
  const tabInfo = {
    products: { label: 'Products', count: products.length },
    plans: { label: 'Plans', count: plans.length },
    taxes: { label: 'Taxes', count: taxes.length },
  };
  const newLabel = { products: 'product', plans: 'plan', taxes: 'tax' }[activeTab];
  return <>
  <div className="subtabs">{Object.entries(tabInfo).map(([key, info]) => <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => { setActiveTab(key); setFormOpen(false); setError(''); }}>{info.label} <span>{info.count}</span></button>)}</div>
  {message && <p className="signup-success" role="status">{message}</p>}
  {error && <p className="form-error" role="alert">{error}</p>}
  {isAdmin && <div className="list-toolbar"><span>{activeTab === 'plans' ? 'Plans offered in the customer marketplace' : `Manage ${activeTab}`}</span><button className="button primary small" onClick={addRecord}>＋ Add {newLabel}</button></div>}
  {formOpen && activeTab === 'plans' && <form className="panel plan-form" onSubmit={savePlan}>
    <h2>{editingRecord ? 'Edit subscription plan' : 'New subscription plan'}</h2>
    <div className="plan-form-grid">
      <label>Plan name<input name="name" value={plan.name} onChange={update} required maxLength={160} /></label>
      <label>Price (INR)<input name="price" type="number" min="0" step="0.01" value={plan.price} onChange={update} required /></label>
      <label>Billing period<select name="billing_period" value={plan.billing_period} onChange={update}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
      <label>Minimum quantity<input name="min_quantity" type="number" min="1" step="1" value={plan.min_quantity} onChange={update} required /></label>
      <label>Available from<input name="available_from" type="date" value={plan.available_from} onChange={update} required /></label>
      <label>Available to (optional)<input name="available_to" type="date" value={plan.available_to} onChange={update} /></label>
    </div>
    <div className="plan-flags">
      <label><input name="is_renewable" type="checkbox" checked={plan.is_renewable} onChange={update} /> Renewable</label>
      <label><input name="is_closable" type="checkbox" checked={plan.is_closable} onChange={update} /> Can close early</label>
      <label><input name="is_pausable" type="checkbox" checked={plan.is_pausable} onChange={update} /> Can pause</label>
      <label><input name="auto_close" type="checkbox" checked={plan.auto_close} onChange={update} /> Close automatically at expiry</label>
    </div>
    <div className="form-actions"><button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : editingRecord ? 'Save changes' : 'Publish plan'}</button><button type="button" className="button secondary" onClick={cancelEdit}>Cancel</button></div>
  </form>}
  {formOpen && activeTab === 'products' && <form className="panel plan-form" onSubmit={event => saveCatalogRecord(event, editingRecord ? payload => onUpdateProduct(editingRecord.id, payload) : onCreateProduct, { name: product.name, type: product.type, sales_price: Number(product.sales_price), cost_price: Number(product.cost_price), tax_id: product.tax_id || null, notes: product.notes || null }, created => editingRecord ? `${created.name} was updated.` : `${created.name} was added to the catalog.`)}>
    <h2>{editingRecord ? 'Edit product' : 'New product'}</h2><div className="plan-form-grid">
      <label>Product name<input required maxLength={160} value={product.name} onChange={event => setProduct({ ...product, name: event.target.value })} /></label>
      <label>Type<select value={product.type} onChange={event => setProduct({ ...product, type: event.target.value })}><option value="software">Software</option><option value="service">Service</option><option value="add_on">Add-on</option><option value="goods">Goods</option></select></label>
      <label>Sales price (INR)<input type="number" min="0" step="0.01" required value={product.sales_price} onChange={event => setProduct({ ...product, sales_price: event.target.value })} /></label>
      <label>Cost price (INR)<input type="number" min="0" step="0.01" required value={product.cost_price} onChange={event => setProduct({ ...product, cost_price: event.target.value })} /></label>
      <label>Default tax<select value={product.tax_id} onChange={event => setProduct({ ...product, tax_id: event.target.value })}><option value="">No default tax</option>{taxes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Notes<input maxLength={2000} value={product.notes} onChange={event => setProduct({ ...product, notes: event.target.value })} /></label>
    </div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : editingRecord ? 'Save changes' : 'Create product'}</button><button type="button" className="button secondary" onClick={cancelEdit}>Cancel</button></div>
  </form>}
  {formOpen && activeTab === 'taxes' && <form className="panel plan-form" onSubmit={event => saveCatalogRecord(event, editingRecord ? payload => onUpdateTax(editingRecord.id, payload) : onCreateTax, { ...tax, rate: Number(tax.rate) }, created => editingRecord ? `${created.name} was updated.` : `${created.name} was added.`)}>
    <h2>{editingRecord ? 'Edit tax' : 'New tax'}</h2><div className="plan-form-grid">
      <label>Tax name<input required maxLength={160} value={tax.name} onChange={event => setTax({ ...tax, name: event.target.value })} /></label>
      <label>Type<select value={tax.kind} onChange={event => setTax({ ...tax, kind: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed per unit</option></select></label>
      <label>Rate<input type="number" min="0" max={tax.kind === 'percentage' ? '100' : undefined} step="0.0001" required value={tax.rate} onChange={event => setTax({ ...tax, rate: event.target.value })} /></label>
    </div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : editingRecord ? 'Save changes' : 'Create tax'}</button><button type="button" className="button secondary" onClick={cancelEdit}>Cancel</button></div>
  </form>}
  {activeTab === 'products' && <><section className="panel table-panel"><PanelTitle title="Products" /><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>SALES PRICE</th>{isAdmin && <th>COST PRICE</th>}<th>VARIANTS</th><th>STATUS</th>{isAdmin && <th>ACTIONS</th>}</tr></thead><tbody>{products.length ? products.map(item => <tr key={item.id}><td><span className="product-icon">◇</span><b>{item.name}</b></td><td>{item.type.replaceAll('_', ' ')}</td><td>{money(item.price)}</td>{isAdmin && <td>{money(item.cost)}</td>}<td>{item.variant}</td><td><Badge>{item.status}</Badge></td>{isAdmin && <td className="row-actions"><button className="button secondary small" onClick={() => editRecord('products', item)}>Edit</button><button className="button secondary small" onClick={() => setSelectedVariantProductId(selectedVariantProductId === item.id ? null : item.id)}>Variants</button><button className="button danger small" title="Deactivate; historical records are retained" disabled={item.status !== 'Active' || deactivatingId !== null} onClick={() => deactivateRecord('product', item)}>{deactivatingId === `product-${item.id}` ? 'Deleting…' : 'Delete'}</button></td>}</tr>) : <tr><td colSpan={isAdmin ? 7 : 5} className="table-empty">No products found.</td></tr>}</tbody></table></div></section>{isAdmin && selectedVariantProductId && <VariantManager product={products.find(item => String(item.id) === String(selectedVariantProductId))} onCreate={onCreateVariant} onUpdate={onUpdateVariant} />}</>}
  {activeTab === 'plans' && <section className="panel table-panel"><PanelTitle title="Plans" /><div className="table-wrap"><table><thead><tr><th>PLAN</th><th>PRICE</th><th>BILLING PERIOD</th><th>MINIMUM QUANTITY</th><th>AVAILABLE FROM</th><th>STATUS</th>{isAdmin && <th>ACTIONS</th>}</tr></thead><tbody>{plans.length ? plans.map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{money(item.price)}</td><td>{item.period}</td><td>{item.min_quantity}</td><td>{item.available_from}</td><td><Badge>{item.status}</Badge></td>{isAdmin && <td className="row-actions"><button className="button secondary small" onClick={() => editRecord('plans', item)}>Edit</button><button className="button danger small" disabled={item.status !== 'Active' || deactivatingId !== null} onClick={() => deactivateRecord('plan', item)}>{deactivatingId === `plan-${item.id}` ? 'Deleting…' : 'Delete'}</button></td>}</tr>) : <tr><td colSpan={isAdmin ? 7 : 6} className="table-empty">No plans found.</td></tr>}</tbody></table></div></section>}
  {activeTab === 'taxes' && <section className="panel table-panel"><PanelTitle title="Taxes" /><div className="table-wrap"><table><thead><tr><th>TAX</th><th>TYPE</th><th>RATE</th><th>STATUS</th>{isAdmin && <th>ACTIONS</th>}</tr></thead><tbody>{taxes.length ? taxes.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.kind}</td><td>{item.kind === 'percentage' ? `${item.rate}%` : money(item.rate)}</td><td><Badge>{item.status}</Badge></td>{isAdmin && <td className="row-actions"><button className="button secondary small" onClick={() => editRecord('taxes', item)}>Edit</button><button className="button danger small" disabled={item.status !== 'Active' || deactivatingId !== null} onClick={() => deactivateRecord('tax', item)}>{deactivatingId === `tax-${item.id}` ? 'Deleting…' : 'Delete'}</button></td>}</tr>) : <tr><td colSpan={isAdmin ? 5 : 4} className="table-empty">No taxes found.</td></tr>}</tbody></table></div></section>}
  <div className="info-strip">Prices are shown in INR. Staff can view catalog details but cannot change prices or plan settings.</div>
</>; }
function Finance({ isAdmin, summary, invoices }) { const outstanding = invoices.filter(invoice => invoice.status === 'Confirmed'); return <>
  <div className="metric-grid four"><Metric label="Revenue collected" value={money(summary.revenue_this_month)} foot="Payments received this month" /><Metric label="Outstanding" value={money(summary.outstanding_amount)} foot={`${outstanding.length} confirmed invoices`} /><Metric label="Overdue" value={money(summary.overdue_amount)} foot={`${summary.overdue_invoices || 0} invoices past due`} warning={Boolean(summary.overdue_invoices)} /><Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Current active subscriptions" /></div>
  <section className="panel table-panel"><PanelTitle title="Outstanding invoices" /><InvoiceTable data={outstanding} /></section>
  {!isAdmin && <p className="permission-note">Finance view is read-only. Cost price and margin data are restricted.</p>}
</>; }
function Statistics({ token, refreshKey, summary, growth, monthlyRevenue, missingInvoices, latestBillingRun, onNavigate, onRunBilling, isAdmin }) {
  const previous = Number(growth?.previous_month_revenue || 0);
  const current = Number(growth?.current_month_revenue || 0);
  const change = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reconciliation, setReconciliation] = useState(null);
  const [billingRuns, setBillingRuns] = useState([]);
  useEffect(() => {
    if (!isAdmin) return;
    setError('');
    Promise.all([api.billingReconciliation(token), api.billingRuns(token)])
      .then(([checks, runs]) => {
        setReconciliation(checks);
        setBillingRuns(runs);
      })
      .catch(requestError => setError(requestError.message));
  }, [token, isAdmin, latestBillingRun?.id, refreshKey]);
  const run = async () => {
    setRunning(true);
    setError('');
    setMessage('');
    try {
      const result = await onRunBilling();
      setMessage(`Billing run ${result.status}: ${result.invoiced_count} invoices generated, ${result.failed_count} failures.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRunning(false);
    }
  };
  return <>
    <div className="metric-grid four">
      <Metric label="Revenue this month" value={money(current)} foot="Collected payments, month to date" icon="↗" />
      <Metric label="Month-over-month" value={change === null ? (current > 0 ? 'New revenue' : '—') : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`} foot={`Previous month: ${money(previous)}`} icon="▥" positive={change !== null && change >= 0} warning={change !== null && change < 0} />
      <Metric label="New customers" value={growth?.new_customers_this_month || 0} foot="Created this month" icon="◉" />
      <Metric label="New subscriptions" value={growth?.new_subscriptions_this_month || 0} foot="Created this month" icon="↻" />
    </div>
    {isAdmin && <div className="list-toolbar"><span>Billing controls operate on subscriptions due up to today; missed periods are caught up safely.</span><button className="button primary small" disabled={running} onClick={run}>{running ? 'Billing…' : 'Run billing now'}</button></div>}
    {message && <p className="signup-success" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {isAdmin && latestBillingRun && <section className="panel table-panel"><PanelTitle title="Billing run monitoring" action={`${latestBillingRun.status} · ${latestBillingRun.run_type}`} /><p>Started {new Date(latestBillingRun.started_at).toLocaleString()} · {latestBillingRun.due_count} due subscriptions · {latestBillingRun.invoiced_count} invoices · {latestBillingRun.failed_count} failures.</p>{latestBillingRun.errors?.length > 0 && <div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th><th>CODE</th><th>DETAIL</th></tr></thead><tbody>{latestBillingRun.errors.map((item, index) => <tr key={`${item.subscription_id || 'run'}-${index}`}><td>{item.subscription_id || 'Run'}</td><td>{item.code}</td><td>{item.message}</td></tr>)}</tbody></table></div>}</section>}
    {isAdmin && <section className="panel table-panel"><PanelTitle title="Billing run history" badge={`${billingRuns.length} RUNS`} /><div className="table-wrap"><table><thead><tr><th>RUN DATE</th><th>STARTED</th><th>TYPE</th><th>STATUS</th><th>DUE</th><th>INVOICED</th><th>FAILED</th></tr></thead><tbody>{billingRuns.length ? billingRuns.map(run => <tr key={run.id}><td>{run.run_date}</td><td>{new Date(run.started_at).toLocaleString()}</td><td>{run.run_type}</td><td><Badge>{run.status}</Badge></td><td>{run.due_count}</td><td>{run.invoiced_count}</td><td>{run.failed_count}</td></tr>) : <tr><td colSpan="7" className="table-empty">No billing runs have been recorded.</td></tr>}</tbody></table></div></section>}
    <section className="panel table-panel">
      <PanelTitle title="Company revenue trend" action="Collected payments · INR" />
      <div className="table-wrap"><table><thead><tr><th>MONTH</th><th>COLLECTED REVENUE</th></tr></thead><tbody>{monthlyRevenue.map((item, index) => <tr key={`${item.month}-${index}`}><td>{item.month}</td><td>{money(item.amount)}</td></tr>)}</tbody></table></div>
      <p className="permission-note">Revenue is cash collected from recorded payments, not booked invoice value. Month-over-month compares this month to the prior calendar month.</p>
    </section>
    {isAdmin && reconciliation && <section className="panel table-panel"><PanelTitle title="Reconciliation checks" /><div className="metric-grid four"><Metric label="Invoice total mismatches" value={reconciliation.invoiceTotals.length} foot="Invoice header vs line totals" warning={Boolean(reconciliation.invoiceTotals.length)} /><Metric label="Payment mismatches" value={reconciliation.paymentTotals.length} foot="Paid amount vs payment ledger" warning={Boolean(reconciliation.paymentTotals.length)} /><Metric label="Due subscriptions" value={reconciliation.dueSubscriptions.length} foot="No invoice on the due date" warning={Boolean(reconciliation.dueSubscriptions.length)} /><Metric label="Cancelled attempts" value={missingInvoices.reduce((total, item) => total + Number(item.cancelled_invoice_count || 0), 0)} foot="Cancelled invoices for due periods" /></div><p className="permission-note">Lists are capped at the 100 most recent issues per check; zero values mean the current checks reconcile.</p></section>}
    <section className="panel table-panel">
      <PanelTitle title="Invoices not generated" badge={`${missingInvoices.length} MISSING`} />
      <p className="permission-note">A missing invoice is an active subscription whose next billing date is due, but no non-cancelled invoice exists for that period. Cancelled invoices are listed so the team can decide whether to reissue.</p>
      <div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th><th>CUSTOMER</th><th>PLAN</th><th>EXPECTED BILLING DATE</th><th>CANCELLED ATTEMPTS</th><th>ACTION</th></tr></thead><tbody>{missingInvoices.length ? missingInvoices.map(item => <tr key={item.record_id}><td>{item.number}</td><td>{item.customer}</td><td>{item.plan}</td><td>{item.due_date}</td><td>{item.cancelled_invoice_count}</td><td><button className="button secondary small" onClick={() => onNavigate('Subscriptions')}>Review</button></td></tr>) : <tr><td colSpan="6" className="table-empty">No due subscriptions are missing an invoice.</td></tr>}</tbody></table></div>
    </section>
    <div className="metric-grid four"><Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Current subscriptions" icon="↻" /><Metric label="Monthly recurring revenue" value={money(summary.mrr)} foot="Normalized active plan value" icon="▥" /><Metric label="Outstanding invoices" value={money(summary.outstanding_amount)} foot="Confirmed invoice balances" icon="◷" /><Metric label="Overdue invoices" value={summary.overdue_invoices || 0} foot={`${money(summary.overdue_amount)} outstanding past due`} icon="!" warning={Boolean(summary.overdue_invoices)} /></div>
  </>;
}
function QuotationTemplates({ data, products, plans, isAdmin, onSave, onDeactivate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [values, setValues] = useState({ name: '', plan_id: '', validity_days: '30', notes: '', lines: [{ product_id: '', variant_id: '', quantity: '1' }] });
  const setLine = (index, key, value) => setValues(current => ({
    ...current,
    lines: current.lines.map((line, i) => i === index ? { ...line, [key]: value } : line),
  }));
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...values,
        plan_id: values.plan_id,
        validity_days: Number(values.validity_days),
        notes: values.notes || null,
        lines: values.lines.map(line => ({
          product_id: line.product_id,
          variant_id: line.variant_id || null,
          quantity: Number(line.quantity),
        })),
      };
      const result = await onSave(payload, editingId);
      setMessage(`${result.name} was ${editingId ? 'updated' : 'saved'}.`);
      setOpen(false);
      setEditingId(null);
      setValues({ name: '', plan_id: '', validity_days: '30', notes: '', lines: [{ product_id: '', variant_id: '', quantity: '1' }] });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async template => {
    if (!window.confirm(`Deactivate quotation template "${template.name}"? Existing quotations are unchanged.`)) return;
    setBusy(template.id);
    setError('');
    try {
      await onDeactivate(template.id);
      setMessage(`${template.name} was deactivated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(null);
    }
  };
  const edit = template => {
    setEditingId(template.id);
    setValues({
      name: template.name,
      plan_id: String(template.plan_id),
      validity_days: String(template.validity_days),
      notes: template.notes || '',
      lines: template.lines.map(line => ({
        product_id: String(line.product_id),
        variant_id: line.variant_id ? String(line.variant_id) : '',
        quantity: String(line.quantity),
      })),
    });
    setError('');
    setMessage('');
    setOpen(true);
  };
  const closeForm = () => {
    setOpen(false);
    setEditingId(null);
    setValues({ name: '', plan_id: '', validity_days: '30', notes: '', lines: [{ product_id: '', variant_id: '', quantity: '1' }] });
  };
  return <>
    <section className="panel table-panel">
      <div className="list-toolbar"><b>{data.filter(item => item.is_active).length} active quotation templates</b><button className="button primary small" onClick={() => { closeForm(); setOpen(true); }}>＋ New template</button></div>
      {message && <p className="signup-success" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>TEMPLATE</th><th>PLAN</th><th>VALID FOR</th><th>PRODUCT LINES</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.length ? data.map(template => <tr key={template.id}><td><b>{template.name}</b></td><td>{template.plan}</td><td>{template.validity_days} days</td><td>{template.lines.map(line => `${line.product} × ${line.quantity}`).join(', ') || '—'}</td><td><Badge>{template.is_active ? 'Active' : 'Inactive'}</Badge></td><td>{template.is_active && <div className="row-actions"><button className="button secondary small" onClick={() => edit(template)}>Edit</button><button className="button danger small" disabled={busy !== null} onClick={() => deactivate(template)}>{busy === template.id ? 'Saving…' : 'Deactivate'}</button></div>}</td></tr>) : <tr><td colSpan="6" className="table-empty">No quotation templates yet.</td></tr>}</tbody></table></div>
    </section>
    {open && <form className="panel plan-form" onSubmit={submit}>
      <h2>{editingId ? 'Edit quotation template' : 'Create a quotation template'}</h2>
      <div className="plan-form-grid">
        <label>Template name<input required maxLength={160} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /></label>
        <label>Plan<select required value={values.plan_id} onChange={event => setValues({ ...values, plan_id: event.target.value })}><option value="">Select a plan</option>{plans.filter(plan => plan.status === 'Active').map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        <label>Validity (days)<input type="number" min="1" max="365" required value={values.validity_days} onChange={event => setValues({ ...values, validity_days: event.target.value })} /></label>
        <label>Notes<input maxLength={2000} value={values.notes} onChange={event => setValues({ ...values, notes: event.target.value })} /></label>
      </div>
      {values.lines.map((line, index) => <div className="plan-form-grid" key={index}>
        <label>Product<select required value={line.product_id} onChange={event => setLine(index, 'product_id', event.target.value)}><option value="">Select product</option>{products.filter(product => product.status === 'Active').map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Variant<select value={line.variant_id} onChange={event => setLine(index, 'variant_id', event.target.value)}><option value="">Standard</option>{(products.find(product => String(product.id) === line.product_id)?.variants || []).filter(variant => variant.is_active).map(variant => <option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value} (+{money(variant.extra_price)})</option>)}</select></label>
        <label>Quantity<input type="number" min="1" max="100000" required value={line.quantity} onChange={event => setLine(index, 'quantity', event.target.value)} /></label>
        {values.lines.length > 1 && <button type="button" className="button danger small" onClick={() => setValues({ ...values, lines: values.lines.filter((_, i) => i !== index) })}>Remove line</button>}
      </div>)}
      <button type="button" className="button secondary small" onClick={() => setValues({ ...values, lines: [...values.lines, { product_id: '', variant_id: '', quantity: '1' }] })}>＋ Add product line</button>
      <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button><button type="button" className="button secondary" onClick={closeForm}>Cancel</button></div>
    </form>}
    <p className="permission-note">{isAdmin ? 'Templates are reusable quote starters. Deactivation preserves existing quotations.' : 'Staff can create reusable quotation templates; catalog prices are copied when a quotation is created.'}</p>
  </>;
}
function AuditLog({ data }) {
  return <section className="panel table-panel"><PanelTitle title="Recent administrative activity" badge={`${data.length} EVENTS`} /><div className="table-wrap"><table><thead><tr><th>WHEN</th><th>ACTOR</th><th>ACTION</th><th>RECORD</th><th>DETAILS</th></tr></thead><tbody>{data.length ? data.map(event => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString()}</td><td>{event.actor || 'System'}</td><td>{event.action}</td><td>{event.entity_type}{event.entity_id ? ` #${event.entity_id}` : ''}</td><td><code>{JSON.stringify(event.details || {})}</code></td></tr>) : <tr><td colSpan="5" className="table-empty">No audit entries recorded.</td></tr>}</tbody></table></div><p className="permission-note">Audit entries are append-only and do not include passwords, tokens, or payment credentials.</p></section>;
}
function Settings({ token, initialSettings, onSave }) {
  const [values, setValues] = useState({
    auto_confirm_invoices: initialSettings.auto_confirm_invoices !== false,
    pause_policy: initialSettings.pause_policy || 'shift',
    company_name: initialSettings.company_name || 'Brightloop Software',
    invoice_footer: initialSettings.invoice_footer || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setValues({
    auto_confirm_invoices: initialSettings.auto_confirm_invoices !== false,
    pause_policy: initialSettings.pause_policy || 'shift',
    company_name: initialSettings.company_name || 'Brightloop Software',
    invoice_footer: initialSettings.invoice_footer || '',
  }), [initialSettings]);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave(values);
      setMessage('Workspace settings saved.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <form className="panel plan-form" onSubmit={submit}>
    <h2>Workspace settings</h2>
    <label>Company name<input maxLength={160} required value={values.company_name} onChange={event => setValues({ ...values, company_name: event.target.value })} /></label>
    <label>Invoice footer<textarea maxLength={2000} value={values.invoice_footer} onChange={event => setValues({ ...values, invoice_footer: event.target.value })} /></label>
    <label className="plan-flag"><input type="checkbox" checked={values.auto_confirm_invoices} onChange={event => setValues({ ...values, auto_confirm_invoices: event.target.checked })} /> Automatically confirm invoices created by recurring billing</label>
    <label>Pause policy<select value={values.pause_policy} onChange={event => setValues({ ...values, pause_policy: event.target.value })}><option value="shift">Shift next bill date and extend subscription expiry</option><option value="skip">Skip paused periods without extending expiry</option></select></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="signup-success" role="status">{message}</p>}
    <button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
  </form>;
}
function SystemHealth({ token }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setHealth(await api.adminHealth(token));
    } catch (requestError) {
      setHealth(requestError.data || null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [token]);
  return <section className="panel table-panel"><div className="list-toolbar"><b>Dependency status</b><button className="button secondary small" disabled={loading} onClick={load}>{loading ? 'Checking…' : 'Refresh'}</button></div>{error && <p className="form-error" role="alert">{error}</p>}{health && <><p className="health-status">Overall status: <b>{health.status}</b> · checked {new Date(health.checked_at).toLocaleString()}</p><div className="table-wrap"><table><thead><tr><th>DEPENDENCY</th><th>STATUS</th><th>ERROR CODE</th></tr></thead><tbody>{Object.entries(health.dependencies).map(([name, dependency]) => <tr key={name}><td>{name}</td><td><Badge>{dependency.status === 'ok' ? 'Healthy' : 'Degraded'}</Badge></td><td>{dependency.code || '—'}</td></tr>)}</tbody></table></div></>}</section>;
}
function Discounts({ data, products, isAdmin, onCreate, onUpdate, onDeactivate }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deactivatingId, setDeactivatingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [values, setValues] = useState({
    name: '', kind: 'percentage', value: '', scope: 'subscription', product_ids: [],
    min_purchase_amount: '0', min_quantity: '0', start_date: today, end_date: '', usage_limit: '',
  });
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        ...values,
        value: Number(values.value),
        min_purchase_amount: Number(values.min_purchase_amount),
        min_quantity: Number(values.min_quantity),
        end_date: values.end_date || null,
        usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
      };
      const saved = editingId ? await onUpdate(editingId, payload) : await onCreate(payload);
      setMessage(editingId ? `${saved.name} was updated.` : `${saved.name} was created.`);
      setOpen(false);
      setEditingId(null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const editDiscount = discount => {
    setEditingId(discount.id);
    setValues({
      name: discount.name,
      kind: discount.kind,
      value: String(discount.value),
      scope: discount.scope_type,
      product_ids: discount.product_ids,
      min_purchase_amount: String(discount.min_purchase_amount),
      min_quantity: String(discount.min_quantity),
      start_date: discount.start_date,
      end_date: discount.end_date || '',
      usage_limit: discount.usage_limit === null ? '' : String(discount.usage_limit),
    });
    setError('');
    setOpen(true);
  };
  const deleteDiscount = async discount => {
    if (!window.confirm(`Delete "${discount.name}"? It will be deactivated and kept for historical records.`)) return;
    setDeactivatingId(discount.id);
    setError('');
    setMessage('');
    try {
      await onDeactivate('discount', discount.id);
      setMessage(`${discount.name} was deactivated.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDeactivatingId(null);
    }
  };
  return <>
    <section className="panel table-panel">
      <div className="list-toolbar"><div><b>{data.length} discount rules</b></div>{isAdmin && <button className="button primary small" onClick={() => { setEditingId(null); setValues({ name: '', kind: 'percentage', value: '', scope: 'subscription', product_ids: [], min_purchase_amount: '0', min_quantity: '0', start_date: today, end_date: '', usage_limit: '' }); setOpen(value => !value); }}>＋ Add discount</button>}</div>
      {message && <p className="signup-success" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>RULE</th><th>TYPE</th><th>SCOPE</th><th>VALIDITY</th><th>USAGE</th><th>STATUS</th>{isAdmin && <th>ACTIONS</th>}</tr></thead><tbody>{data.length ? data.map(discount => <tr key={discount.id}><td><b>{discount.name}</b></td><td>{discount.kind === 'percentage' ? `${discount.value}% off` : `${money(discount.value)} off`}</td><td>{discount.scope}</td><td>{discount.start_date} – {discount.end_date || 'No end date'}</td><td>{discount.times_used} / {discount.usage_limit ?? '∞'}</td><td><Badge>{discount.status}</Badge></td>{isAdmin && <td className="row-actions"><button className="button secondary small" onClick={() => editDiscount(discount)}>Edit</button><button className="button danger small" disabled={!discount.is_active || deactivatingId !== null} onClick={() => deleteDiscount(discount)}>{deactivatingId === discount.id ? 'Deleting…' : 'Delete'}</button></td>}</tr>) : <tr><td colSpan={isAdmin ? 7 : 6} className="table-empty">No discount rules found.</td></tr>}</tbody></table></div>
    </section>
    {open && <form className="panel plan-form" onSubmit={submit}>
      <h2>{editingId ? 'Edit discount rule' : 'New discount rule'}</h2>
      <div className="plan-form-grid">
        <label>Rule name<input required maxLength={160} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} /></label>
        <label>Discount type<select value={values.kind} onChange={event => setValues({ ...values, kind: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
        <label>Value<input type="number" min="0.01" max={values.kind === 'percentage' ? '100' : undefined} step="0.01" required value={values.value} onChange={event => setValues({ ...values, value: event.target.value })} /></label>
        <label>Applies to<select value={values.scope} onChange={event => setValues({ ...values, scope: event.target.value })}><option value="subscription">Whole subscription</option><option value="product">Selected products</option></select></label>
        {values.scope === 'product' && <label>Products<select multiple value={values.product_ids} onChange={event => setValues({ ...values, product_ids: [...event.target.selectedOptions].map(option => option.value) })}>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>}
        <label>Minimum purchase (INR)<input type="number" min="0" step="0.01" required value={values.min_purchase_amount} onChange={event => setValues({ ...values, min_purchase_amount: event.target.value })} /></label>
        <label>Minimum quantity<input type="number" min="0" step="1" required value={values.min_quantity} onChange={event => setValues({ ...values, min_quantity: event.target.value })} /></label>
        <label>Start date<input type="date" required value={values.start_date} onChange={event => setValues({ ...values, start_date: event.target.value })} /></label>
        <label>End date (optional)<input type="date" value={values.end_date} onChange={event => setValues({ ...values, end_date: event.target.value })} /></label>
        <label>Usage limit (optional)<input type="number" min="1" step="1" value={values.usage_limit} onChange={event => setValues({ ...values, usage_limit: event.target.value })} /></label>
      </div>
      <div className="form-actions"><button className="button primary" disabled={saving || (values.scope === 'product' && !products.length)}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create discount'}</button><button type="button" className="button secondary" onClick={() => { setOpen(false); setEditingId(null); }}>Cancel</button></div>
      {values.scope === 'product' && !products.length && <p className="permission-note">Create products before setting a product-specific discount.</p>}
    </form>}
  </>;
}
function Staff({ data, isAdmin, onCreate }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ full_name: '', email: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await onCreate(values);
      setMessage('Staff invitation sent. They will receive an email to set their password.');
      setValues({ full_name: '', email: '' });
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <><section className="panel table-panel"><div className="list-toolbar"><div><b>{data.length} team members</b></div>{isAdmin && <button className="button primary small" onClick={() => setOpen(value => !value)}>＋ Invite staff</button>}</div>{message && <p className="signup-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>EMAIL</th><th>ROLE</th><th>LAST LOGIN</th><th>STATUS</th></tr></thead><tbody>{data.length ? data.map(member => <tr key={member.id}><td><span className="table-avatar">{member.name.split(' ').map(part => part[0]).join('')}</span><b>{member.name}</b></td><td>{member.email}</td><td>{member.role}</td><td>{member.last_login_at ? new Date(member.last_login_at).toLocaleString() : 'Never'}</td><td><Badge>{member.status}</Badge></td></tr>) : <tr><td colSpan="5" className="table-empty">No team members found.</td></tr>}</tbody></table></div></section>{open && <form className="panel plan-form" onSubmit={submit}><h2>Invite a team member</h2><div className="plan-form-grid"><label>Full name<input required maxLength={160} value={values.full_name} onChange={event => setValues({ ...values, full_name: event.target.value })} /></label><label>Email<input type="email" required maxLength={254} value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} /></label></div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Sending…' : 'Send invitation'}</button><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button></div></form>}</>;
}
createRoot(document.getElementById('root')).render(<App />);
