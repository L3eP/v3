# Comprehensive Codebase Documentation

**Project:** MAYUNG — Ticketing & FTTH Network Management System  
**Stack:** Node.js / Express 5 + MySQL 8 | Vanilla JS Frontend  
**Last Updated:** 2026-08-27

---

## 1. Architecture Overview

Multi-Page Application (MPA) with:
- **Backend:** Express 5 with session-based auth (MySQL store), Helmet security, rate limiting, centralized async error handling, CSRF protection, a real DB-checking health endpoint, and graceful shutdown
- **Database:** MySQL 8 via `mysql2` connection pool — 11 application tables + 1 session table (auto-managed)
- **Frontend:** Vanilla JavaScript (no frameworks), HTML5, CSS3 custom properties, PWA service worker, 13 pages, 17 scripts
- **Notifications:** WhatsApp via Fonnte API (fire-and-forget with catch handlers)
- **Roles:** Owner (full), Operator (manage), Teknisi (self-only)
- **Patterns:** Server-side pagination, RBAC middleware chain, async handler wrapper, `INSERT ... ON DUPLICATE KEY UPDATE`, soft-delete, double-submit cookie CSRF
- **Testing/CI:** Mocha + Supertest (26 tests, 4 files) run against the real dev database via self-contained tagged fixtures — no separate test database exists (the DB user lacks `CREATE DATABASE`). GitHub Actions runs lint + the same suite against a fresh, disposable MySQL container on every push/PR.

### File Count

| Layer | Files |
|---|---|
| Backend JS | 1 server + 11 routes + 7 middleware + 4 utils + 1 service = 24 |
| Frontend HTML | 13 pages |
| Frontend JS | 17 client scripts |
| Frontend CSS | 1 stylesheet (~4765 lines) |
| Scripts | Upgrade-only SQL migrations + `seed_ci_users.sql` + 1 JS migration + 1 shell backup |
| Test | 4 test files (mocha + supertest) + 1 shared helper |

---

## 2. Server Entry Point — `server.js`

`GET /health` is registered **first**, before helmet/CSRF/session/rate-limiting — it needs no cookie or CSRF token and never gets rate-limited, which matters for load balancers and uptime monitors polling it frequently. It runs `SELECT 1` against the DB and returns `{status, db, uptime}` — 200 if reachable, 503 if not.

Then the rest of the middleware is configured in order:

1. **Helmet** — CSP set manually per static-HTML document (not globally — a global CSP with `'unsafe-inline'` would block the service worker registration)
2. **JSON parsing** — `express.json()` + `express.urlencoded()`
3. **Static files** — `express.static('public')`, with `/uploads` gated behind a session/company-logo check mounted *before* the general static handler
4. **Detail request logging** — Winston `DailyRotateFile` per request (method, url, query, params, redacted body, status, duration, user/role/ip) to `logs/detail-*.log`, separate from the audit trail
5. **Global rate limiter** — 1000 requests per 15 minutes per IP
6. **Session** — `express-session` with MySQL store (`express-mysql-session`)
   - Key: `session_cookie_name`
   - `Secure` automatically true when `NODE_ENV=production`, false otherwise
   - httpOnly, sameSite: strict, 24h expiry
   - Session store: MySQL, 24h expiration, 15min cleanup interval, also accepts `DB_PORT`
7. **CSRF Protection** — double-submit cookie pattern (before static, so the cookie is set on GET requests)
8. **Routes** — 11 route files mounted at `/`
9. **`GET /api/audit`** — inline in `server.js`, Owner-only, paginated read of `audit_logs`
10. **Global error handler** — Multer errors (400), image filter errors (400), generic (500)

Port: reads `PORT` from `.env`, falls back to **3000**. DB pool: `connectionLimit: 10`, `queueLimit: 30` (mysql2's `queueLimit: 0` means *unbounded* queueing, not zero — bounded here so overload fails fast instead of piling up in memory).

**Graceful shutdown:** `SIGTERM`/`SIGINT` close the HTTP server, then the session store, then the DB pool, in that order, with a 10s force-exit fallback if something hangs. This fires naturally on every `npm run dev` file-change restart (`node --watch` sends `SIGTERM` to the old process) and on process managers like PM2.

---

## 3. Middleware

### `middleware/auth.js`
Three guards:
- **`isAuthenticated`** — checks `req.session.user` exists → 401 if missing
- **`isAdmin`** — checks `req.session.user.role === 'Owner'` → 403 if not
- **`isOwnerOrOperator`** — checks role is 'Owner' or 'Operator' → 403 if not

### `middleware/upload.js`
Multer configuration:
- **Storage:** disk, `public/uploads/`, filename sanitized
- **Filter:** images only (jpeg, jpg, png, gif, webp)
- **Limit:** 5MB max file size

### `middleware/asyncHandler.js`
Wraps async route handlers to eliminate try/catch duplication. Catches errors, logs via Winston, returns 500 JSON.

### `middleware/csrf.js`
Double-Submit Cookie CSRF protection:
- Safe methods (GET/HEAD/OPTIONS): set cookie `csrf-token` if missing, skip validation
- State-changing methods (POST/PUT/PATCH/DELETE): validate `X-CSRF-Token` header OR `_csrf_token` body field against cookie
- Timing-safe comparison via `crypto.timingSafeEqual()`
- No additional dependencies needed (parses cookies manually)

### `middleware/audit.js`
`audit(req, action, targetType, targetId, details)` — inserts a row into `audit_logs` (username, IP, JSON details). Failures are swallowed so a logging problem never breaks the actual request. Called from `tickets.js`, `users.js`, `inventory.js`, `ftth.js` (create/update/delete), and `psb.js` (including the auto-created draft ONU on a Terpasang transition, logged as a separate `ftth` entry). Read via `GET /api/audit` (Owner-only, in `server.js`). **Not** called from `settings.js` — its company-name/logo updates are detail-logged but have no audit trail.

### `middleware/detailLog.js` (+ `utils/detailLog.js`)
A second, separate logging system from the audit trail — technical request/response detail (not business-level "who changed what"), written to `logs/detail-*.log` via Winston `DailyRotateFile`, 7-day retention, never exposed in the app UI.

### `middleware/rateLimits.js`
`mutationLimiter(label, max)` — per-route-file rate limiting on top of the global 1000/15min limit. Only counts non-GET/HEAD/OPTIONS requests. `auth.js` uses its own dedicated `loginLimiter`/`registerLimiter` instead (stricter than the generic mutation limiter), and `users.js` layers an additional `profileUpdateLimiter` on top of its generic one.

---

## 4. Routes

All routes are mounted directly at `/` (no /api prefix).

### 4.1 `routes/auth.js`
- **`POST /login`** — Rate limited (5/15min). Validates with express-validator, bcrypt.compare password → session → redirect based on role. Rejects soft-deleted/inactive users (`deleted_at IS NULL AND is_active = TRUE`). Session ID regenerated on login (anti-fixation).
- **`POST /logout`** — Destroys session, clears cookie
- **`POST /register`** — Owner only (`isAuthenticated + isAdmin`) — there is no self-service registration UI, `register.html` was removed. Rate limited (5/hour). `upload.single('photo')`. Password bcrypt 10 rounds, min 8 chars with letters AND numbers. Phone sanitized. Role validated via whitelist.

### 4.2 `routes/users.js`
- **`GET /users`** — Owner/Operator only. Explicit column SELECT (no password exposed), includes `default_sub_node`
- **`GET /users/:username`** — Self or Owner/Operator
- **`POST /update-profile`** — Self only. Requires current password. Password rule same as register: min 8, letters + numbers
- **`POST /update-role`** — Owner only, with `isIn(['Owner','Operator','Teknisi'])` validation, self-demotion blocked
- **`POST /admin/users/update`** — Owner/Operator, with express-validator (role whitelist, password min 8 + letters&numbers, optional `defaultSubNode`). Operator cannot modify an Owner account or promote anyone to Owner.
- **`DELETE /users/:username`** — Owner only, self-deletion protected

### 4.3 `routes/tickets.js`
- **`POST /tickets`** — Authenticated, `upload.single('evidence')`, express-validator. `odc`/`odp` are validated against `ftth_devices` (not `reference_options` — see the FTTH data-split note in §7). Optional `psbId` links the ticket back to a PSB record (validated to exist). Triggers WhatsApp notification (fire-and-forget with catch handler).
- **`GET /tickets`** — Paginated (`?page=N&limit=N`, default 10, max 100). Soft-delete filter (`deleted_at IS NULL`). Filterable by search, status, priority, startDate, endDate. RBAC: Teknisi only sees own tickets.
- **`GET /tickets/:id`** — IDOR protected: only creator, PIC, Owner, Operator.
- **`POST /tickets/:id/update`** — IDOR protected. POST + multipart. Role-based field restriction: Teknisi only edits status, info, evidence. Status workflow validation (no jumps) via `SELECT ... FOR UPDATE` row lock. On status change: logs to `ticket_status_history` + WA notification. If the ticket carries a `psb_id` and the new status is `Selesai`, the linked PSB's status auto-advances `Terdaftar → Terpasang` in the same transaction (forward-only, never overwrites `Batal`).
- **`DELETE /tickets/:id`** — Soft-delete (sets `deleted_at = NOW()`). Creator, Owner, or Operator. Checks if already deleted.
- **`GET /tickets/:id/history`** — Status timeline LEFT JOINed with users.
- **`GET /api/auto-pic?subNode=`** — Suggests a PIC: if `subNode` matches a Teknisi's `default_sub_node`, that Teknisi is preferred; otherwise (or as a tiebreak) picks whoever has the fewest active (`Terlapor`/`Dikerjakan`) tickets. Response includes `matchedSubNode: boolean`.

**Valid Status Transitions:**
```
Terlapor → Dikerjakan, Pending
Dikerjakan → Selesai, Pending, Terlapor
Selesai → Dikerjakan
Pending → Dikerjakan, Terlapor
```

### 4.4 `routes/activities.js`
- **`POST /activities`** — Authenticated, checks username matches session. Optional `ticket_id` FK.
- **`GET /activities`** — Paginated. RBAC: Owner/Operator see all; Teknisi see own only.
- **`DELETE /activities/:id`** — Owner/Operator only. Includes audit trail (logger.warn).

### 4.5 `routes/settings.js`
- **`GET /settings/company-name`** — Public. Default `'MAYUNG'`.
- **`POST /settings/company-name`** — Owner only.
- **`GET /settings/company-logo`** — Public.
- **`POST /settings/company-logo`** — Owner only, `upload.single('logo')`.

### 4.6 `routes/references.js`
- **`GET /api/references`** — All reference_options ordered by type, grouped by type. Includes parentPort field. Types `olt/odc/odp/onu` here are a **legacy, one-time-migrated copy** — see the FTTH data-split note in §7; only non-FTTH types (`aktifitas`, `sub_node`, `priority`, `device_brand`, `inventory_type`) are still authoritative here.
- **`POST /api/references`** — All roles. Valid type whitelist. Accepts parent_port.
- **`PUT /api/references/:id`** — All roles. Dynamic field update (label, group_name, parent_port, lat, lng).
- **`DELETE /api/references/:id`** — All roles. Includes audit trail.

### 4.7 `routes/geo.js`
- **`GET /api/geo`** — Returns OLT, ODC, ODP, ONU nodes with non-null coordinates, read from `ftth_devices` (the authoritative table). Includes parentPort in response.

### 4.8 `routes/psb.js`
- **`GET /api/psb`** — All roles. List all PSB registrations.
- **`POST /api/psb`** — All roles. `upload.single('photo')`. Manual validation.
- **`PUT /api/psb/:id`** — Owner/Operator only. `upload.single('photo')`. Dynamic field update, wrapped in a transaction with `SELECT ... FOR UPDATE`. A genuine (first-time) transition into `status: "Terpasang"` requires an `inventoryId` — it decrements that inventory item's stock, logs to `inventory_log` (`reference_type: 'psb'`), and creates a draft ONU in `ftth_devices` (`is_draft: true`) from the PSB's SN/ODP/port/coordinates, all in the same transaction. Re-saving an already-Terpasang PSB does not re-fire this. `status` itself has no enforced transition graph — see Known Issues.
- **`DELETE /api/psb/:id`** — Owner/Operator only. Audit trail.

### 4.9 `routes/inventory.js`
- **`GET /api/inventory`** — All roles. Includes computed `remaining` field.
- **`GET /api/inventory/log`** — Owner/Operator. Usage/adjustment history; entries triggered by a PSB install carry `reference_type='psb'` + `reference_id=<psb.id>`.
- **`POST /api/inventory`** — Owner/Operator only. Create inventory item.
- **`PUT /api/inventory/:id`** — Owner/Operator only. Update stock (locked via `SELECT ... FOR UPDATE`), logs the delta to `inventory_log`.
- **`DELETE /api/inventory/:id`** — Owner only.

### 4.10 `routes/ftth.js`
The authoritative source for FTTH topology — backed by `ftth_devices`, not `reference_options`.
- **`GET /api/ftth`** — All authenticated. Grouped by type + `stats` (including `draftCount`).
- **`GET /api/ftth/available-ports`** — All authenticated. Unused ports under a given parent (reserves port 1 as the uplink for ODC/ODP, not for OLT).
- **`POST /api/ftth`** — Owner/Operator. Validates brand/total_ports for OLT, unique serial_number for ONU, and no parent-port collision within the same group+type.
- **`PUT /api/ftth/:id`** — Owner/Operator. Also accepts `is_draft: false` to confirm a draft ONU (draft→official only, never reverses). If a device's label changes and it has children (matched by `group_name`), all children are re-parented in the same transaction.
- **`DELETE /api/ftth/:id`** — Owner only. Rejected if the device still has children.

### 4.11 `routes/stats.js`
- **`GET /api/stats/month`** — All authenticated. Aggregated dashboard stats (open ticket counts/aging, done this month/week, average SLA hours), plus a Teknisi-specific block (my open, my attention, my week's activities) when `role === 'Teknisi'`.

---

## 5. Services & Utilities

### `services/notification.js`
WhatsApp notifications via [Fonnte API](https://fonnte.com):
- **`sendWhatsApp(phone, message)`** — Single message. Phone cleaned to format `62xx`.
- **`notifyTicketCreated(ticket)`** — Sends to creator + PIC (not all operators anymore).
- **`notifyTicketUpdated(ticketId, oldStatus, newStatus, changedBy, ticketData)`** — Sends to creator + PIC.
- Uses `Promise.allSettled()` for parallel sending.
- All calls have `.catch()` handlers in `tickets.js`.

### `utils/logger.js`
Uses `winston` + `winston-daily-rotate-file`:
- Transports: error log file + app log file (daily rotated, weekly pattern `YYYY-WW`, 20MB max, 14 day retention)
- Console transport added when `NODE_ENV !== 'production'`

### `utils/phone.js`
Standardizes Indonesian phone numbers to `62xx` format.

---

## 6. Frontend

### Navigation (`navbar.js`)
Dynamic sidebar with 5 main menus + sub-navigation:
- **Dashboard** — single link
- **Tiket** → Ticket List, New Ticket
- **Laporan** → Activity, PSB
- **Jaringan** → FTTH, Peta
- **Panel** → Inventory, Users, Admin (Owner only)

Expand/collapse state saved in localStorage. Role-based visibility. Collapsible sidebar for desktop. Hamburger menu for mobile. Dropdown user menu (Settings, Logout). Impersonation support.

### Pages & Scripts

| Page | Script | Features |
|---|---|---|
| **index.html** | `script.js` | Login form → csrfFetch POST /login → save user to localStorage |
| **dashboard.html** | `dashboard.js` | All roles (a Teknisi-specific block is layered on via `GET /api/stats/month`). Stats, Chart.js (bar/pie), SLA (avg hours), recent tickets with search, activity log, apiFetch instead of global fetch override |
| **ticket-list.html** | `ticket-list.js` | Server-side pagination, client-side sorting, search + filter, CSV/PDF export with summary (by status + priority), scope filter (all/month). Ticket creation is a modal (`#newTicketModal`) on this page, not a separate page — the sub-node select re-queries `GET /api/auto-pic?subNode=` on change |
| **ticket-details.html** | `ticket-details.js` | Detail view, edit modal, status history timeline, soft-delete with showConfirm modal, status workflow error display |
| **activity.html** | `activity.js` | Log activity form, history list, CSV/PDF export, delete with confirm modal |
| **ftth.html** | `ftth.js` | Tab CRUD (OLT→ODC→ODP→ONU), inline add with port field, edit modal with parentPort, delete with confirmation. Draft ONU entries (auto-created from a PSB install) show an amber "needs confirmation" badge and a one-click confirm button |
| **map.html** | `map.js` | Leaflet map bounded to NTB, circle markers per type, buildChain for parent hierarchy, flyToDevice (klik induk → zoom), Google Maps link, navigation from FTTH tree via URL params |
| **psb.html** | `psb.js` | Form registration + list in 2-column layout, photo upload, detail modal, edit inline modal, status badges. Editing status into "Terpasang" reveals an ONU inventory picker (required for that transition) |
| **admin.html** | `admin.js` | Card grid (aktifitas, sub_node, priority, add user), inline CRUD, edit/delete modals. Its FTTH tree view still reads the legacy `/api/references` copy, not `/api/ftth` — see §7 |
| **inventory.html** | `inventory.js` | Form + list, color-coded stock (red ≤ 2, green OK), edit/delete, usage log |
| **settings.html** | `settings.js` | Profile update (current password required), company name/logo (Owner) |
| **user-list.html** | `user-list.js` | User table with photo, edit (`#editUserModal`, including a Teknisi's `default_sub_node` territory)/delete (Owner), showConfirm modal for delete |
| **offline.html** | — | PWA offline fallback — served by `sw.js` when a navigation request fails with no cache hit |

**Removed pages** (functionality merged elsewhere): `new-ticket.html` → modal in `ticket-list.html`; `register.html` → self-registration removed, Owner creates users via `user-list.html`'s add-user modal; `edit-user.html` → `#editUserModal` in `user-list.html`; `user-dashboard.html` → merged into the single `dashboard.html`.

### Shared Utilities
- **`js/csrf.js`** — `csrfFetch(url, opts)` — wrapper fetch with CSRF header for POST/PUT/DELETE. Handles both JSON and FormData.
- **`js/toast.js`** — `showToast(message, type, duration)` — slide-in notification. `showConfirm(message, onConfirm)` — custom modal replacing native `confirm()`.

### CSS (`style.css`)
- ~4765 lines, single file
- CSS custom properties for theming (primary color: #DC2626)
- Responsive breakpoint at 768px, 33 media queries total
- Status badges, priority badges, sidebar with collapse/expand

### PWA (`sw.js`)
- Cache name is versioned (`CACHE_NAME` in `sw.js`) — **must be bumped on every frontend change** or clients keep serving stale cached JS/CSS/HTML
- Pre-cache: all HTML pages, JS files, CSS, manifest, FontAwesome CSS, `offline.html`, `pdf-loader.js`
- Strategy: stale-while-revalidate for static assets; a failed navigation request with no cache hit serves `offline.html`
- Chart.js and jsPDF/jspdf-autotable are lazy-loaded on demand (via `pdf-loader.js` for the latter), not eagerly bundled into the precache

---

## 7. Database

### Tables

#### `users`
| Column | Type | Constraints |
|---|---|---|
| id | INT | PK, AUTO_INCREMENT |
| username | VARCHAR(255) | UNIQUE, NOT NULL |
| password | VARCHAR(255) | NOT NULL — bcrypt hash |
| full_name | VARCHAR(255) | NOT NULL |
| role | VARCHAR(50) | DEFAULT 'User' |
| phone | VARCHAR(20) | NULL |
| photo | VARCHAR(255) | NULL |
| deleted_at | TIMESTAMP | NULL — soft-delete |
| is_active | BOOLEAN | DEFAULT TRUE — login rejects FALSE |
| default_sub_node | VARCHAR(100) | NULL — free text, not FK; a Teknisi's territory, used by `GET /api/auto-pic` |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `tickets`
Core columns + `deleted_at` for soft-delete, `odp`, and `psb_id` (FK → psb, ON DELETE SET NULL). Status workflow: Terlapor, Dikerjakan, Selesai, Pending.
Indexes on: created_by, status, created_at, priority, sub_node, lokasi, psb_id.

#### `activities`
`ticket_id` (FK → tickets ON DELETE SET NULL). Indexes on: username, ticket_id, date.

#### `ticket_status_history`
FK `ticket_id` → tickets (CASCADE). `changed_by` is a FK to `users.username` with **ON DELETE SET NULL** — history survives user deletion rather than storing a plain unlinked snapshot.

#### `settings`
Key-value store (company_name, company_logo).

#### `reference_options`
Created by `scripts/add_reference_table.sql` (not in `schema.sql`). Still the source for non-FTTH dropdowns (aktifitas, sub_node, priority, device_brand, inventory_type). Also still holds a **legacy, one-time-migrated copy** of `olt/odc/odp/onu` entries that `admin.html`'s FTTH tree view reads — see the FTTH data-split note below.

#### `ftth_devices`
Split out of `reference_options` into its own table. Columns: id, type (ENUM olt/odc/odp/onu), label, group_name, parent_port, brand, total_ports, serial_number, latitude, longitude, sort_order, `is_draft` (default FALSE — TRUE for ONU entries auto-created from a PSB "Terpasang" transition, pending staff confirmation). UNIQUE (type, label, group_name). This is the actual source of truth for FTTH topology + port tracking, served via `/api/ftth` and `/api/geo`.

**FTTH data split (architecture quirk):** `ftth.html`'s tab CRUD reads/writes `ftth_devices` via `/api/ftth`, while `admin.html`'s tree view still reads `/api/references` (the legacy copy). Data created/edited through one UI does not automatically appear correct in the other.

#### `psb`
Customer install records: customer_name, address, phone, onu_sn, onu_port, odp_label, latitude, longitude, photo, notes, status (Terdaftar → Terpasang → Aktif, or Batal), created_by, created_at, updated_at. **No enforced state-machine on `status`** — see Known Issues.

#### `inventory` / `inventory_log`
Device stock tracking + usage/adjustment history. `inventory_log` has `reference_type`/`reference_id` columns — a PSB-triggered decrement writes `reference_type='psb'`, `reference_id=<psb.id>` so the log entry traces back to the install that consumed the stock.

#### `audit_logs`
action/target_type/target_id/username/ip_address/details (JSON), written by `middleware/audit.js`, read via `GET /api/audit` (Owner-only).

#### `public_reports`
Created by `scripts/add_reports_table.sql`; no route currently reads or writes it.

---

## 8. Key Workflows

### Ticket Creation → WhatsApp
1. User fills form → POST /tickets (FormData)
2. Backend validates, checks ownership
3. Inserts into tickets
4. Fires WA notification to creator + PIC (async, caught)
5. Returns 201

### Status Change → Validated
1. POST /tickets/:id/update with new status
2. Validates status transition (Terlapor → Dikerjakan ✓, Terlapor → Selesai ✗)
3. Validates role-based fields (Teknisi: status+info+evidence only)
4. Logs to ticket_status_history
5. Fires WA notification
6. Returns updated ticket

### Soft-Delete
1. DELETE /tickets/:id
2. Sets `deleted_at = NOW()` (no hard delete)
3. All queries filter `WHERE deleted_at IS NULL`
4. History remains accessible

### FTTH Hierarchy with Ports
Parent-child via `ftth_devices.group_name` (the authoritative table — see the data-split note in §7). Port tracking via `parent_port`:
- OLT: no group (top level)
- ODC: group = parent OLT label, parentPort = port on OLT
- ODP: group = parent ODC label, parentPort = port on ODC
- ONU: group = parent ODP label, parentPort = port on ODP

Map popup shows chain with clickable parent links (flyTo).

### PSB → Ticket → Inventory → FTTH loop
A ticket created from a PSB carries `psb_id`. When that ticket reaches "Selesai", the linked PSB auto-advances `Terdaftar → Terpasang` (forward-only, never overwrites `Batal`). Separately, editing a PSB directly into `Terpasang` for the first time requires picking an ONU from `inventory`; that decrements its stock and creates a draft ONU in `ftth_devices`, which staff confirm on the FTTH page. Both transitions are guarded by `SELECT ... FOR UPDATE` locks against concurrent double-firing.

### Auto-PIC
`GET /api/auto-pic?subNode=` assigns the Teknisi with the fewest active tickets; a `subNode` match against a Teknisi's `default_sub_node` is preferred first, falling back to the global lightest-load pick when nobody matches.

---

## 9. Security

| Measure | Implementation |
|---|---|
| **Passwords** | bcryptjs, 10 rounds |
| **Sessions** | MySQL store, httpOnly, sameSite: strict, 24h |
| **Rate limiting** | Global 1000/15min, Login 5/15min, Register 5/hour |
| **Input validation** | express-validator (trim, escape, isLength, isIn whitelist) |
| **SQL injection** | Parameterized queries via mysql2 |
| **IDOR** | Ownership check on every ticket/user resource |
| **CSRF** | Double-submit cookie, all state-changing requests |
| **CSP** | Helmet with Content Security Policy |
| **File upload** | Type whitelist (images), 5MB limit, filename sanitization |
| **Error handling** | Centralized asyncHandler, no stack traces exposed |
| **Audit trail** | `audit_logs` table (business-level, Owner-readable via `GET /api/audit`) — separate from `logs/*.log` (Winston, technical detail, not exposed in-app) |
| **DB pool** | `queueLimit: 30` — overload fails fast instead of queueing unboundedly in memory |
| **Restart safety** | `GET /health` checks real DB connectivity; graceful shutdown closes server/session-store/pool cleanly on `SIGTERM`/`SIGINT` |

### Remaining Concerns
- `innerHTML` used extensively in frontend (backend already escaped)
- The static-page CSP still includes `'unsafe-inline'` on `script-src` — intentional per an inline code comment (a stricter policy blocks the Service Worker registration script), not an oversight, but still worth revisiting if that constraint ever changes
- Session cookie `Secure` is now automatic (`NODE_ENV=production`) rather than hardcoded — no action needed, but confirm `NODE_ENV` is actually set correctly in production
- See §10 Known Issues for the PSB status state-machine gap

---

## 10. Known Issues / Quirks

- **FTTH data split** — see §7. `ftth_devices` vs. the legacy `reference_options` copy can drift; check which table/endpoint the surface you're editing actually uses.
- **`psb.status` has no enforced state machine** — unlike `tickets`' `VALID_TRANSITIONS`, `routes/psb.js` only checks list membership, not a valid-transition graph, and the edit dropdown always shows all 4 statuses. A record can jump `Terdaftar → Aktif` directly, silently skipping the inventory-decrement + draft-ONU automation that only fires on an explicit `→ Terpasang` transition. Fixing this would need a `VALID_PSB_TRANSITIONS` map mirroring `tickets.js`'s pattern — a product decision (is skipping ever legitimate?) as much as a technical one.
- **`public_reports` table is unused** — created by a migration script but no route references it.
- **Ticket export** fetches ALL tickets (unpaginated) then filters client-side.
- **Ticket list sorting** is applied client-side to the current page only, not server-side.
- **`POST /tickets/:id/update`** uses POST (not PUT/PATCH) with `multipart/form-data`.
- **No separate test database** — see §1 and the Testing section; tests run against the real dev database via tagged, self-cleaning fixtures because the DB user has no `CREATE DATABASE` grant.
