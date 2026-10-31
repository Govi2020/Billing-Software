import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const users = [
  { email: 'admin@brightloop.test', password: 'Brightloop!2026', name: 'Anika Rao', role: 'admin' },
  { email: 'staff@brightloop.test', password: 'Brightloop!2026', name: 'Rohan Mehta', role: 'staff' },
  { email: 'customer@brightloop.test', password: 'Brightloop!2026', name: 'Priya Shah', role: 'customer' },
];

const subs = [
  { id: 'SUB-000981', customer: 'Priya Shah', plan: 'Pro Annual', status: 'Active', amount: 7800, date: '01 Dec 2026' },
  { id: 'SUB-000974', customer: 'Acme Studio', plan: 'Business Monthly', status: 'Active', amount: 15600, date: '14 Dec 2026' },
  { id: 'SUB-000962', customer: 'Northstar Retail', plan: 'Team Monthly', status: 'Quotation', amount: 4680, date: '—' },
  { id: 'SUB-000950', customer: 'Priya Shah', plan: 'Additional seats', status: 'Paused', amount: 1560, date: 'Paused' },
  { id: 'SUB-000941', customer: 'Fieldwork Co.', plan: 'Pro Annual', status: 'Active', amount: 93600, date: '18 Dec 2026' },
];
const invoices = [
  { id: 'INV-001204', customer: 'Priya Shah', date: '01 Nov 2026', due: '15 Nov 2026', amount: 7800, status: 'Confirmed' },
  { id: 'INV-001203', customer: 'Acme Studio', date: '01 Nov 2026', due: '15 Nov 2026', amount: 15600, status: 'Overdue' },
  { id: 'INV-001180', customer: 'Priya Shah', date: '01 Oct 2026', due: '15 Oct 2026', amount: 7800, status: 'Paid' },
  { id: 'INV-001172', customer: 'Fieldwork Co.', date: '18 Oct 2026', due: '01 Nov 2026', amount: 93600, status: 'Draft' },
];
const customers = [
  { name: 'Priya Shah', company: 'Shah & Co.', email: 'priya@shahco.example', subscriptions: 2, balance: 7800 },
  { name: 'Acme Studio', company: 'Acme Studio Pvt Ltd', email: 'accounts@acme.example', subscriptions: 1, balance: 15600 },
  { name: 'Northstar Retail', company: 'Northstar Retail', email: 'finance@northstar.example', subscriptions: 1, balance: 0 },
  { name: 'Fieldwork Co.', company: 'Fieldwork Co.', email: 'ops@fieldwork.example', subscriptions: 1, balance: 0 },
];
const products = [
  { name: 'Brightloop Pro', type: 'Software', price: 1200, cost: 360, variant: 'Odoo brand + ₹560' },
  { name: 'Additional seat', type: 'Add-on', price: 300, cost: 72, variant: 'No variants' },
  { name: 'Analytics suite', type: 'Software', price: 2400, cost: 680, variant: 'Standard' },
];

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const navByRole = {
  admin: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['CONFIGURATION', 'Products & plans'], ['CONFIGURATION', 'Discounts'], ['CONFIGURATION', 'Staff'], ['INSIGHTS', 'Finance']],
  staff: [['OVERVIEW', 'Dashboard'], ['WORKSPACE', 'Customers'], ['WORKSPACE', 'Subscriptions'], ['WORKSPACE', 'Invoices'], ['WORKSPACE', 'Payments'], ['INSIGHTS', 'Finance'], ['INSIGHTS', 'Catalog']],
  customer: [['YOUR ACCOUNT', 'Overview'], ['YOUR ACCOUNT', 'Subscriptions'], ['YOUR ACCOUNT', 'Invoices'], ['YOUR ACCOUNT', 'Payments'], ['YOUR ACCOUNT', 'Profile']],
};
function Badge({ children }) { return <span className={`badge ${children.toLowerCase()}`}>{children}</span>; }
function Icon({ name }) {
  const icons = { Dashboard: '⌂', Overview: '⌂', Customers: '◉', Subscriptions: '↻', Invoices: '▤', Payments: '↗', 'Products & plans': '◇', Discounts: '%', Staff: '♧', Finance: '▥', Catalog: '▦', Profile: '◎' };
  return <span className="nav-icon" aria-hidden="true">{icons[name] || '·'}</span>;
}
function Login({ onLogin }) {
  const [email, setEmail] = useState(users[0].email);
  const [password, setPassword] = useState(users[0].password);
  const [error, setError] = useState('');
  return <main className="login-page">
    <section className="login-aside">
      <a className="brand brand-light" href="#"><span className="brand-mark">b</span> brightloop</a>
      <div className="login-message"><span className="eyebrow">SUBSCRIPTION OPERATIONS</span><h1>Make recurring<br />revenue feel routine.</h1><p>One clear view of the customers, plans and payments that keep your business moving.</p></div>
      <div className="aside-foot"><span>BRIGHTLOOP SOFTWARE</span><span>BUILT FOR THE EVERYDAY</span></div>
    </section>
    <section className="login-main"><form className="login-card" onSubmit={e => { e.preventDefault(); const found = users.find(u => u.email === email && u.password === password); found ? onLogin(found) : setError('Those details did not match a demo account.'); }}>
      <div className="mobile-brand"><span className="brand-mark">b</span> brightloop</div>
      <span className="eyebrow">WELCOME BACK</span><h2>Sign in to your workspace</h2><p className="muted">Use a demo account to explore a role-specific view.</p>
      <label>Email address<input autoComplete="username" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input autoComplete="current-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" type="submit">Sign in <span>→</span></button>
      <div className="login-divider"><span>DEMO ACCESS</span></div>
      <div className="demo-list">{users.map(u => <button type="button" key={u.role} onClick={() => { setEmail(u.email); setPassword(u.password); setError(''); }}><span className={`role-dot ${u.role}`} /><span><b>{u.role[0].toUpperCase() + u.role.slice(1)}</b><small>{u.email}</small></span><span className="demo-arrow">↗</span></button>)}</div>
      <p className="demo-note">Prototype only · Demo credentials are not real accounts.</p>
    </form></section>
  </main>;
}

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(null);
  const [search, setSearch] = useState('');
  if (!user) return <Login onLogin={u => { setUser(u); setPage(u.role === 'customer' ? 'Overview' : 'Dashboard'); }} />;
  const role = user.role;
  const activePage = page || (role === 'customer' ? 'Overview' : 'Dashboard');
  const isCustomer = role === 'customer';
  const isAdmin = role === 'admin';
  const filteredCustomers = customers.filter(c => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
  const filteredSubs = subs.filter(s => (!isCustomer || s.customer === user.name) && `${s.id} ${s.customer} ${s.plan}`.toLowerCase().includes(search.toLowerCase()));
  const filteredInvoices = invoices.filter(i => (!isCustomer || i.customer === user.name) && `${i.id} ${i.customer}`.toLowerCase().includes(search.toLowerCase()));
  const heading = activePage === 'Dashboard' ? (isAdmin ? 'Control room' : 'My work') : activePage === 'Overview' ? `Hello, ${user.name.split(' ')[0]}` : activePage;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage(isCustomer ? 'Overview' : 'Dashboard'); }}><span className="brand-mark">b</span> brightloop</a>
      <div className="workspace-switch"><span className="workspace-avatar">B</span><span><b>Brightloop Software</b><small>Workspace</small></span><span className="switch-caret">⌄</span></div>
      <nav>{navByRole[role].map(([group, item], i) => <React.Fragment key={item}>{(i === 0 || navByRole[role][i - 1][0] !== group) && <div className="nav-group">{group}</div>}<button className={`nav-link ${activePage === item ? 'selected' : ''}`} onClick={() => { setPage(item); setSearch(''); }}><Icon name={item} />{item}{item === 'Invoices' && !isCustomer && <span className="nav-count">4</span>}</button></React.Fragment>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><b>Need a hand?</b><small>Visit the help center</small></div><button className="profile-row" onClick={() => isCustomer ? setPage('Profile') : null}><span className="user-avatar">{user.name.split(' ').map(x => x[0]).join('')}</span><span><b>{user.name}</b><small>{role[0].toUpperCase() + role.slice(1)}</small></span><span className="more">···</span></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Brightloop <span>/</span> {activePage}</div><div className="top-actions"><label className="searchbox"><span>⌕</span><input aria-label="Search" placeholder="Search customers, SUB-, INV-…" value={search} onChange={e => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><button className="icon-button notification" aria-label="Notifications">♧<i /></button><button className="user-menu" onClick={() => { setUser(null); setPage(null); }} title="Sign out"><span className="user-avatar">{user.name.split(' ').map(x => x[0]).join('')}</span><span className="logout-label">Sign out</span>⌄</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">{isCustomer ? 'CUSTOMER PORTAL' : isAdmin ? 'ADMINISTRATION' : 'OPERATIONS'}</div><h1>{heading}</h1><p>{isCustomer ? 'Your subscriptions, invoices and account details.' : activePage === 'Dashboard' ? (isAdmin ? 'A clear view of what is happening across your business.' : 'Here is what needs your attention today.') : `Manage and review ${activePage.toLowerCase()} across your workspace.`}</p></div>{!isCustomer && <div className="heading-actions"><button className="button secondary">Export <span>↓</span></button><button className="button primary" onClick={() => setPage(activePage === 'Customers' ? 'New customer' : 'New quotation')}>＋ {activePage === 'Customers' ? 'Add customer' : 'New quotation'}</button></div>}</div>
        {activePage === 'Dashboard' || activePage === 'Overview' ? <Dashboard user={user} isAdmin={isAdmin} isCustomer={isCustomer} onNavigate={setPage} rows={filteredSubs} bills={filteredInvoices} /> :
        activePage === 'Customers' ? <CustomerTable data={filteredCustomers} /> :
        activePage === 'Subscriptions' ? <SubscriptionTable data={filteredSubs} /> :
        activePage === 'Invoices' ? <InvoiceTable data={filteredInvoices} isCustomer={isCustomer} /> :
        activePage === 'Payments' ? <Payments isCustomer={isCustomer} /> :
        activePage === 'Products & plans' || activePage === 'Catalog' ? <Catalog isAdmin={isAdmin} /> :
        activePage === 'Finance' ? <Finance isAdmin={isAdmin} /> :
        activePage === 'Discounts' ? <Discounts /> :
        activePage === 'Staff' ? <Staff /> :
        activePage === 'Profile' ? <Profile user={user} /> :
        <div className="empty-panel"><span className="empty-symbol">✳</span><h2>{activePage}</h2><p>This prototype focuses on role-specific dashboards and seeded records.</p><button className="button secondary" onClick={() => setPage(isCustomer ? 'Overview' : 'Dashboard')}>Back to overview</button></div>}
        <footer className="page-footer"><span>© 2026 Brightloop Software</span><span><i className="online-dot" /> All systems operational <span className="footer-sep">·</span> <a href="#">Help & support</a></span></footer>
      </div>
    </main>
  </div>;
}

function Dashboard({ user, isAdmin, isCustomer, onNavigate, rows, bills }) {
  if (isCustomer) return <><div className="metric-grid four"><Metric label="Active subscriptions" value="1" foot="Across your account" icon="↻" /><Metric label="Next payment" value={money(7800)} foot="Due 15 Nov 2026" icon="↗" /><Metric label="Outstanding" value={money(7800)} foot="1 invoice awaiting payment" icon="▤" /><Metric label="Overdue" value={money(0)} foot="You are all caught up" icon="✓" positive /></div><div className="section-grid"><section className="panel"><PanelTitle title="Your subscriptions" action="View all" onClick={() => onNavigate('Subscriptions')} /><SubscriptionTable compact data={rows} /></section><section className="panel"><PanelTitle title="Recent invoices" action="View all" onClick={() => onNavigate('Invoices')} /><InvoiceTable compact data={bills} isCustomer /></section></div><div className="callout"><span className="callout-icon">i</span><span><b>Everything in one place.</b> Your plan changes and invoices are available anytime from the left menu.</span><button onClick={() => onNavigate('Profile')}>Review profile →</button></div></>;
  return <><div className="metric-grid four"><Metric label="Active subscriptions" value={isAdmin ? '1,284' : '1,284'} foot="+8.2% vs last month" icon="↻" trend /><Metric label="Revenue this month" value={money(1690000)} foot="+12.4% vs last month" icon="↗" trend /><Metric label="Outstanding balance" value={money(420000)} foot="Across 38 invoices" icon="◷" /><Metric label="Overdue invoices" value="7" foot={`${money(52000)} needs follow-up`} icon="!" warning /></div>
  <div className="section-grid dashboard-grid"><section className="panel attention-panel"><PanelTitle title="Needs attention" badge="3 ITEMS" /><div className="attention-item"><span className="attention-mark red">!</span><div><b>INV-001203 · Acme Studio</b><p>21 days overdue <span>·</span> {money(15600)}</p></div><button className="text-button" onClick={() => onNavigate('Invoices')}>Review →</button></div><div className="attention-item"><span className="attention-mark amber">◷</span><div><b>SUB-000877 · Renewal due</b><p>Expires in 3 days <span>·</span> Renewable plan</p></div><button className="text-button" onClick={() => onNavigate('Subscriptions')}>Open →</button></div><div className="attention-item"><span className="attention-mark blue">✎</span><div><b>SUB-000990 · Draft untouched</b><p>Created 5 days ago <span>·</span> Awaiting review</p></div><button className="text-button" onClick={() => onNavigate('Subscriptions')}>Open →</button></div></section>
  {isAdmin ? <section className="panel chart-panel"><PanelTitle title="Revenue collected" action="Last 6 months" /><div className="chart-total">{money(1690000)}<span> this month</span></div><div className="chart"><div className="chart-y"><span>₹20L</span><span>₹10L</span><span>₹0</span></div><div className="chart-area"><div className="grid-line one" /><div className="grid-line two" /><div className="grid-line three" /><svg viewBox="0 0 600 150" preserveAspectRatio="none" aria-label="Revenue trend"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#78a795" stopOpacity=".22" /><stop offset="100%" stopColor="#78a795" stopOpacity="0" /></linearGradient></defs><path d="M0 118 C35 111 45 108 75 112 S125 87 150 95 S200 82 225 88 S275 54 300 68 S350 61 375 66 S425 39 450 51 S500 29 525 41 S575 24 600 19 L600 150 L0 150Z" fill="url(#fill)" /><path d="M0 118 C35 111 45 108 75 112 S125 87 150 95 S200 82 225 88 S275 54 300 68 S350 61 375 66 S425 39 450 51 S500 29 525 41 S575 24 600 19" fill="none" stroke="#377b63" strokeWidth="2.5" /></svg><div className="chart-x"><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span></div></div></div><div className="chart-legend"><i /> Collected revenue <span>Updated today</span></div></section> : <section className="panel pipeline"><PanelTitle title="Quotation pipeline" action="View subscriptions" onClick={() => onNavigate('Subscriptions')} /><div className="pipeline-bars"><div><span>Draft</span><b>5</b><i style={{ '--bar': '26%' }} /></div><div><span>Quotation</span><b>12</b><i style={{ '--bar': '78%' }} /></div><div><span>Confirmed</span><b>3</b><i style={{ '--bar': '20%' }} /></div></div><div className="pipeline-note"><span className="online-dot" /> 12 quotations are waiting for customer response</div></section>}</div>
  <section className="panel table-panel"><PanelTitle title="Recent subscriptions" action="View all" onClick={() => onNavigate('Subscriptions')} /><SubscriptionTable compact data={rows.slice(0, 4)} /></section>
  {isAdmin && <div className="billing-health"><span className="health-check">✓</span><div><b>Billing is healthy</b><p>Last run today at 02:00 · 312 subscriptions processed · 0 failures</p></div><span className="health-right"><i className="online-dot" /> Queue clear</span><button className="button secondary small">View billing runs</button></div>}</>;
}
function Metric({ label, value, foot, icon, warning, positive, trend }) { return <section className="metric-card"><div className={`metric-icon ${warning ? 'warn' : positive ? 'good' : ''}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className={`metric-foot ${warning ? 'red-text' : trend ? 'green-text' : ''}`}>{trend && <span>↗ </span>}{foot}</div></section>; }
function PanelTitle({ title, action, onClick, badge }) { return <div className="panel-title"><h2>{title}</h2>{badge && <span className="count-badge">{badge}</span>}{action && <button className="text-button" onClick={onClick}>{action} <span>→</span></button>}</div>; }
function SubscriptionTable({ data, compact }) { return <div className="table-wrap"><table><thead><tr><th>SUBSCRIPTION</th>{!compact && <th>CUSTOMER</th>}<th>PLAN</th><th>STATUS</th><th>{compact ? 'NEXT INVOICE' : 'AMOUNT / PERIOD'}</th></tr></thead><tbody>{data.length ? data.map(s => <tr key={s.id}><td><button className="record-link">{s.id}</button></td>{!compact && <td>{s.customer}</td>}<td>{s.plan}</td><td><Badge>{s.status}</Badge></td><td>{compact ? s.date : money(s.amount)}</td></tr>) : <tr><td colSpan="5" className="table-empty">No subscriptions found.</td></tr>}</tbody></table></div>; }
function InvoiceTable({ data, compact, isCustomer }) { return <div className="table-wrap"><table><thead><tr><th>INVOICE</th>{!compact && !isCustomer && <th>CUSTOMER</th>}<th>ISSUED</th>{!compact && <th>DUE DATE</th>}<th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{data.length ? data.map(i => <tr key={i.id}><td><button className="record-link">{i.id}</button></td>{!compact && !isCustomer && <td>{i.customer}</td>}<td>{i.date}</td>{!compact && <td>{i.due}</td>}<td>{money(i.amount)}</td><td><Badge>{i.status}</Badge></td></tr>) : <tr><td colSpan="6" className="table-empty">No invoices found.</td></tr>}</tbody></table></div>; }
function CustomerTable({ data }) { return <section className="panel table-panel"><div className="list-toolbar"><div><b>{data.length} customers</b><span> · Sorted by recent activity</span></div><button className="button secondary small">Filter <span>⌄</span></button></div><div className="table-wrap"><table><thead><tr><th>CUSTOMER</th><th>COMPANY</th><th>EMAIL</th><th>SUBSCRIPTIONS</th><th>OUTSTANDING</th><th /></tr></thead><tbody>{data.map(c => <tr key={c.email}><td><span className="table-avatar">{c.name.split(' ').map(x => x[0]).join('')}</span><b>{c.name}</b></td><td>{c.company}</td><td>{c.email}</td><td>{c.subscriptions}</td><td>{money(c.balance)}</td><td><button className="row-more">···</button></td></tr>)}</tbody></table></div></section>; }
function Payments({ isCustomer }) { const rows = [{ id: 'PAY-009281', invoice: 'INV-001180', customer: 'Priya Shah', date: '15 Oct 2026', method: 'Bank transfer', amount: 7800 }, { id: 'PAY-009260', invoice: 'INV-001160', customer: 'Acme Studio', date: '14 Oct 2026', method: 'UPI', amount: 15600 }, { id: 'PAY-009114', invoice: 'INV-001102', customer: 'Northstar Retail', date: '02 Oct 2026', method: 'Bank transfer', amount: 4680 }].filter(x => !isCustomer || x.customer === 'Priya Shah'); return <section className="panel table-panel"><PanelTitle title="Payment ledger" action="Record payment" /><div className="table-wrap"><table><thead><tr><th>PAYMENT</th><th>INVOICE</th>{!isCustomer && <th>CUSTOMER</th>}<th>DATE</th><th>METHOD</th><th>AMOUNT</th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td className="record-link">{p.id}</td><td>{p.invoice}</td>{!isCustomer && <td>{p.customer}</td>}<td>{p.date}</td><td>{p.method}</td><td>{money(p.amount)}</td></tr>)}</tbody></table></div></section>; }
function Catalog({ isAdmin }) { return <><div className="subtabs"><button className="active">Products <span>3</span></button><button>Plans <span>4</span></button><button>Taxes <span>2</span></button></div><section className="panel table-panel"><PanelTitle title="Products" action={isAdmin ? '＋ Add product' : 'Read only'} /><div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>SALES PRICE</th>{isAdmin && <th>COST PRICE</th>}<th>VARIANTS</th><th>STATUS</th></tr></thead><tbody>{products.map(p => <tr key={p.name}><td><span className="product-icon">◇</span><b>{p.name}</b></td><td>{p.type}</td><td>{money(p.price)}</td>{isAdmin && <td>{money(p.cost)}</td>}<td>{p.variant}</td><td><Badge>Active</Badge></td></tr>)}</tbody></table></div></section><div className="info-strip">Prices are shown in INR. Staff can view catalog details but cannot change prices or plan settings.</div></>; }
function Finance({ isAdmin }) { return <><div className="filter-row"><button className="button secondary small">This month ⌄</button><button className="button secondary small">All plans ⌄</button><button className="button secondary small">Compare period</button><button className="button secondary small push-right">Export CSV ↓</button></div><div className="metric-grid four"><Metric label="Revenue collected" value={money(1690000)} foot="Payments received this month" /><Metric label="Outstanding" value={money(420000)} foot="38 confirmed invoices" /><Metric label="Overdue" value={money(52000)} foot="7 invoices past due" warning /><Metric label="Active subscriptions" value="1,284" foot="Current active subscriptions" /></div><section className="panel table-panel"><PanelTitle title="Outstanding invoices" action="View all invoices" /><InvoiceTable data={invoices.filter(i => i.status === 'Overdue' || i.status === 'Confirmed')} /></section>{!isAdmin && <p className="permission-note">Finance view is read-only. Cost price and margin data are restricted.</p>}</>; }
function Discounts() { return <section className="panel table-panel"><PanelTitle title="Discount rules" action="＋ Create discount" /><div className="table-wrap"><table><thead><tr><th>RULE</th><th>TYPE</th><th>SCOPE</th><th>VALIDITY</th><th>USAGE</th><th>STATUS</th></tr></thead><tbody><tr><td><b>Annual commitment</b></td><td>10% off</td><td>Subscription</td><td>01 Jan – 31 Dec 2026</td><td>37 / 100</td><td><Badge>Active</Badge></td></tr><tr><td><b>Launch offer</b></td><td>{money(500)} off</td><td>Brightloop Pro</td><td>01 Nov – 30 Nov 2026</td><td>12 / 50</td><td><Badge>Active</Badge></td></tr><tr><td><b>Partner referral</b></td><td>5% off</td><td>Subscription</td><td>Ended 31 Oct 2026</td><td>20 / 20</td><td><Badge>Expired</Badge></td></tr></tbody></table></div></section>; }
function Staff() { return <section className="panel table-panel"><PanelTitle title="Team members" action="＋ Invite staff" /><div className="table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>EMAIL</th><th>ROLE</th><th>LAST LOGIN</th><th>STATUS</th></tr></thead><tbody><tr><td><span className="table-avatar">AR</span><b>Anika Rao</b></td><td>admin@brightloop.test</td><td>Admin</td><td>Today, 09:42</td><td><Badge>Active</Badge></td></tr><tr><td><span className="table-avatar">RM</span><b>Rohan Mehta</b></td><td>staff@brightloop.test</td><td>Staff</td><td>Today, 09:18</td><td><Badge>Active</Badge></td></tr><tr><td><span className="table-avatar">SD</span><b>Sana Desai</b></td><td>sana@brightloop.example</td><td>Staff</td><td>Yesterday</td><td><Badge>Active</Badge></td></tr></tbody></table></div></section>; }
function Profile({ user }) { return <section className="panel profile-panel"><div className="profile-large">{user.name.split(' ').map(x => x[0]).join('')}</div><div><span className="eyebrow">ACCOUNT PROFILE</span><h2>{user.name}</h2><p>{user.email}</p><p>Customer account · Shah & Co.</p><button className="button secondary">Edit profile</button></div></section>; }
createRoot(document.getElementById('root')).render(<App />);
