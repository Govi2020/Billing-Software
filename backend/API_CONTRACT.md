# API contract

Base path: `/api/v1`. JSON responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?", "requestId" } }`. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens use an HttpOnly, SameSite=Strict cookie. Successful money values will be represented as strings in modules that expose them.

## Authentication

| Method | Path | Auth/roles | Request | Success response | Errors |
|---|---|---|---|---|---|
| POST | `/auth/signup` | Public | `{full_name,email,password}` | 201 `{data: user}`; verification email queued | 409 email taken; 422 invalid fields/password; 429 |
| GET | `/auth/verify-email?token=` | Public | One-time token in query from the verification email | `{data:{verified:true}}`; the email links to the frontend confirmation page, which calls this endpoint | 422 invalid/expired token |
| POST | `/auth/login` | Public | `{email,password}` | `{data:{accessToken,user}}`; refresh cookie set | 401 invalid credentials; 403 email unverified; 429 |
| POST | `/auth/refresh` | Refresh cookie + `X-CSRF-Token` matching `brightloop_csrf` cookie | No body | `{data:{accessToken,user}}`; rotated refresh cookie | 401 invalid/reused token; 403 CSRF |
| POST | `/auth/logout` | Any authenticated role | No body | 204; refresh family revoked | 401 |
| POST | `/auth/forgot-password` | Public | `{email}` | 202 generic response for all email addresses | 422 invalid input; 429 |
| POST | `/auth/reset-password` | Public | `{token,newPassword}` | `{data:{message}}` | 422 invalid token/password |
| POST | `/auth/change-password` | Any authenticated role | `{currentPassword,newPassword}` | `{data:{message}}`; sessions revoked | 401 wrong current password; 422 invalid password |
| GET | `/me` | Any authenticated role | — | `{data:user}` including linked customer summary | 401 |

## Users

All `/users` endpoints require the `admin` role.

| Method | Path | Request | Success response | Errors |
|---|---|---|---|---|
| GET | `/users?page=&limit=&q=` | Query pagination/search | `{data:[users],meta:{page,limit,total}}` | 401/403; 422 invalid query |
| POST | `/users` | `{full_name,email}` | 201 `{data:staffUser}`; invite email queued | 401/403; 409 duplicate email; 422 |
| GET | `/users/:id` | — | `{data:user}` | 401/403/404/422 |
| PATCH | `/users/:id` | `If-Match: <updated_at>`, `{full_name?,email?}` | `{data:user}` | 401/403/404/409 stale or duplicate/422/428 missing precondition |
| POST | `/users/:id/deactivate` | `If-Match: <updated_at>` | `{data:user}`; refresh sessions revoked | 401/403/404/409 stale/422/428 |
| POST | `/users/:id/reactivate` | `If-Match: <updated_at>` | `{data:user}` | 401/403/404/409 stale/422/428 |
| POST | `/users/:id/reset-password-link` | — | 202 generic response | 401/403/404/422 |

## Workspace data

| Method | Path | Auth/roles | Response |
|---|---|---|---|
| GET | `/workspace` | Any authenticated role | `{data:{customers,subscriptions,invoices,payments,products,plans,taxes,discounts,staff,summary,monthlyRevenue,latestBillingRun,paymentInstructions}}` |

Workspace records are read directly from the billing tables and reporting
views. Customer accounts receive only their linked customer's subscriptions,
invoices, payments, and summary; product catalog and staff-only information are
not returned. Cost prices and staff/billing-run details are admin-only.

## Customer marketplace

| Method | Path | Auth/roles | Request | Success response |
|---|---|---|---|---|
| POST | `/marketplace/plans/:id/subscribe` | Customer | No body; plan price and quantity are loaded from the database | 201 `{data:{subscription,invoice}}`; invoice email queued |

Only active plans within their availability dates are offered. The request
creates a confirmed subscription and invoice for the plan's configured price
and minimum quantity. It does not collect or automatically confirm payment.
Customers receive UPI instructions if `PAYMENT_UPI_ID` is configured; payment
must be verified and recorded manually.

## Plans

| Method | Path | Auth/roles | Request | Success response |
|---|---|---|---|---|
| POST | `/plans` | Admin | `{name,price,billing_period,min_quantity,available_from,available_to,auto_close,is_closable,is_pausable,is_renewable}` | 201 `{data:plan}` |
| POST | `/products` | Admin | `{name,type,sales_price,cost_price,tax_id,notes}` | 201 `{data:product}` |
| POST | `/taxes` | Admin | `{name,kind,rate}` | 201 `{data:tax}` |
| POST | `/discounts` | Admin | `{name,kind,value,scope,product_ids,min_purchase_amount,min_quantity,start_date,end_date,usage_limit}` | 201 `{data:discount}` |

New plans are available in the customer marketplace once their availability
start date is reached. Admin catalog forms create products, plans, and taxes.
Discount rules can target the whole subscription or selected products.

## Customer and billing operations

| Method | Path | Auth/roles | Request | Success response |
|---|---|---|---|---|
| POST | `/customers` | Admin, staff | `{name,email,company_name,phone}` | 201 `{data:customer}` |
| PATCH | `/me/customer` | Customer | Editable billing profile fields | `{data:customer}` |
| POST | `/subscriptions` | Admin, staff | `{customer_id,plan_id}` | 201 `{data:quotation}` |
| POST | `/subscriptions/:id/confirm` | Admin, staff | No body | `{data:{subscription,invoice}}`; invoice email queued |
| POST | `/subscriptions/:id/action` | Admin, staff, owning customer | `{action:"pause"|"resume"|"close"}` | `{data:subscription}` |
| POST | `/invoices/:id/payments` | Admin, staff | `{method,amount,payment_date,reference,note}` | 201 `{data:payment}` |

Recording a full payment marks the invoice paid and activates its confirmed
subscription. Partial payments remain outstanding. Payment dates cannot be in
the future, and overpayments are rejected.

## Operations

| Method | Path | Auth/roles | Response |
|---|---|---|---|
| GET | `/healthz` | Public | `{data:{status:"ok"}}` |
| GET | `/readyz` | Public | `{data:{status:"ready"}}`; 500 if Postgres or Redis is unavailable |
