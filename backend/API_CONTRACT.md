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

## Operations

| Method | Path | Auth/roles | Response |
|---|---|---|---|
| GET | `/healthz` | Public | `{data:{status:"ok"}}` |
| GET | `/readyz` | Public | `{data:{status:"ready"}}`; 500 if Postgres or Redis is unavailable |
