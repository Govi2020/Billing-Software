import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import './styles.css';

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0));
const navByRole = {
  admin: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['CONFIGURATION', 'Products & plans'], ['CONFIGURATION', 'Discounts'], ['CONFIGURATION', 'Staff'], ['INSIGHTS', 'Finance']],
  staff: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['INSIGHTS', 'Finance'], ['INSIGHTS', 'Catalog']],
  customer: [['YOUR ACCOUNT', 'Overview'], ['DISCOVER', 'Marketplace'], ['YOUR ACCOUNT', 'Subscriptions'], ['YOUR ACCOUNT', 'Invoices'], ['YOUR ACCOUNT', 'Payments'], ['YOUR ACCOUNT', 'Profile']],
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
const confirmQuotation = async subscriptionId => {
  const result = await api.confirmQuotation(token, subscriptionId);
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
function Badge({ children }) { return <span className={`badge ${children.toLowerCase()}`}>{children}</span>; }
function Icon({ name }) {
  const icons = { Dashboard: '⌂', Overview: '⌂', Marketplace: '▦', Customers: '◉', Subscriptions: '↻', Invoices: '▤', Payments: '↗', 'Products & plans': '◇', Discounts: '%', Staff: '♧', Finance: '▥', Catalog: '▦', Profile: '◎' };
  return <span className="nav-icon" aria-hidden="true">{icons[name] || '·'}</span>;
}
function Login({ onLogin, onSignup, initialError }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [signupComplete, setSignupComplete] = useState(false);
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
      <span className="eyebrow">{mode === 'signup' ? 'GET STARTED' : 'WELCOME BACK'}</span><h2>{mode === 'signup' ? 'Create your account' : 'Sign in to your workspace'}</h2><p className="muted">{mode === 'signup' ? 'Create a customer account to access your subscriptions.' : 'Sign in with your Brightloop account.'}</p>
      {mode === 'signup' && <label>Full name<input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={160} /></label>}
      <label>Email address<input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 9 : undefined} maxLength={128} /></label>
      {mode === 'signup' && <p className="auth-hint">Use at least 9 characters with uppercase, lowercase, and a symbol.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {signupComplete && <p className="signup-success" role="status">Account created. Check your email for a verification link before signing in.</p>}
      {!signupComplete && <button className="button primary full" type="submit" disabled={submitting}>{submitting ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : (mode === 'signup' ? 'Create account' : 'Sign in')} <span>→</span></button>}
      <p className="auth-switch">
        {signupComplete ? 'Already verified?' : mode === 'signup' ? 'Already have an account?' : 'New to Brightloop?'}
        {' '}<button type="button" onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setSignupComplete(false); }}>{signupComplete || mode === 'signup' ? 'Sign in' : 'Create an account'}</button>
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
  return window.location.pathname === '/verify-email' ? <EmailVerification /> : <WorkspaceApp />;
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

function QuotationForm({ customers, plans, onSave, onCancel }) {
  const [values, setValues] = useState({ customer_id: '', plan_id: '' });
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
  if (!user) return <Login onLogin={login} onSignup={signup} initialError={authError} />;
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
      <header className="topbar"><div className="breadcrumb">Brightloop <span>/</span> {activePage}</div><div className="top-actions"><label className="searchbox"><span>⌕</span><input ref={searchRef} aria-label="Search" placeholder="Search customers, SUB-, INV-…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><span className="icon-button notification" aria-label="Notifications" title="Notifications are shown in Needs attention">♧</span><button className="user-menu" onClick={logout} title="Sign out"><span className="user-avatar">{user.name.split(' ').map(x => x[0]).join('')}</span><span className="logout-label">Sign out</span>⌄</button></div></header>
      {workspaceError && <p className="workspace-error" role="alert">Workspace data could not be refreshed: {workspaceError}</p>}
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{isCustomer ? 'CUSTOMER PORTAL' : isAdmin ? 'ADMINISTRATION' : 'OPERATIONS'}</div><h1>{heading}</h1><p>{isCustomer ? 'Your subscriptions, invoices and account details.' : activePage === 'Dashboard' ? (isAdmin ? 'A clear view of what is happening across your business.' : 'Here is what needs your attention today.') : `Manage and review ${activePage.toLowerCase()} across your workspace.`}</p></div>{!isCustomer && <div className="heading-actions">{['Customers', 'Subscriptions', 'Invoices', 'Payments', 'Products & plans', 'Catalog', 'Discounts', 'Staff', 'Finance'].includes(activePage) && <button className="button secondary" onClick={() => exportPage(activePage, { customers: filteredCustomers, subscriptions: filteredSubs, invoices: filteredInvoices, payments: workspace.payments, catalog: [...workspace.products.map(item => ({ type: 'Product', ...item })), ...workspace.plans.map(item => ({ type: 'Plan', ...item })), ...workspace.taxes.map(item => ({ type: 'Tax', ...item }))], staff: workspace.staff, discounts: workspace.discounts })}>Export <span>↓</span></button>}{['Customers', 'Subscriptions'].includes(activePage) && <button className="button primary" onClick={() => setCreateMode(createMode ? null : activePage === 'Customers' ? 'customer' : 'quotation')}>＋ {activePage === 'Customers' ? 'Add customer' : 'New quotation'}</button>}</div>}</div>
        {activePage === 'Dashboard' || activePage === 'Overview' ? <Dashboard user={user} isAdmin={isAdmin} isCustomer={isCustomer} onNavigate={setPage} rows={filteredSubs} bills={filteredInvoices} summary={summary} monthlyRevenue={workspace.monthlyRevenue} latestBillingRun={workspace.latestBillingRun} /> :
        activePage === 'Marketplace' ? <Marketplace plans={workspace.plans} onSubscribe={subscribe} onNavigate={setPage} /> :
        activePage === 'Customers' ? <>{createMode === 'customer' && <CustomerForm onSave={createCustomer} onCancel={() => setCreateMode(null)} />}<CustomerTable data={filteredCustomers} /></> :
        activePage === 'Subscriptions' ? <>{createMode === 'quotation' && <QuotationForm customers={customers} plans={workspace.plans} onSave={createQuotation} onCancel={() => setCreateMode(null)} />}<SubscriptionTable data={filteredSubs} onConfirm={isCustomer ? null : confirmQuotation} onManage={manageSubscription} /></> :
        activePage === 'Invoices' ? <><InvoiceTable data={filteredInvoices} isCustomer={isCustomer} onRecordPayment={isCustomer ? null : recordPayment} />{isCustomer && <PaymentInstructions instructions={workspace.paymentInstructions} />}</> :
        activePage === 'Payments' ? <Payments data={workspace.payments} isCustomer={isCustomer} /> :
        activePage === 'Products & plans' || activePage === 'Catalog' ? <Catalog isAdmin={isAdmin} products={workspace.products} plans={workspace.plans} taxes={workspace.taxes} onCreatePlan={createPlan} onCreateProduct={createProduct} onCreateTax={createTax} /> :
        activePage === 'Finance' ? <Finance isAdmin={isAdmin} summary={summary} invoices={invoices} /> :
        activePage === 'Discounts' ? <Discounts data={workspace.discounts} products={workspace.products} isAdmin={isAdmin} onCreate={createDiscount} /> :
        activePage === 'Staff' ? <Staff data={workspace.staff} isAdmin={isAdmin} onCreate={createStaff} /> :
        activePage === 'Profile' ? <Profile user={user} customer={customers[0]} isCustomer={isCustomer} onSave={updateCustomerProfile} /> :
        <div className="empty-panel"><span className="empty-symbol">✳</span><h2>{activePage}</h2><p>This prototype focuses on role-specific dashboards and seeded records.</p><button className="button secondary" onClick={() => setPage(isCustomer ? 'Overview' : 'Dashboard')}>Back to overview</button></div>}
        <footer className="page-footer"><span>© 2026 Brightloop Software</span><span><i className="online-dot" /> Live workspace data <span className="footer-sep">·</span> <span>Contact your workspace administrator for support</span></span></footer>
      </div>
    </main>
  </div>;
}

function Dashboard({ isAdmin, isCustomer, onNavigate, rows, bills, summary, monthlyRevenue = [], latestBillingRun }) {
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
  const nextInvoice = bills.find(invoice => invoice.status === 'Confirmed' && !invoice.is_overdue);
  if (isCustomer) {
    return <>
      <div className="metric-grid four">
        <Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Across your account" icon="↻" />
        <Metric label="Next payment" value={money(nextInvoice?.amount || 0)} foot={nextSubscription?.date || 'No upcoming invoice'} icon="↗" />
        <Metric label="Outstanding" value={money(summary.outstanding_amount || 0)} foot={`${bills.filter(invoice => invoice.status === 'Confirmed').length} invoices awaiting payment`} icon="▤" />
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
      <Metric label="Outstanding balance" value={money(summary.outstanding_amount || 0)} foot="Across confirmed invoices" icon="◷" />
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
    <section className="panel table-panel"><PanelTitle title="Recent subscriptions" action="View all" onClick={() => onNavigate('Subscriptions')} /><SubscriptionTable compact data={rows.slice(0, 4)} /></section>
    {isAdmin && latestBillingRun && <div className="billing-health">
      <span className="health-check">{latestBillingRun.failed_count ? '!' : '✓'}</span>
      <div><b>Latest billing run</b><p>{new Date(latestBillingRun.started_at).toLocaleString()} · {latestBillingRun.invoiced_count} invoices · {latestBillingRun.failed_count} failures</p></div>
      <span className="health-right">{latestBillingRun.due_count} due</span>
    </div>}
  </>;
}
function Metric({ label, value, foot, icon, warning, positive, trend }) { return <section className="metric-card"><div className={`metric-icon ${warning ? 'warn' : positive ? 'good' : ''}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={`metric-foot ${warning ? 'red-text' : trend ? 'green-text' : ''}`}>{trend && <span>↗ </span>}{foot}</div></section>; }
function PanelTitle({ title, action, onClick, badge }) { return <div className="panel-title"><h2>{title}</h2>{badge && <span className="count-badge">{badge}</span>}{action && (onClick ? <button className="text-button" onClick={onClick}>{action} <span>→</span></button> : <span className="panel-meta">{action}</span>)}</div>; }
function SubscriptionTable({ data, compact, onConfirm, onManage }) {
  const [working, setWorking] = useState(null);
  const [error, setError] = useState('');
  const run = async (subscription, action) => {
    setWorking(`${subscription.id}:${action}`);
    setError('');
    try {
      if (action === 'confirm') await onConfirm(subscription.record_id);
      else await onManage(subscription.record_id, action);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setWorking(null);
    }
  };
  const actionsEnabled = Boolean(onConfirm || onManage);
  return <>{error && <p className="form-error" role="alert">{error}</p>}<div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th>{!compact && <th>CUSTOMER</th>}<th>PLAN</th><th>STATUS</th><th>{compact ? 'NEXT INVOICE' : 'AMOUNT / PERIOD'}</th>{actionsEnabled && !compact && <th>ACTION</th>}</tr></thead><tbody>{data.length ? data.map(s => <tr key={s.id}><td><span className="record-link">{s.id}</span></td>{!compact && <td>{s.customer}</td>}<td>{s.plan}</td><td><Badge>{s.status}</Badge></td><td>{compact ? s.date : money(s.amount)}</td>{actionsEnabled && !compact && <td className="row-actions">{s.status === 'Quotation' && onConfirm && <button className="button primary small" disabled={working !== null} onClick={() => run(s, 'confirm')}>{working === `${s.id}:confirm` ? 'Confirming…' : 'Confirm & invoice'}</button>}{s.status === 'Active' && s.is_pausable && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'pause')}>Pause</button>}{s.status === 'Paused' && s.is_pausable && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'resume')}>Resume</button>}{['Active', 'Paused', 'Confirmed'].includes(s.status) && s.is_closable && <button className="button secondary small" disabled={working !== null} onClick={() => run(s, 'close')}>Close</button>}</td>}</tr>) : <tr><td colSpan={compact ? 4 : actionsEnabled ? 6 : 5} className="table-empty">No subscriptions found.</td></tr>}</tbody></table></div></>;
}
function InvoiceTable({ data, compact, isCustomer, onRecordPayment }) {
  const [paying, setPaying] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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
  return <>
    <div className="table-wrap"><table><thead><tr><th>INVOICE</th>{!compact && !isCustomer && <th>CUSTOMER</th>}<th>ISSUED</th>{!compact && <th>DUE DATE</th>}<th>AMOUNT</th><th>STATUS</th>{onRecordPayment && !compact && <th>ACTION</th>}</tr></thead><tbody>{data.length ? data.map(i => <tr key={i.id}><td><span className="record-link">{i.id}</span></td>{!compact && !isCustomer && <td>{i.customer}</td>}<td>{i.date}</td>{!compact && <td>{i.due}</td>}<td>{money(i.amount)}</td><td><Badge>{i.is_overdue ? 'Overdue' : i.status}</Badge></td>{onRecordPayment && !compact && <td>{i.status === 'Confirmed' ? <button className="button secondary small" onClick={() => openPayment(i)}>Record payment</button> : '—'}</td>}</tr>) : <tr><td colSpan={compact ? (isCustomer ? 4 : 5) : (isCustomer ? 5 : onRecordPayment ? 7 : 6)} className="table-empty">No invoices found.</td></tr>}</tbody></table></div>
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
function CustomerTable({ data }) { return <section className="panel table-panel"><div className="list-toolbar"><div><b>{data.length} customers</b><span> · Use search to filter this list</span></div></div><div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>EMAIL</th><th>SUBSCRIPTIONS</th><th>OUTSTANDING</th></tr></thead><tbody>{data.length ? data.map(c => <tr key={c.email}><td><span className="table-avatar">{c.name.split(' ').map(x => x[0]).join('')}</span><b>{c.name}</b></td><td>{c.company}</td><td>{c.email}</td><td>{c.subscriptions}</td><td>{money(c.balance)}</td></tr>) : <tr><td colSpan="5" className="table-empty">No customers found.</td></tr>}</tbody></table></div></section>; }
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
function Profile({ user, customer, isCustomer, onSave }) {
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
  return <section className="panel profile-panel"><div className="profile-large">{user.name.split(' ').map(x => x[0]).join('')}</div><div><span className="eyebrow">ACCOUNT PROFILE</span><h2>{user.name}</h2><p>{user.email}</p><p>{user.role === 'customer' ? `Customer account${customer?.company ? ` · ${customer.company}` : ''}` : `${user.role[0].toUpperCase()}${user.role.slice(1)} account`}</p></div>{isCustomer && <form className="profile-form" onSubmit={submit}><h3>Billing details</h3><div className="plan-form-grid">{[['name', 'Full name'], ['company_name', 'Company'], ['phone', 'Phone'], ['address_line1', 'Address line 1'], ['address_line2', 'Address line 2'], ['city', 'City'], ['state', 'State'], ['postal_code', 'Postal code'], ['country', 'Country code']].map(([key, label]) => <label key={key}>{label}<input maxLength={key === 'country' ? 2 : 200} required={key === 'name' || key === 'country'} value={values[key] || ''} onChange={event => setValues({ ...values, [key]: event.target.value })} /></label>)}</div>{message && <p className="signup-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Save billing details'}</button></form>}</section>;
}
function Payments({ data, isCustomer }) { return <section className="panel table-panel"><PanelTitle title="Payment ledger" /><div className="table-wrap"><table><thead><tr><th>PAYMENT</th><th>INVOICE</th>{!isCustomer && <th>CUSTOMER</th>}<th>DATE</th><th>METHOD</th><th>AMOUNT</th></tr></thead><tbody>{data.length ? data.map(payment => <tr key={payment.id}><td className="record-link">{payment.id}</td><td>{payment.invoice}</td>{!isCustomer && <td>{payment.customer}</td>}<td>{payment.date}</td><td>{payment.method}</td><td>{money(payment.amount)}</td></tr>) : <tr><td colSpan={isCustomer ? 5 : 6} className="table-empty">No payments found.</td></tr>}</tbody></table></div></section>; }
function Catalog({ isAdmin, products, plans, taxes, onCreatePlan, onCreateProduct, onCreateTax }) {
  const localToday = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  };
  const [activeTab, setActiveTab] = useState('products');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const savePlan = async event => {
    await saveCatalogRecord(event, onCreatePlan, {
        ...plan,
        price: Number(plan.price),
        min_quantity: Number(plan.min_quantity),
        available_to: plan.available_to || null,
      }, created => `${created.name} is now available to customers.`);
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
  {isAdmin && <div className="list-toolbar"><span>{activeTab === 'plans' ? 'Plans offered in the customer marketplace' : `Manage ${activeTab}`}</span><button className="button primary small" onClick={() => { setFormOpen(open => !open); setError(''); }}>＋ Add {newLabel}</button></div>}
  {formOpen && activeTab === 'plans' && <form className="panel plan-form" onSubmit={savePlan}>
    <h2>New subscription plan</h2>
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
    <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Publish plan'}</button>
  </form>}
  {formOpen && activeTab === 'products' && <form className="panel plan-form" onSubmit={event => saveCatalogRecord(event, onCreateProduct, { name: product.name, type: product.type, sales_price: Number(product.sales_price), cost_price: Number(product.cost_price), tax_id: product.tax_id || null, notes: product.notes || null }, created => `${created.name} was added to the catalog.`)}>
    <h2>New product</h2><div className="plan-form-grid">
      <label>Product name<input required maxLength={160} value={product.name} onChange={event => setProduct({ ...product, name: event.target.value })} /></label>
      <label>Type<select value={product.type} onChange={event => setProduct({ ...product, type: event.target.value })}><option value="software">Software</option><option value="service">Service</option><option value="add_on">Add-on</option><option value="goods">Goods</option></select></label>
      <label>Sales price (INR)<input type="number" min="0" step="0.01" required value={product.sales_price} onChange={event => setProduct({ ...product, sales_price: event.target.value })} /></label>
      <label>Cost price (INR)<input type="number" min="0" step="0.01" required value={product.cost_price} onChange={event => setProduct({ ...product, cost_price: event.target.value })} /></label>
      <label>Default tax<select value={product.tax_id} onChange={event => setProduct({ ...product, tax_id: event.target.value })}><option value="">No default tax</option>{taxes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Notes<input maxLength={2000} value={product.notes} onChange={event => setProduct({ ...product, notes: event.target.value })} /></label>
    </div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Create product'}</button><button type="button" className="button secondary" onClick={() => setFormOpen(false)}>Cancel</button></div>
  </form>}
  {formOpen && activeTab === 'taxes' && <form className="panel plan-form" onSubmit={event => saveCatalogRecord(event, onCreateTax, { ...tax, rate: Number(tax.rate) }, created => `${created.name} was added.`)}>
    <h2>New tax</h2><div className="plan-form-grid">
      <label>Tax name<input required maxLength={160} value={tax.name} onChange={event => setTax({ ...tax, name: event.target.value })} /></label>
      <label>Type<select value={tax.kind} onChange={event => setTax({ ...tax, kind: event.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed per unit</option></select></label>
      <label>Rate<input type="number" min="0" max={tax.kind === 'percentage' ? '100' : undefined} step="0.0001" required value={tax.rate} onChange={event => setTax({ ...tax, rate: event.target.value })} /></label>
    </div><div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Saving…' : 'Create tax'}</button><button type="button" className="button secondary" onClick={() => setFormOpen(false)}>Cancel</button></div>
  </form>}
  {activeTab === 'products' && <section className="panel table-panel"><PanelTitle title="Products" /><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>SALES PRICE</th>{isAdmin && <th>COST PRICE</th>}<th>VARIANTS</th><th>STATUS</th></tr></thead><tbody>{products.length ? products.map(item => <tr key={item.id}><td><span className="product-icon">◇</span><b>{item.name}</b></td><td>{item.type}</td><td>{money(item.price)}</td>{isAdmin && <td>{money(item.cost)}</td>}<td>{item.variant}</td><td><Badge>{item.status}</Badge></td></tr>) : <tr><td colSpan={isAdmin ? 6 : 5} className="table-empty">No products found.</td></tr>}</tbody></table></div></section>}
  {activeTab === 'plans' && <section className="panel table-panel"><PanelTitle title="Plans" /><div className="table-wrap"><table><thead><tr><th>PLAN</th><th>PRICE</th><th>BILLING PERIOD</th><th>MINIMUM QUANTITY</th><th>AVAILABLE FROM</th><th>STATUS</th></tr></thead><tbody>{plans.length ? plans.map(item => <tr key={item.id}><td><b>{item.name}</b></td><td>{money(item.price)}</td><td>{item.period}</td><td>{item.min_quantity}</td><td>{item.available_from}</td><td><Badge>{item.status}</Badge></td></tr>) : <tr><td colSpan="6" className="table-empty">No plans found.</td></tr>}</tbody></table></div></section>}
  {activeTab === 'taxes' && <section className="panel table-panel"><PanelTitle title="Taxes" /><div className="table-wrap"><table><thead><tr><th>TAX</th><th>TYPE</th><th>RATE</th><th>STATUS</th></tr></thead><tbody>{taxes.length ? taxes.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.kind}</td><td>{item.kind === 'Percentage' ? `${item.rate}%` : money(item.rate)}</td><td><Badge>{item.status}</Badge></td></tr>) : <tr><td colSpan="4" className="table-empty">No taxes found.</td></tr>}</tbody></table></div></section>}
  <div className="info-strip">Prices are shown in INR. Staff can view catalog details but cannot change prices or plan settings.</div>
</>; }
function Finance({ isAdmin, summary, invoices }) { const outstanding = invoices.filter(invoice => invoice.status === 'Confirmed'); return <>
  <div className="metric-grid four"><Metric label="Revenue collected" value={money(summary.revenue_this_month)} foot="Payments received this month" /><Metric label="Outstanding" value={money(summary.outstanding_amount)} foot={`${outstanding.length} confirmed invoices`} /><Metric label="Overdue" value={money(summary.overdue_amount)} foot={`${summary.overdue_invoices || 0} invoices past due`} warning={Boolean(summary.overdue_invoices)} /><Metric label="Active subscriptions" value={summary.active_subscriptions || 0} foot="Current active subscriptions" /></div>
  <section className="panel table-panel"><PanelTitle title="Outstanding invoices" /><InvoiceTable data={outstanding} /></section>
  {!isAdmin && <p className="permission-note">Finance view is read-only. Cost price and margin data are restricted.</p>}
</>; }
function Discounts({ data, products, isAdmin, onCreate }) {
  const [open, setOpen] = useState(false);
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
      const created = await onCreate({
        ...values,
        value: Number(values.value),
        min_purchase_amount: Number(values.min_purchase_amount),
        min_quantity: Number(values.min_quantity),
        end_date: values.end_date || null,
        usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
      });
      setMessage(`${created.name} was created.`);
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return <>
    <section className="panel table-panel">
      <div className="list-toolbar"><div><b>{data.length} discount rules</b></div>{isAdmin && <button className="button primary small" onClick={() => setOpen(value => !value)}>＋ Add discount</button>}</div>
      {message && <p className="signup-success" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="table-wrap"><table><thead><tr><th>RULE</th><th>TYPE</th><th>SCOPE</th><th>VALIDITY</th><th>USAGE</th><th>STATUS</th></tr></thead><tbody>{data.length ? data.map(discount => <tr key={discount.id}><td><b>{discount.name}</b></td><td>{discount.kind === 'Percentage' ? `${discount.value}% off` : `${money(discount.value)} off`}</td><td>{discount.scope}</td><td>{discount.start_date} – {discount.end_date || 'No end date'}</td><td>{discount.times_used} / {discount.usage_limit ?? '∞'}</td><td><Badge>{discount.status}</Badge></td></tr>) : <tr><td colSpan="6" className="table-empty">No discount rules found.</td></tr>}</tbody></table></div>
    </section>
    {open && <form className="panel plan-form" onSubmit={submit}>
      <h2>New discount rule</h2>
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
      <div className="form-actions"><button className="button primary" disabled={saving || (values.scope === 'product' && !products.length)}>{saving ? 'Saving…' : 'Create discount'}</button><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button></div>
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
