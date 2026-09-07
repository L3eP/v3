# Comprehensive Codebase Documentation

**Project:** MAYUNG — Ticketing & FTTH Network Management System for an ISP in Lombok, NTB.
**Stack:** Node.js / Express 5 + MySQL 8 · vanilla-JS multi-page frontend (no framework, no bundler) · PWA · WhatsApp notifications via Fonnte.
**Last updated:** 2026-09-07 (branch `chore/sync-working-tree`, after the "Sprint 1–4" fixes and the SLA/KPI + mysql2-override work).

All text is mixed English/Indonesian. The DB schema uses Indonesian column names (`aktifitas`, `lokasi`, `sub_node`, `date_selesai`). Ticket statuses: `Terlapor → Dikerjakan → Selesai`, plus `Pending`. PSB statuses: `Terdaftar → Terpasang → Aktif`, or `Batal`.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Request lifecycle — `server.js`](#2-request-lifecycle--serverjs)
3. [Middleware](#3-middleware)
4. [Routes](#4-routes)
5. [Services & utilities](#5-services--utilities)
6. [Frontend](#6-frontend)
7. [Database](#7-database)
8. [Cross-cutting patterns](#8-cross-cutting-patterns)
9. [Key workflows](#9-key-workflows)
10. [Security](#10-security)
11. [Testing & CI](#11-testing--ci)
12. [Known issues / sharp edges](#12-known-issues--sharp-edges)

---

## 1. Architecture overview

Multi-page application (MPA), not an SPA — every navigation is a full page load. Each `*.html` loads a same-named JS file plus a few shared ones.

| Layer | Files |
|---|---|
| Backend JS | `server.js` + 11 routes + 7 middleware + 5 utils + 1 service |
| Frontend | 13 HTML pages + 17 JS scripts (5 shared + 12 per-page) + 1 CSS (~5070 lines) |
| Database | 11 application tables + `sessions` (auto-managed by `express-mysql-session`) |
| Scripts | Upgrade-only SQL migrations + seed SQL + 2 Node backfills + 2 shell scripts |
| Tests | 9 `*.test.js` files (Mocha + Supertest) + 1 shared helper — ~55 `it()` cases |

**Core design decisions**

- **Session-based auth** with a MySQL session store — sessions survive server restarts (and `node --watch` reloads).
- **RBAC** enforced server-side by `middleware/auth.js` (three guards) and cosmetically by `navbar.js` (sidebar visibility). The server guard is authoritative.
- **`asyncHandler`** wraps every route handler, so route code contains no `try/catch` boilerplate; deliberate validation failures still `return res.status(4xx).json(...)`.
- **Transactions with `SELECT … FOR UPDATE`** for any write that has a cross-row invariant or a once-only side effect (see §8.6).
- **Two separate logging systems**: `audit_logs` (business-level, Owner-readable in-app) and `logs/detail-*.log` (technical, file-only).
- **No bundler / build step** — CDN libraries are lazy-loaded on demand.

---

## 2. Request lifecycle — `server.js`

The middleware order matters — several real security issues were caused by getting it wrong. The full chain, and why each position:

1. **`GET /health`** — registered *first*, before helmet/CSRF/session/rate-limit. Load balancers and uptime monitors need no cookie or CSRF token and must not be rate-limited. Runs `SELECT 1` against the DB and returns `{status, db, uptime}` — 200 if reachable, 503 if not.
2. **`app.set('trust proxy', 1)`** unless `TRUST_PROXY=false`. Without it, `req.ip` is the reverse proxy's address for *every* client — the rate limiter becomes one shared counter for the whole office, and `audit_logs` records the wrong IP.
3. **Body parsers** — `express.json()` + `express.urlencoded()`. Multipart is handled per-route by multer, not here.
4. **Helmet** with `contentSecurityPolicy: false`. A global CSP with `'unsafe-inline'` on `script-src` would block the service-worker registration script, so CSP is set manually per HTML document in step 6. Referrer-Policy is changed from the default `no-referrer` to `strict-origin-when-cross-origin` — otherwise OpenStreetMap rejects tile requests with 403.
5. **`csrfMiddleware`** — *must be before* `express.static`. Otherwise the `csrf-token` cookie is never set when the browser GETs a static HTML page and the first POST always 403s.
6. **Per-document CSP header** — only for `req.path === '/'` or `*.html`. Allows Google Fonts, cdnjs (Leaflet, jsPDF), jsdelivr (Chart.js), OSM tiles.
7. **Session** (`express-session` + `express-mysql-session`). Moved *before* `express.static` in a security fix: previously `public/uploads/` (ticket evidence, profile & PSB customer photos — all private) was served to the internet without a login because the session was set up afterwards. Cookie: `httpOnly`, `sameSite: strict`, `Secure` when `NODE_ENV=production`, 24h. Store: 24h expiration, 15-min cleanup; also reads `DB_PORT`.
8. **`/uploads` auth gate** — a small middleware before the general static handler: requires a session, *except* when the file is the currently-active `settings.company_logo` (it shows on the login page, pre-auth). Checked against the live settings value, so a newly-uploaded logo is covered automatically.
9. **`express.static('public')`** — HTML, CSS, JS, images, `sw.js`, `manifest.json`.
10. **`detailLog`** — logs every request to `logs/detail-*.log` on `res.on('finish')` (method, url, query, params, body with sensitive-key redaction, status, duration, user/role/ip, UA). Technical, never shown in-app, 7-day retention.
11. **`globalLimiter`** — 1000 requests / 15 min per IP. Static assets (step 9) short-circuited already, so this really only counts dynamic requests. See §12 — this number has a dangerous interaction with the built-in polling and the export loop.
12. **Route mounts** — all 11 routers at `/`. Mount order matters for the per-route rate limiters (§8.2).
13. **`GET /api/audit`** inline (Owner-only, paginated) — reads `audit_logs`.
14. **Global error handler** — catches `MulterError` (400), non-image content (`INVALID_IMAGE_CONTENT`, 400), everything else 500.
15. **`app.listen`** + **graceful shutdown**: `SIGTERM`/`SIGINT` → close the HTTP server → session store → DB pool, with a 10s force-exit fallback. Fires naturally on every `npm run dev` file-change restart.

DB pool: `connectionLimit: 10`, `queueLimit: 30`. mysql2's `queueLimit: 0` means *unbounded* queueing (not "no queue"); bounded here so overload fails fast with `ER_CON_COUNT_ERROR` instead of piling up in memory.

---

## 3. Middleware

### `middleware/auth.js`
Three guards: `isAuthenticated` (`req.session.user` exists → else 401), `isAdmin` (`role === 'Owner'` → else 403), `isOwnerOrOperator` (`Owner`/`Operator` → else 403).

### `middleware/asyncHandler.js`
`Promise.resolve(fn(req,res,next)).catch(...)` — logs the error via Winston and sends 500. Removes `try/catch` from route code.

### `middleware/csrf.js`
Double-submit cookie pattern. GET/HEAD/OPTIONS: set cookie `csrf-token` (non-httpOnly, `sameSite: strict`, `Secure` in production) if missing. POST/PUT/PATCH/DELETE: compare the cookie against the `X-CSRF-Token` header using `crypto.timingSafeEqual` → 403 on mismatch, then **rotate the token**. Mounted before the multipart body parser, so a FormData token must travel in the header (the frontend's `csrfFetch` also appends a `_csrf_token` field as a fallback).

### `middleware/rateLimits.js`
Factory `mutationLimiter(label, max = 60)` — one instance per route file, counts only non-GET/HEAD/OPTIONS, 15-min window per IP. **Every limiter's `message` is an object** (`{ message: '...' }`), not a string — `express-rate-limit`'s default handler does `res.send(message)` verbatim, so a string goes out as `text/html` and the frontend's `await response.json()` on a 429 throws `SyntaxError`, masking the real message with a generic "An error occurred". **Attached per-route, not via `router.use()`** — all routers mount at `/`, so a path-less `router.use(fn)` also runs for requests that end up handled by a *later*-mounted router, leaking quota across endpoint groups (found when the `users` quota was exhausted by combined `/tickets`+`/psb`+`/ftth` traffic).

### `middleware/upload.js`
Multer: disk storage in `public/uploads/`, filename `<timestamp>-<sanitised>`, 5 MB limit, images only. The exported `.single(field)` is **wrapped with magic-byte verification** — after the file is written, its first bytes are checked (JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46 38`, WebP `RIFF`…`WEBP`). A `x.png` that actually contains HTML is deleted and rejected with `INVALID_IMAGE_CONTENT`.

### `middleware/detailLog.js` (+ `utils/detailLog.js`)
Technical request/response logging to `logs/detail-*.log` (Winston `DailyRotateFile`, no console transport, 7-day retention). Sensitive keys (`password`, `newPassword`, `currentPassword`, `token`, `cookie`, `secret`, …) become `***`; object depth is capped; long strings are truncated.

### `middleware/audit.js`
`audit(req, action, targetType, targetId, details)` → `INSERT audit_logs` (username, IP, JSON `details`). Failures are swallowed — a logging problem never breaks the request. Called from `tickets.js`, `users.js`, `inventory.js`, `ftth.js`, `references.js`, `psb.js` (including the auto-created draft ONU on a Terpasang transition, logged as a separate `ftth` entry). **Not** called from `settings.js` — its updates are detail-logged but have no queryable audit trail.

---

## 4. Routes

All mounted at `/` (no prefix). None of them store data directly — everything goes through `db.js`. Each file exports an `express.Router()` and defines `mapX()` DTO helpers (snake_case DB row → camelCase JSON).

### 4.1 `routes/auth.js`
- **`POST /login`** — `loginLimiter` 5/15 min. `body('username').trim().escape()`, `body('password').trim().notEmpty()` (password is trimmed but **not** escaped — it's only bcrypt-compared, and the trim must match the set-password paths in `register`/`update-profile`/`admin/users/update`). `SELECT * FROM users WHERE username = ? AND deleted_at IS NULL AND is_active = TRUE`. If the user doesn't exist, still run `bcrypt.compare(password, DUMMY_HASH)` to equalise response timing, then 401. On success: `req.session.regenerate()` (anti session-fixation) *before* setting `req.session.user`.
- **`POST /logout`** — destroys the session, clears the cookie.
- **`POST /register`** — `isAuthenticated + isAdmin` (Owner only; no self-service registration UI). `registerLimiter` 5/hour. `upload.single('photo')`. Password bcrypt 10 rounds, min 8 with letters AND numbers. Phone sanitised. Role whitelisted.

### 4.2 `routes/users.js`
- **`GET /users`** — `isOwnerOrOperator`. Explicit column SELECT (no password), includes `default_sub_node`.
- **`GET /users/:username`** — self or Owner/Operator.
- **`POST /update-profile`** — self only, `profileUpdateLimiter` 5/15 min, `upload.single('photo')`. Requires the current password (`bcrypt.compare`). New-password rule = register's. Deletes the old profile photo from disk (except `/uploads/default.png`).
- **`POST /update-role`** — Owner only. `isIn(['Owner','Operator','Teknisi'])`; blocks self-demotion; calls `revokeUserSessions(username)` so the affected user's session dies immediately.
- **`POST /admin/users/update`** — Owner/Operator. Operator cannot modify an Owner account or promote anyone to Owner.
- **`DELETE /users/:username`** + **`POST /users/:username/restore`** — Owner only. Soft-delete (`deleted_at`), blocks self-deletion, revokes sessions.

### 4.3 `routes/tickets.js`
The core file. Helpers: `validateRef` (odc/odp → `ftth_devices`, else → `reference_options`), `lookupFtthDeviceId` (fills `ftth_odc_id`/`ftth_odp_id`), `validateUsername` (PIC must exist and not be soft-deleted), `validatePsbId`, `escapeLike`, `buildTicketWhere`, `SORT_MAP` (sort-column whitelist), `VALID_TRANSITIONS`.

- **`GET /tickets`** — paginated (`?page=&limit=`, default 10, max 100) or, without `?page`, all rows (dashboard + the export loop). Filters: `search` (`LIKE … ESCAPE '\\'` across aktifitas/sub_node/lokasi/pic/info), `status` (comma list → `IN`), `priority`, `startDate`/`endDate` (invalid dates ignored, not 500). Server-side sort via `SORT_MAP` + `?order=ASC|DESC`, default `created_at DESC`. RBAC: Teknisi gets `AND (created_by = ? OR pic = ?)`.
- **`POST /tickets`** — `ticketsMutationLimiter`, `upload.single('evidence')`, express-validator. `createdBy` must equal the session user. Initial status only `Terlapor`/`Pending`. **Transaction**: `INSERT tickets` + `INSERT ticket_status_history (old=NULL, new=status)` on the same connection → commit. After commit: `notifyTicketCreated()` (fire-and-forget) + `audit()`.
- **`GET /tickets/:id`** — IDOR: creator / PIC / Owner / Operator.
- **`POST /tickets/:id/update`** — IDOR (same). Role-based field restriction: for a Teknisi, only `status`/`info`/`evidence` are applied; other fields (aktifitas/pic/priority/odc/odp/lokasi) are silently dropped. **Transaction**: `SELECT … FOR UPDATE` the ticket → validate the transition against `current.status` (the locked row, not a stale snapshot) → if entering `Selesai` and there is no new file and `current.evidence` is empty, **reject** (evidence mandatory, all roles) → `UPDATE tickets` → `INSERT ticket_status_history` → set/clear `date_selesai` → if `current.psb_id` and new status is `Selesai`, `UPDATE psb SET status='Terpasang' WHERE id=? AND status='Terdaftar'` (forward-only, never overwrites `Batal` or a further-advanced status). After commit: WA notification, delete the old evidence file, `audit()` (twice if the PSB was auto-synced). `ftth_odc_id`/`ftth_odp_id` are re-derived whenever `odc`/`odp` text is updated.
- **`GET /tickets/:id/history`** — status timeline `LEFT JOIN users`.
- **`DELETE /tickets/:id`** — **`isAdmin` (Owner only)**. Soft-delete (`deleted_at = NOW()`).
- **`GET /api/auto-pic?subNode=`** — see §9.4.

**Valid status transitions:**
```
Terlapor   → Dikerjakan, Pending
Dikerjakan → Selesai, Pending, Terlapor
Selesai    → Dikerjakan          (the only way out of Selesai)
Pending    → Dikerjakan, Terlapor
```

### 4.4 `routes/activities.js`
- **`POST /activities`** — `activitiesMutationLimiter`, checks `username` matches the session. Optional `ticket_id`. **IDOR guard**: if `ticket_id` is given, the ticket is fetched and — for a Teknisi — must be `created_by`/`pic` of the caller (Owner/Operator can attach to any). Without this, a Teknisi could POST with someone else's `ticket_id` and read back `tickets.aktifitas` via `GET /activities` (whose JOIN isn't ownership-scoped). **Auto-start**: if the caller is a Teknisi and the ticket status is `Terlapor`/`Pending`, a transaction locks the ticket, re-validates, and moves it to `Dikerjakan` + writes history + inserts the activity atomically; otherwise a plain insert. On an auto-transition: `audit()` + WA notification.
- **`GET /activities`** — paginated. Owner/Operator see all (`search`/`username` filters); Teknisi see own only.
- **`DELETE /activities/:id`** — Owner/Operator (checked in-handler). *Note:* `activity.js` only renders the delete button for Owner, so Operator can only reach this via the API.

### 4.5 `routes/psb.js`
Helpers: `validateOdpLabel` (→ `ftth_devices`), `lookupOdpId` (fills `ftth_odp_id`), `checkOnuConflicts` (shared, `utils/ftthConflicts.js`). `VALID_PSB_STATUS = ['Terdaftar','Terpasang','Aktif','Batal']` (membership check only — **no transition graph**).
- **`GET /api/psb`** / **`GET /api/psb/:id`** — authenticated.
- **`POST /api/psb`** — any role, `upload.single('photo')`. `customerName` + `address` required; `odpLabel` validated; phone sanitised; `ftth_odp_id` filled.
- **`PUT /api/psb/:id`** — Owner/Operator, `upload.single('photo')`. **Transaction** + `SELECT … FOR UPDATE`. Build the `UPDATE … SET` from sent fields (each validated). Then the inventory/FTTH side-effect fires when **`status === 'Terpasang' && !existing.ftth_device_id`** (`needsInventoryLink`, cacat #1 Sprint 3 — see §9.5): requires `inventoryId`, locks that inventory row, checks `remaining >= 1`, runs `checkOnuConflicts()` *before* touching stock, then `UPDATE inventory SET used_stock = used_stock + 1` + `INSERT inventory_log ('out', 1, 'psb', <id>)` + `INSERT ftth_devices ('onu', …, is_draft=TRUE)` + `UPDATE psb SET ftth_device_id = <draft.insertId>`. `ftth_device_id` being non-NULL is itself the guard against a second stock decrement.
- **`DELETE /api/psb/:id`** — **`isAdmin` (Owner only)**. Hard-delete.

### 4.6 `routes/ftth.js`
Authoritative FTTH topology (`ftth_devices`, not `reference_options`). `VALID_TYPES = ['olt','odc','odp','onu']`.
- **`GET /api/ftth`** — authenticated. `{ data: <grouped by type>, stats }` where `stats` includes `draftCount`.
- **`GET /api/ftth/available-ports?type=&parent=`** — authenticated. **Must be declared before `/:id`.** Ports in use = children with `group_name = parent` **and matching `type`** (the type filter matters — without it, an ODC and an ODP sharing a `group_name` would lock each other's ports). For ODC/ODP parents, **Port 1 is reserved as the uplink**, so children start at Port 2; OLT children start at Port 1.
- **`POST /api/ftth`** — Owner/Operator. Type-specific validation (OLT: brand + `total_ports >= 1`). For ONU: `checkOnuConflicts()`. For ODC/ODP: inline `WHERE group_name=? AND type=? AND parent_port=?` collision check. Handles `ER_DUP_ENTRY` → friendly message.
- **`PUT /api/ftth/:id`** — Owner/Operator. Also accepts `is_draft: false` to **confirm a draft** (draft→official only; `confirmingDraft` re-runs `checkOnuConflicts()` against *effective* values — the stored value if a field isn't resent — closing the gap where a conflicting draft could be confirmed by omitting the field). If `label` changes and the device has children, a **transaction** updates every child's `group_name` (label-based hierarchy) *and* cascades the new label to `tickets.odc`/`tickets.odp` (via `ftth_odc_id`/`ftth_odp_id`) and `psb.odp_label` (via `ftth_odp_id`) — cacat #5, Sprint 2.
- **`DELETE /api/ftth/:id`** — **`isAdmin` (Owner only)**. Rejected if `SELECT … WHERE group_name = <label>` finds children (the error names them).

### 4.7 `routes/geo.js`
- **`GET /api/geo`** — authenticated, read-only. Four queries (OLT/ODC/ODP/ONU) filtered to `latitude IS NOT NULL AND longitude IS NOT NULL`, plus a `stats` count. Feeds `map.html`.

### 4.8 `routes/references.js`
CRUD over `reference_options`. `referencesMutationLimiter` (max 100 — references are often bulk-edited).
- **`GET /api/references`** — authenticated. Grouped by `type`.
- **`POST` / `PUT` / `DELETE /api/references/:id`** — **`isAdmin` (Owner only)**. `validTypes` whitelist. `ER_DUP_ENTRY` → friendly message. `DELETE` first calls `countReferenceUsage()` — `aktifitas`/`sub_node`/`priority` against `tickets`, `sub_node` also against `users.default_sub_node`, `inventory_type` against `inventory` — and rejects with 400 if the label is still referenced (cacat #6, Sprint 2).

### 4.9 `routes/inventory.js`
- **`GET /api/inventory`** — authenticated. `SELECT *, (total_stock - used_stock) AS remaining`.
- **`GET /api/inventory/log`** — Owner/Operator. `LEFT JOIN inventory` (not INNER — so a deleted item's usage history stays visible; its FK is `ON DELETE SET NULL`).
- **`POST /api/inventory`** — Owner/Operator. `validateDeviceType` against `reference_options` (`type='inventory_type'`). `attributes` stored as JSON.
- **`PUT /api/inventory/:id`** — Owner/Operator. **Transaction** + `SELECT … FOR UPDATE`: deltas computed from the locked row; `total_stock`/`used_stock` guarded (`>= 0`, `used <= total`); each change writes an `inventory_log` row consistent with the final value.
- **`DELETE /api/inventory/:id`** — **`isAdmin` (Owner only)**.

### 4.10 `routes/settings.js`
- **`GET /settings/company-name`** / **`/company-logo`** — **public** (shown on the login page). Name defaults to `'MAYUNG'`.
- **`POST` both** — **`isAdmin` (Owner only)**. `settingsMutationLimiter`. Stored in `settings` via `INSERT … ON DUPLICATE KEY UPDATE`. The old logo file is unlinked from disk.

### 4.11 `routes/stats.js`
- **`GET /api/stats/month`** — authenticated. One aggregate fetch for the dashboard:
  - Open ticket total + aging buckets (`today` / `1–2 days` / `older`), done this month/week/total, `sla.avgHours` = `AVG(TIMESTAMPDIFF(HOUR, created_at, date_selesai))`, `statusBreakdown`.
  - **SLA targets & compliance**: `SLA_TARGET_HOURS = { Urgent: 2, Critical: 4, Moderate: 12, Low: 48 }` (hardcoded, confirmed by the product owner). A priority outside these 4 names is deliberately excluded from every SLA figure (no target to judge it against — never guessed): it's absent from `sla.byPriority` and not counted in `sla.metPercent`'s numerator or denominator. Also `sla.breached` (open tickets already past target) and `sla.atRisk` (open tickets past 80% of target but not yet breached) — an early-warning signal, not just after-the-fact reporting.
  - **`teknisiPerformance`** — per-PIC `doneCount`/`avgHours`/`slaMetPercent` for tickets completed this month. **Owner/Operator only** — the field is `undefined` (absent from the JSON) for a Teknisi caller.
  - **`teknisi`** block (only when `role === 'Teknisi'`): my open / my attention / my week's & today's activities / my done this month (as PIC) / my avg SLA.
  - The by-priority and per-Teknisi breakdowns are derived from the *same* raw "completed this month" result set (fetched once, aggregated in Node), so they can't silently drift apart.

---

## 5. Services & utilities

### `services/notification.js`
WhatsApp via [Fonnte API](https://fonnte.com).
- **`sendWhatsApp(phone, message)`** — normalises the number to `62xx` (`utils/phone.js`), 3 retries with exponential backoff (1s / 3s / 7s), 10s timeout, skips silently if `FONNTE_TOKEN` is empty, does not retry permanent 4xx.
- **`notifyTicketCreated(ticket)`** / **`notifyTicketUpdated(ticketId, oldStatus, newStatus, changedBy, ticketData)`** — fire-and-forget to the ticket creator + PIC. **Operators are deliberately excluded** ("sesuai permintaan client"). `getAllOperatorPhones()` exists but is unused (kept from an earlier design). Also called from `activities.js` on the auto-start transition.
- Each message body ends with `Detail: <APP_URL>/ticket-details.html?id=<id>` — it opens the ticket after the recipient logs in (the page still redirects to login without a session; not an auth bypass). `getAppUrl()` trims a trailing slash, and logs a one-time warning if `APP_URL` is unset in production (link falls back to `http://localhost:<PORT>`, unusable by recipients).

### `utils/logger.js`
Winston + `winston-daily-rotate-file`. Two transports: `logs/error-*.log` (level `error`) and `logs/app-*.log` (all), daily rotation, `datePattern: 'YYYY-MM-DD'`, 20 MB max per file, **7-day retention**. Adds a coloured console transport when `NODE_ENV !== 'production'`.

### `utils/detailLog.js`
A second Winston logger for `logs/detail-*.log` — **no console transport** (detail logs must not appear in the terminal). Used by `middleware/detailLog.js`.

### `utils/phone.js`
`sanitizePhone(str)` → Indonesian number (`08xx`, `+628xx`, `628xx`) normalised to `628xxxxxxxxxx`, or `null` if invalid (min 10 digits). `isValidPhone` is a boolean wrapper.

### `utils/uploads.js`
`cleanupUploadOnError(req)` — unlinks the file multer already wrote to disk if the following `INSERT`/`UPDATE` fails, so `public/uploads/` doesn't accumulate orphans. Called from every upload route's catch path.

### `utils/ftthConflicts.js`
`checkOnuConflicts(queryable, { serialNumber, groupName, parentPort, excludeId })` — checks a candidate ONU's `serial_number` (global uniqueness) and `parent_port` (uniqueness within its `group_name`, i.e. its parent ODP) against `ftth_devices`. `queryable` may be the pool *or* a transaction connection. Shared by three call sites so the rule can't diverge: `ftth.js` `POST`, `ftth.js` `PUT` (including draft confirmation), and the `needsInventoryLink` block in `psb.js` (cacat #2, Sprint 3).

---

## 6. Frontend

### 6.1 Model
- **State** lives in `localStorage.user` = `{id, username, fullName, role, phone, photo}`. Every page (except login/offline) starts with `if (!user) location.href = 'index.html'`.
- **Every write goes through `csrfFetch()`** (`js/csrf.js`) — it re-reads the `csrf-token` cookie on *every* call (not cached), adds the `X-CSRF-Token` header and, for FormData, also appends a `_csrf_token` field.
- **Shared globals** (declared in `.eslintrc.json`): `ROLES`, `isPrivileged()`, `formatId()`, `phoneOnly`/`validatePhone`, `apiFetch()` (401 → redirect), `getTheme/applyTheme/toggleTheme` (dark mode: `localStorage.theme` + `<html data-theme>`), `initPasswordToggle()`, `compressImageFile()` (downscale ≤1920px + step JPEG quality down to <~4.5 MB before upload, respects EXIF orientation), `esc()`, `showModal/showToast/showConfirm`.
- **Dark mode** toggle lives only on Settings (the one page all roles can reach); the state applies app-wide because localStorage is shared per origin.

### 6.2 Sidebar (`navbar.js`)
Rendered from a `MENU` array, filtered by role:
- **Dashboard**, **Aktivitas** (top-level, all roles)
- **Tiket** → Ticket List, PSB
- **Jaringan** → FTTH, Inventory, Peta
- **Panel** (Owner/Operator) → Users; **Referensi** (`admin.html`) added only for Owner
Expand/collapse state in localStorage; collapsible on desktop, hamburger on mobile; user dropdown (Settings, Logout); "Stop Impersonating" button when `localStorage.originalUser` is set. Ticket badge polls `GET /tickets?status=Terlapor&limit=1` every 30 s. A `storage` event (logout in another tab) redirects to login.

### 6.3 Pages & scripts

| Page | Script | Notes |
|---|---|---|
| `index.html` | `script.js` (~32 lines) | Login form → `csrfFetch('/login')` → save user → redirect. |
| `dashboard.html` | `dashboard.js` (~580) | `/api/stats/month` → KPI cards + Chart.js + activity feed + Recent Tickets. Role-adaptive (privileged hub vs Teknisi "Tugas Saya" strip). Auto-refresh 60 s (4 parallel fetches). |
| `ticket-list.html` | `ticket-list.js` (~1330) | Server-side pagination/sort/filter, "new ticket" modal (auto-fills from PSB, auto-assigns PIC), CSV/PDF export with a summary block (`fetchAllFilteredTicketsForExport()` loops `?page=N&limit=100` up to `MAX_PAGES=1000`; summary = top aktifitas, top wilayah, per-month trend, date range from min/max `created_at`). `compressImageFile` for evidence. |
| `ticket-details.html` | `ticket-details.js` (~460) | Detail + timeline, edit modal (dropdowns from `/api/references` + `/api/ftth` + `/users`), "evidence required when moving to Selesai" (label/hint update live). Delete button hidden for non-Owner. |
| `activity.html` | `activity.js` (~390) | Form + history + export. Delete-activity button shown only to Owner. |
| `ftth.html` | `ftth.js` (~520) | Tab CRUD OLT/ODC/ODP/ONU, available-port chips, draft-ONU confirm. `canWrite = isPrivileged(role)` gates Add/Edit/Confirm; delete gated to Owner. Auto-refresh 30 s (skips while a modal is open or the tab is hidden). |
| `map.html` | `map.js` (~210) | Leaflet, NTB bounds, circle markers per type, `flyToDevice()` from popups, accepts `?lat=&lng=&name=` (used by links from `ftth.html`). |
| `psb.html` | `psb.js` (~490) | Form (pick ODP → port chips from `/api/ftth/available-ports`), photo upload, paginated list (8/page, search-aware), edit modal (Owner/Operator). The inventory ONU picker opens whenever `!ftth_device_id` — so a PSB stuck "Terpasang but incomplete" can be completed later. |
| `inventory.html` | `inventory.js` (~340) | CRUD + usage log, dynamic fields per `TYPE_FIELDS`. Read is open to all roles (the Add/Edit/Delete buttons are hidden for a Teknisi); Edit gated by `isPrivileged`, delete by `isOwner`. |
| `admin.html` | `admin.js` (~385) | Owner-only (redirects otherwise). Reference sections + add-user modal. **Its FTTH tree still reads the legacy `/api/references` copy, not `/api/ftth`** — see §7. |
| `user-list.html` | `user-list.js` (~256) | User table + edit/add modal + delete/restore (delete: Owner). Includes `default_sub_node`. Local data-URI avatar fallback (offline-safe). |
| `settings.html` | `settings.js` (~74) | Own profile/password, global theme toggle, company name/logo (Owner). |
| `offline.html` | — | Served by `sw.js` on a failed navigation with no cache. |

**Removed pages** (merged elsewhere): `new-ticket.html` → modal in `ticket-list.html`; `register.html` → self-registration removed; `edit-user.html` → `#editUserModal`; `user-dashboard.html` → single `dashboard.html`.

### 6.4 Shared JS
- `js/constants.js` — the globals in §6.1.
- `js/csrf.js` — `getCsrfToken()` + `csrfFetch()`.
- `js/toast.js` — `esc()` (innerHTML sanitiser), `showModal/showToast/showConfirm`.
- `js/navbar.js` — §6.2.
- `js/pdf-loader.js` — `loadPdfLibs()` lazy-loads jsPDF + jspdf-autotable from cdnjs on first "Export PDF" click (idempotent, promise cached).

### 6.5 CSS
Single `public/css/style.css` (~5070 lines, ~38 `@media` queries). CSS custom properties for theming; dark mode via `<html data-theme>`; role accents `--owner` (red `#DC2626`) / `--teknisi` (blue).

### 6.6 PWA (`sw.js`)
`CACHE_NAME` is versioned — **bump it on every functional frontend change**. Fetch strategy:
- OSM map tiles: bypass the SW entirely.
- **Navigations (`.html`) + same-origin `/js/*.js` + data endpoints (`/tickets`, `/api/*`, non-GET, …): network-first** — try the network, fall back to cache when offline, then `offline.html` for a failed navigation. Changed from stale-while-revalidate (which returned cache first and updated it in the background) so a deploy reaches clients on the *next* load instead of needing a double reload, and so fresh HTML is never served alongside a stale cached JS bundle.
- Images / CSS / fonts / manifest: stale-while-revalidate.
`skipWaiting()` + `clients.claim()` activate the new SW immediately; `activate` deletes old-version caches. Chart.js and jsPDF are lazy-loaded, not precached.

---

## 7. Database

MySQL `login_app_db`. `schema.sql` is the single source of truth for a fresh install. `scripts/*.sql` are upgrade-only history (they fail with "duplicate column/FK" against a fresh `schema.sql`).

### 7.1 Tables

#### `users`
`id` · `username` (UNIQUE) · `password` (bcrypt) · `full_name` · `role` (`Owner`/`Operator`/`Teknisi`) · `phone` · `photo` · `deleted_at` + `is_active` (soft-delete; login rejects either) · `default_sub_node` (free text, not FK — a Teknisi's territory, used by `GET /api/auto-pic`) · `created_at`.

#### `tickets`
`id` · `aktifitas` · `sub_node` · `odc` · **`ftth_odc_id`** · `odp` · **`ftth_odp_id`** · `lokasi` · `pic` · `priority` · `status` (default `Terlapor`) · `info` · `evidence` (upload path) · `created_by` · `created_at` · `date_selesai` · `deleted_at` · `psb_id`.
Indexes: created_by, status, created_at, priority, sub_node, lokasi, odp, deleted_at, psb_id, ftth_odc_id, ftth_odp_id.
- `psb_id` FK → `psb` **SET NULL** — deleting a PSB must not delete its ticket.
- `ftth_odc_id` / `ftth_odp_id` FK → `ftth_devices` **SET NULL** — id links that *accompany* the free-text `odc`/`odp`. Filled wherever that text is validated against `ftth_devices` (`routes/tickets.js`), used by `PUT /api/ftth/:id` to cascade a renamed ODC/ODP label onto old tickets (cacat #5). Added by `scripts/add_ftth_rename_links.sql` + `node scripts/backfill_ftth_rename_links.js`.

#### `ticket_status_history`
`ticket_id` FK → tickets **CASCADE** · `old_status` · `new_status` · `changed_by` FK → `users.username` **SET NULL** (history survives user deletion; fixed via `scripts/fix_fk_history.sql`/`fix_user_history_fk.sql`) · `changed_at`.

#### `activities`
`description` · `username` · `date` · `created_at` · `date_selesai` · `ticket_id` FK → tickets **CASCADE** (deleting a ticket also removes its activity rows — unlike `ticket_status_history.changed_by` which is genuinely SET NULL).

#### `reference_options`
`type` · `label` · `group_name` · `parent_port` · `latitude` · `longitude` · `sort_order`. UNIQUE `(type, label, group_name)`. Created by `scripts/add_reference_table.sql` (not `schema.sql`). Authoritative for `aktifitas`, `sub_node`, `priority`, `device_brand`, `inventory_type`. Also holds a legacy one-time-migrated copy of `olt/odc/odp/onu` that `admin.html`'s tree reads — see the quirk below.

#### `ftth_devices`
`type` (ENUM `olt`/`odc`/`odp`/`onu`) · `label` · `group_name` (= parent's `label` — hierarchy has **no FK**) · `parent_port` · `brand` · `total_ports` · `serial_number` · `latitude` · `longitude` · `sort_order` · `is_draft` (default 0 — 1 for ONU auto-created from a PSB Terpasang transition, pending staff confirmation) · `created_at` · `updated_at`. UNIQUE `(type, label, group_name)`. The actual source of truth for FTTH topology + port tracking, served via `/api/ftth` and `/api/geo`.

> **FTTH data split (architecture quirk).** `ftth.html`'s tab CRUD reads/writes `ftth_devices` via `/api/ftth`; `admin.html`'s tree view still reads `/api/references` (the legacy copy). Data created/edited through one UI won't appear correct in the other. Check which table/endpoint the surface you're editing uses.

#### `psb`
`customer_name` · `address` · `phone` · `onu_sn` · `latitude` · `longitude` · `odp_label` · `onu_port` · **`ftth_device_id`** · **`ftth_odp_id`** · `photo` · `notes` · `status` (default `Terdaftar`) · `created_by` · `created_at` · `updated_at`.
- `ftth_device_id` FK → `ftth_devices` **SET NULL** — the permanent link to the ONU this PSB installed, written inside the Terpasang transaction. PSB and the ONU row are conceptually the same real-world thing, kept as two tables (install workflow vs. network topology) — this column joins them rather than merging the tables. `NULL` is normal & permanent for PSB not yet Terpasang and for ONUs entered directly in `ftth.html`. It also acts as the "already processed" guard against a second stock decrement.
- `ftth_odp_id` FK → `ftth_devices` **SET NULL** — rename link for `odp_label` (same pattern as `tickets.ftth_odc_id`).
- **No enforced state machine on `status`** — see §12.

#### `inventory` / `inventory_log`
`inventory`: `device_type` · `device_name` · `total_stock` · `used_stock` · `location` · `notes` · `attributes` (JSON) · `created_by` · `created_at` · `updated_at`.
`inventory_log`: `inventory_id` FK → inventory **SET NULL** · `change_type` (ENUM `in`/`out`) · `quantity` · `reference_type` / `reference_id` (e.g. `'psb'` + `psb.id`) · `notes` · `created_by` · `created_at`.

#### `audit_logs`
`action` (CREATE/UPDATE/DELETE/LOGIN/LOGOUT) · `target_type` · `target_id` · `details` (JSON) · `username` · `ip_address` · `created_at`.

#### `settings`
`setting_key` (PK) · `setting_value` · `updated_at`. Keys: `company_name`, `company_logo`.

#### `sessions`
`session_id` (PK) · `expires` · `data` (JSON `req.session`). Auto-created; expired rows cleaned every 15 min; 24h expiry. `DELETE /users/:username` and `update-role` delete the relevant session rows.

#### `public_reports`
Created by `scripts/add_reports_table.sql` — **no route reads or writes it**.

### 7.2 Migrations & seeds (`scripts/`)
- **Fresh install:** `schema.sql` + `scripts/add_reference_table.sql` (the latter also seeds the dropdown data). Nothing else.
- **Upgrade an old DB:** run the relevant `add_*.sql` / `fix_*.sql` in order, then the Node backfills. Latest: `add_ftth_rename_links.sql` + `backfill_ftth_rename_links.js` (DBs before 2026-09-07); `add_psb_ftth_link.sql` + `backfill_psb_ftth_link.js` (before 2026-09-04). Backfills only link *exact* matches (`serial_number == psb.onu_sn`, or `(type, label)`), report ambiguous rows instead of guessing, are safe to re-run, and take `--dry-run`.
- **Seeds:** `seed_ci_users.sql` (accounts `pfizer`/`ijang1`, password `test123`, for the throwaway CI DB), `seed_dummy_data.js` / `seed_dummy_august.js` (large non-destructive dummy data, Indonesian names, mapped to real references).
- **Ops:** `backup-db.sh` (timestamped `mysqldump`, 30-day retention), `verify-roles.sh` (curl-based RBAC smoke test against a running server).

---

## 8. Cross-cutting patterns

### 8.1 `asyncHandler` — no try/catch in routes
`asyncHandler(fn)` catches, logs (Winston), and 500s. Route code just `await`s.

### 8.2 Per-route rate limiter, not `router.use()`
All routers mount at `/`, so a path-less `router.use(mutationLimiter('x'))` also runs for requests handled by a *later*-mounted router — leaking quota. Fix: pass the limiter as a middleware argument on each route that needs it. Message is always an object (see §3, `rateLimits.js`).

### 8.3 DTO: `mapX()`
`mapTicket`, `mapUser`, `mapDevice` — snake_case DB row → camelCase JSON. Frontend always speaks camelCase; SQL always snake_case. Adding a column = two edits (SELECT/INSERT + `mapX`).

### 8.4 Reference validation — `.escape()` is dangerous here
`aktifitas`/`odc`/`priority`/… are validated via `validateRef()` against the label stored *verbatim* in `reference_options` / `ftth_devices` (neither table escapes on insert). If they were `.escape()`d here, a label containing `& < > " '` would entity-encode and never match — the ticket is rejected as "invalid" even though it was picked from the app's own dropdown. Safe rendering still happens: the frontend `esc()`s before DOM insertion.

### 8.5 `escapeLike()`
Search boxes build `%term%`. Without escaping `%` and `_` from user input, typing `%` matches every row. One-line helper + `LIKE ? ESCAPE '\\'`.

### 8.6 Transaction + `SELECT … FOR UPDATE`
The most important pattern. Whenever a write has a cross-row invariant or a once-only side effect:
1. `connection = await db.getConnection()` (a dedicated connection, not the pool directly).
2. `beginTransaction()`.
3. `SELECT … FOR UPDATE` the target row(s) — locks them. A concurrent second request **blocks** here until the first commits, then reads the fresh state.
4. Validate (transition, stock, conflicts) **against the locked row**, not a snapshot read outside the transaction.
5. `UPDATE` + `INSERT` into derived tables (history, log) — all on the same connection.
6. `commit()`. On any failure: `rollback()` + `cleanupUploadOnError(req)` + rethrow.
7. `connection.release()` in `finally`.
8. Fire-and-forget effects (WA notification) and `audit()` run *after* commit, un-`await`ed.

Used in: create ticket, update ticket, auto-start from activity, PSB → Terpasang, update inventory, FTTH rename.

---

## 9. Key workflows

### 9.1 Login & session
See §4.1. Timing-safe dummy compare, `regenerate()`, MySQL session store, session revocation on delete/demote, multi-tab logout sync.

### 9.2 Ticket create → WhatsApp
Form → `POST /tickets` (FormData) → validate + ownership check + initial-status guard → **transaction** (`INSERT tickets` + `INSERT ticket_status_history`) → commit → `notifyTicketCreated()` (fire-and-forget) + `audit()` → 201.

### 9.3 Status change → validated + side effects
`POST /tickets/:id/update` → IDOR → strip fields not allowed for a Teknisi → **transaction**: `FOR UPDATE` → validate against `VALID_TRANSITIONS[current.status]` → evidence mandatory if entering `Selesai` → `UPDATE` + `INSERT` history + set/clear `date_selesai` → if `psb_id` and now `Selesai`: `psb.status Terdaftar → Terpasang` (forward-only) → commit → WA notification + delete old evidence file + `audit()`.

### 9.4 Auto-PIC
`GET /api/auto-pic?subNode=` uses `is_local` as the *first sort key*, not a `WHERE` filter:
```sql
SELECT u.username, u.full_name, u.default_sub_node,
  COUNT(t.id) AS active_tickets,
  (u.default_sub_node IS NOT NULL AND u.default_sub_node = ?) AS is_local
FROM users u
LEFT JOIN tickets t ON t.pic = u.username
  AND t.status IN ('Terlapor','Dikerjakan') AND t.deleted_at IS NULL
WHERE u.role = 'Teknisi' AND u.deleted_at IS NULL
GROUP BY u.username, u.full_name, u.default_sub_node
ORDER BY is_local DESC, active_tickets ASC
LIMIT 1;
```
If `?subNode=` matches a Teknisi's `default_sub_node`, they're preferred; among matches, the lightest load. If *nobody* matches, `is_local` is 0 for all and the query falls back to the globally lightest Teknisi — never "no PIC". `LEFT JOIN` so a Teknisi with no active tickets still counts (`active_tickets = 0`).

### 9.5 Auto-start from activity
See §4.4. A Teknisi logging an activity against their own `Terlapor`/`Pending` ticket moves it to `Dikerjakan` inside a transaction (IDOR-guarded, `FOR UPDATE`, WA notification).

### 9.6 The PSB ↔ Inventory ↔ FTTH loop
The densest side-effect in the system. `PUT /api/psb/:id`, inside one `FOR UPDATE` transaction:
- **Guard:** `needsInventoryLink = status === 'Terpasang' && !existing.ftth_device_id`. Not "status is changing" — because the ticket-completion shortcut (§9.3) sets `psb.status = 'Terpasang'` *without* picking inventory, leaving a PSB that's `Terpasang` but `ftth_device_id IS NULL` with no way to complete it under the old "changing *to* Terpasang" condition. The non-NULL `ftth_device_id` is the "already processed" marker.
- Steps: lock the PSB → build the field `UPDATE` → if `needsInventoryLink`: require `inventoryId`, lock that inventory row, check `remaining >= 1` (reject the whole transition if exhausted), run `checkOnuConflicts()` *before* touching stock (reject if the SN/port collides) → `UPDATE psb` → `UPDATE inventory SET used_stock = used_stock + 1` → `INSERT inventory_log ('out', 1, 'psb', <id>)` → `INSERT ftth_devices ('onu', label=<name> - <SN>, group_name=<odp>, parent_port=<port>, is_draft=TRUE)` → `UPDATE psb SET ftth_device_id = <draft.insertId>` → commit → `audit()` ×2.
- The draft ONU (`is_draft=1`) shows in `ftth.html` with a "needs confirmation" chip; staff confirm via `PUT /api/ftth/:id { is_draft: false }`, which re-runs `checkOnuConflicts()` against the stored values.

### 9.7 FTTH rename cascade
`PUT /api/ftth/:id` when `label` changes and the device has children: a transaction updates every child's `group_name` (label-based hierarchy), then — via the `ftth_odc_id`/`ftth_odp_id` links — `UPDATE tickets SET odc = ? WHERE ftth_odc_id = ?` (or `odp`), and `UPDATE psb SET odp_label = ? WHERE ftth_odp_id = ?`. Without this, a rename fixed only the FTTH tree and left stale text in old tickets/PSB.

### 9.8 Port allocation
`GET /api/ftth/available-ports` — ports in use = children with matching `group_name` **and `type`**; Port 1 reserved as uplink for ODC/ODP parents (children start at Port 2), OLT children start at Port 1. ONU conflicts via `checkOnuConflicts()`; ODC/ODP via an inline `WHERE group_name=? AND type=? AND parent_port=?`.

---

## 10. Security

| Measure | Implementation |
|---|---|
| Passwords | bcryptjs 10 rounds; min 8 with letters + numbers; input trimmed consistently across all set-password paths and login. |
| Sessions | MySQL store; `httpOnly`, `sameSite: strict`, 24h; `Secure` when `NODE_ENV=production`; id regenerated on login; revoked on user delete/demote. |
| Timing | Failed login for a non-existent user still runs a dummy `bcrypt.compare`. |
| Rate limiting | Global 1000/15min per IP; login 5/15min; register 5/hour; `profileUpdateLimiter` 5/15min; `mutationLimiter` per endpoint group. All messages are objects (JSON 429s). |
| SQL injection | Parameterised queries (mysql2); `LIKE … ESCAPE` for search; sort column from a whitelist. |
| IDOR | Per-request ownership check on every ticket endpoint and in `POST /activities`. |
| CSRF | Double-submit cookie, `timingSafeEqual`, token rotated after each mutation. |
| Upload | Images only, 5 MB, filename sanitised, **content verified via magic bytes** (not just extension/MIME). |
| Private assets | `public/uploads/` gated behind a session check in `server.js` — except the active `company_logo`. |
| Helmet + CSP | Per-document CSP (a global one with `'unsafe-inline'` blocks the SW). |
| Audit trail | `audit_logs` (business-level, Owner-readable) — separate from `logs/*.log` (technical). |
| DB pool | `queueLimit: 30` — overload fails fast, doesn't queue unboundedly in memory. |
| Restart safety | `GET /health` checks real DB connectivity; graceful shutdown closes server/session-store/pool cleanly. |
| Dependency | `package.json` `overrides` dedupes `express-mysql-session`'s nested `mysql2` onto the patched top-level one (auth-plugin-downgrade + decompression-bomb CVEs). Verify with `npm ls mysql2` → nested should read `deduped`, not a version. Not a bump of `express-mysql-session` itself (3.0.3 is its latest; `npm audit`'s only offered "fix" is a downgrade to 2.x, which drops `mysql2` for the unmaintained `mysql` driver). |

**Remaining notes**
- `innerHTML` is used widely in the frontend, but values are `esc()`d before insertion and the backend also escapes free-text fields.
- The per-document CSP keeps `'unsafe-inline'` on `script-src` — intentional (a stricter policy blocks the SW registration script), but worth revisiting if that constraint changes.
- Confirm `NODE_ENV=production` is actually set in production (drives the `Secure` cookie flag).

---

## 11. Testing & CI

- **Mocha + Supertest**, `npm test` = `mocha test/*.test.js --timeout 10000 --exit` — ~55 `it()` cases across 9 files.
- **No separate test database.** `login_app_user` has no `CREATE DATABASE` grant, so tests hit the same `login_app_db` as the app. Isolation is via fixtures tagged `AUTOTEST_` and cleaned in `afterEach`/`after`. **Never** touch data a test didn't create.
- **`test/helpers/testApp.js`** — memoises one Express app + one login session per account for the *whole* mocha process, because the in-memory `loginLimiter` (5/15min) is shared by every file that `require`s `routes/auth.js`. Also `delete process.env.FONNTE_TOKEN` so no real WhatsApp messages are sent. `routes/inventory.js` and `routes/references.js` were added to the test app on 2026-09-07 (previously untestable).
- **Rate-limit caveat:** `mutationLimiter('tickets')` (60/15min) is also one counter per mocha process. Running `npm test` repeatedly within 15 minutes can exhaust it and 429 a test file. Some files deliberately reuse a single ticket across `it()`s instead of create/delete per test.
- **Coverage by file:**
  - `tickets.test.js` — status state machine (no jumps; evidence required for `Selesai`) + IDOR.
  - `activities.test.js` — auto-start (Teknisi advances a `Terlapor`/`Pending` ticket; Owner/Operator don't).
  - `ftth.test.js` — port double-use rejection + the PUT-without-`group_name` regression.
  - `fase5.test.js` — auto-PIC sub_node matching + PSB → Terpasang (stock decrement, draft ONU, double-decrement guard, stock-exhausted rejection).
  - `validation.test.js` — reference validation (ticket `odp`, PSB `odpLabel`, inventory `deviceType`, user `defaultSubNode`), reference-delete usage protection (cacat #6), ODC/ODP rename cascade end-to-end.
  - `sprint3.test.js` — ONU SN/port conflict rejection on the PSB draft path, the same re-check on draft confirmation without resending the field, and a "Terpasang but incomplete" PSB being completable later without double-decrementing stock.
  - `stats.test.js` — `SLA_TARGET_HOURS` per priority, `metPercent` excluding out-of-set priorities, `breached`/`atRisk` buckets, `teknisiPerformance` absent for a Teknisi caller.
  - `password-trim.test.js` — a password with stray whitespace still logs in after consistent trimming.
  - `api.test.js` — smoke: login rejects empty/invalid, logout, public settings.
- **CI** (`.github/workflows/ci.yml`): every push/PR → `npm ci` → `npx eslint .` → a fresh MySQL 8 container provisioned from `schema.sql` + `scripts/add_reference_table.sql` + `scripts/seed_ci_users.sql` → `npm test`. Prettier is *not* run in CI (manual only).

---

## 12. Known issues / sharp edges

- **`psb.status` has no enforced state machine.** `routes/psb.js` only checks list membership (`VALID_PSB_STATUS`), not a transition graph, and the edit dropdown always shows all 4. A record can jump `Terdaftar → Aktif` directly — and since the inventory/draft-ONU side effect is gated on `status === 'Terpasang' && !ftth_device_id`, jumping to `Aktif` without ever being `Terpasang` means the ONU is never recorded and stock is never decremented. A fix needs a `VALID_PSB_TRANSITIONS` map — a product decision (is skipping ever legitimate?) as much as a technical one.
- **FTTH data split** (§7) — `ftth_devices` vs. the legacy `reference_options` copy can drift; `admin.html`'s tree reads the legacy one.
- **Global rate limit is shared per IP.** 1000/15min, keyed by IP, plus the built-in polling (navbar 30s on every page, dashboard 60s × 4 requests, ftth 30s). Several staff behind one NAT/CGNAT can approach 1000 with nobody clicking. **And** the export loop in `ticket-list.js` can fire up to `MAX_PAGES=1000` requests with no throttle — one large export can 429 everyone on that IP for the rest of the window.
- **Export is a paginated loop**, not streaming — `GET /tickets?page=N&limit=100` with server-side filters, then a client-built summary + raw rows.
- **`activity.js` hides the delete-activity button from Operator** even though the backend allows Owner *and* Operator.
- **`public_reports`** exists but is dead — no route touches it.
- **WhatsApp notifications are fire-and-forget** — failures are logged only, an invalid number is silent, Operators are intentionally not notified.
- **`POST /tickets/:id/update`** uses POST (not PUT/PATCH) with `multipart/form-data`.
- **Tests hit the real DB** — only run `npm test` in dev/staging.
