# API contract

Base path: `/api/v1`. JSON responses use `{ "data": ... }`; errors use `{ "error": { "code", "message", "details?", "requestId" } }`. Access tokens are sent as `Authorization: Bearer <token>`. Refresh tokens use an HttpOnly, SameSite=Strict cookie. Successful money values will be represented as strings in modules that expose them.

## Authentication

| Method | Path | Auth/roles | Request | Success response | Errors |
|---|---|---|---|---|---|
| POST | `/auth/signup` | Public | `{full_name,email,password}` | 201 `{data: user}`; verification email queued | 409 email taken; 422 invalid fields/password; 429 |
| GET | `/auth/verify-email?token=` | Public | One-time token in query from the verification email | `{data:{verified:true}}` | 422 invalid/expired token |
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

## Catalog

Catalog reads require authentication and are available to admin/staff. Writes require admin. Product list responses omit `cost_price` for staff.

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/taxes` | Percentage or fixed-per-unit tax |
| PATCH | `/taxes/:id` | Update tax |
| GET/POST | `/products` | Staff reads omit cost price |
| PATCH | `/products/:id` | Update product |
| POST | `/products/:id/deactivate` | Soft-deactivate |
| GET/POST | `/products/:id/variants` | List/create nested variants |
| PATCH | `/products/:id/variants/:variantId` | Update nested variant |
| GET/POST | `/plans` | Plan configuration |
| PATCH | `/plans/:id` | Update plan |
| POST | `/plans/:id/deactivate` | Soft-deactivate |
| GET/POST | `/payment-terms` | Payment due-day settings |
| PATCH | `/payment-terms/:id` | Update payment terms |

| GET/POST | `/discounts` | Admin/staff list; admin create |
| PATCH | `/discounts/:id` | Update rule |
| POST | `/discounts/:id/deactivate` | Soft-deactivate |
| PUT | `/discounts/:id/products` | Replace targeted products for product-scope rules |
| GET | `/discounts/:id/redemptions` | Paginated redemption history |
| GET/POST | `/quotation-templates` | List/create templates |
| GET/PATCH | `/quotation-templates/:id` | Read/update template |
| PUT | `/quotation-templates/:id/lines` | Replace template lines |
| POST | `/quotation-templates/:id/deactivate` | Soft-deactivate |

## Customers and subscriptions (partial)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/customers` | Staff list/create |
| GET/PATCH | `/customers/:id` | Staff detail/update |
| GET | `/customers/:id/subscriptions\|invoices\|payments` | Related records |
| GET/PATCH | `/me/customer` | Customer-owned profile |
| GET/POST | `/subscriptions` | Staff list/create; list filters include status/customerId/planId/q and date ranges |
| GET/PATCH | `/subscriptions/:id` | Staff detail/basic edits |
| PUT | `/subscriptions/:id/lines` | Replace lines while draft/quotation |
| POST | `/subscriptions/:id/transition` | Staff/admin state transition |
| GET | `/me/subscriptions[/:id]` | Customer-owned list/detail |
| POST | `/subscriptions/:id/renew` | Create a renewal |
| POST/DELETE | `/subscriptions/:id/discounts[/:discountId]` | Attach/detach discount |
| GET | `/subscriptions/:id/eligible-discounts` | Evaluate current eligibility |
| GET | `/subscriptions/:id/invoice-preview` | Preview billing calculation |
| POST | `/subscriptions/:id/invoices` | Generate next due invoice |
| POST | `/me/subscriptions/:id/{accept,pause,resume,close,renew}` | Customer-owned lifecycle actions |

## Billing, invoices, payments, and reports (partial)

| Method | Path | Notes |
|---|---|---|
| POST | `/billing/run` | Admin-triggered run; `{asOf?,subscriptionId?}` |
| GET | `/billing/runs[/:id]` | Billing run history/detail |
| GET | `/billing/health` | Overdue cursors and recent failures |
| GET | `/invoices[/:id]` | Staff listing/detail; customers may read their own detail |
| POST | `/invoices/:id/{confirm,send,cancel}` | Invoice actions |
| POST | `/invoices/:id/reissue` | Create a replacement draft for a cancelled period |
| GET | `/invoices/:id/pdf` | PDF for authorized customer/staff |
| POST | `/invoices/:id/payments` | Idempotency-Key required |
| GET | `/payments`, `/me/payments` | Staff/customer payment history |
| DELETE | `/payments/:id` | Admin correction; reason required |
| GET | `/reports/{dashboard,active-subscriptions,revenue,overdue,outstanding-aging,mrr-trend,churn}` | CSV via `format=csv` on implemented reports |
| GET | `/audit-log` | Admin audit history |

The recurring schedule runs in the separate BullMQ worker (`npm run worker`).
Run migrations before starting API and worker processes.

## Operations

| Method | Path | Auth/roles | Response |
|---|---|---|---|
| GET | `/healthz` | Public | `{data:{status:"ok"}}` |
| GET | `/readyz` | Public | `{data:{status:"ready"}}`; 500 if Postgres or Redis is unavailable |
