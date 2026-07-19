# Comprehensive Codebase Documentation

**Project:** MAYUNG — Ticketing & FTTH Network Management System  
**Stack:** Node.js / Express 5 + MySQL 8 | Vanilla JS Frontend  
**Last Updated:** 2026-07-19

---

## 1. Architecture Overview

Multi-Page Application (MPA) with:
- **Backend:** Express 5 with session-based auth (MySQL store), Helmet security, rate limiting, centralized async error handling, CSRF protection
- **Database:** MySQL 8 via `mysql2` connection pool — 7 application tables + 1 session table (auto-managed)
- **Frontend:** Vanilla JavaScript (no frameworks), HTML5, CSS3 custom properties, PWA service worker, 16 pages, 19 scripts
- **Notifications:** WhatsApp via Fonnte API (fire-and-forget with catch handlers)
- **Roles:** Owner (full), Operator (manage), Teknisi (self-only)
- **Patterns:** Server-side pagination, RBAC middleware chain, async handler wrapper, `INSERT ... ON DUPLICATE KEY UPDATE`, soft-delete, double-submit cookie CSRF

### File Count

| Layer | Files |
|---|---|
| Backend JS | 1 server + 9 routes + 4 middleware + 2 utils + 1 service = 17 |
| Frontend HTML | 16 pages |
| Frontend JS | 19 client scripts |
| Frontend CSS | 1 stylesheet (~1660 lines) |
| Scripts | 6 SQL migrations + 1 JS migration + 1 shell backup = 8 |
| Docs | 9 markdown files |
| Test | 1 test file (mocha + supertest) |

---

## 2. Server Entry Point — `server.js`

Imports and configures all middleware in order:

1. **Helmet** — CSP directives (scripts from cdn.jsdelivr.net, Google Fonts, self)
2. **JSON parsing** — `express.json()` + `express.urlencoded()`
3. **Static files** — `express.static('public')`
4. **Request logging** — Winston info log per request (method, url, ip, user-agent)
5. **Global rate limiter** — 1000 requests per 15 minutes per IP
6. **Session** — `express-session` with MySQL store (`express-mysql-session`)
   - Key: `session_cookie_name`
   - Secure: false (set true for HTTPS)
   - httpOnly, sameSite: strict, 24h expiry
   - Session store: MySQL, 24h expiration, 15min cleanup interval
7. **Uploads directory** — auto-creates `public/uploads/` if missing
8. **CSRF Protection** — double-submit cookie pattern (after session, before routes)
9. **Routes** — 9 route files mounted at `/`
10. **Global error handler** — Multer errors (400), image filter errors (400), generic (500)

Port: reads `PORT` from `.env`, falls back to **3002**.

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

---

## 4. Routes

All routes are mounted directly at `/` (no /api prefix).

### 4.1 `routes/auth.js`
- **`POST /login`** — Rate limited (5/15min). Validates with express-validator, bcrypt.compare password → session → redirect based on role
- **`POST /logout`** — Destroys session, clears cookie
- **`POST /register`** — Owner only (`isAuthenticated + isAdmin`). Rate limited (5/hour). `upload.single('photo')`. Password bcrypt 10 rounds. Phone sanitized. Role validated via whitelist.

### 4.2 `routes/users.js`
- **`GET /users`** — Owner/Operator only. Explicit column SELECT (no password exposed)
- **`GET /users/:username`** — Self or Owner/Operator
- **`POST /update-profile`** — Self only. Requires current password
- **`POST /update-role`** — Owner only, with `isIn(['Owner','Operator','Teknisi'])` validation
- **`POST /admin/users/update`** — Owner only, with express-validator (role whitelist, password min 6)
- **`DELETE /users/:username`** — Owner only, self-deletion protected

### 4.3 `routes/tickets.js`
- **`POST /tickets`** — Authenticated, `upload.single('evidence')`, express-validator. Triggers WhatsApp notification (fire-and-forget with catch handler).
- **`GET /tickets`** — Paginated (`?page=N&limit=N`, default 10, max 100). Soft-delete filter (`deleted_at IS NULL`). Filterable by search, status, priority, startDate, endDate. RBAC: Teknisi only sees own tickets.
- **`GET /tickets/:id`** — IDOR protected: only creator, PIC, Owner, Operator.
- **`POST /tickets/:id/update`** — IDOR protected. POST + multipart. Role-based field restriction: Teknisi only edits status, info, evidence. Status workflow validation (no jumps). On status change: logs to `ticket_status_history` + WA notification.
- **`DELETE /tickets/:id`** — Soft-delete (sets `deleted_at = NOW()`). Creator, Owner, or Operator. Checks if already deleted.
- **`GET /tickets/:id/history`** — Status timeline LEFT JOINed with users.

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
- **`GET /api/references`** — All reference_options ordered by type, grouped by type. Includes parentPort field.
- **`POST /api/references`** — All roles. Valid type whitelist. Accepts parent_port.
- **`PUT /api/references/:id`** — All roles. Dynamic field update (label, group_name, parent_port, lat, lng).
- **`DELETE /api/references/:id`** — All roles. Includes audit trail.

### 4.7 `routes/geo.js`
- **`GET /api/geo`** — Returns OLT, ODC, ODP, ONU nodes with non-null coordinates. Includes parentPort in response.

### 4.8 `routes/psb.js`
- **`GET /api/psb`** — All roles. List all PSB registrations.
- **`POST /api/psb`** — All roles. `upload.single('photo')`. Manual validation.
- **`PUT /api/psb/:id`** — Owner/Operator only. `upload.single('photo')`. Dynamic field update.
- **`DELETE /api/psb/:id`** — Owner/Operator only. Audit trail.

### 4.9 `routes/inventory.js`
- **`GET /api/inventory`** — All roles. Includes computed `remaining` field.
- **`POST /api/inventory`** — Owner/Operator only. Create inventory item.
- **`PUT /api/inventory/:id`** — Owner/Operator only. Update stock.
- **`DELETE /api/inventory/:id`** — Owner/Operator only. Audit trail.

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
| **dashboard.html** | `dashboard.js` | Owner/Operator. Stats, Chart.js (bar/pie), SLA (avg hours), recent tickets with search, activity log, apiFetch instead of global fetch override |
| **user-dashboard.html** | `user-dashboard.js` | Teknisi. Recent 10 tickets + activities, apiFetch wrapper |
| **ticket-list.html** | `ticket-list.js` | Server-side pagination, client-side sorting, search + filter, CSV/PDF export with summary (by status + priority), scope filter (all/month) |
| **ticket-details.html** | `ticket-details.js` | Detail view, edit modal, status history timeline, soft-delete with showConfirm modal, status workflow error display |
| **new-ticket.html** | `new-ticket.js` | Dynamic dropdowns from `/api/references`, ODC→ODP cascading filter, datalist for aktifitas, PIC from `/users` |
| **activity.html** | `activity.js` | Log activity form, history list, CSV/PDF export, delete with confirm modal |
| **ftth.html** | `ftth.js` | Tab CRUD (OLT→ODC→ODP→ONU), inline add with port field, edit modal with parentPort, delete with confirmation |
| **map.html** | `map.js` | Leaflet map bounded to NTB, circle markers per type, buildChain for parent hierarchy, flyToDevice (klik induk → zoom), Google Maps link, navigation from FTTH tree via URL params |
| **psb.html** | `psb.js` | Form registration + list in 2-column layout, photo upload, detail modal, edit inline modal, status badges |
| **admin.html** | `admin.js` | Card grid (aktifitas, sub_node, priority, add user), inline CRUD, edit/delete modals |
| **inventory.html** | `inventory.js** | Form + list, color-coded stock (red ≤ 2, green OK), edit/delete |
| **settings.html** | `settings.js` | Profile update (current password required), company name/logo (Owner) |
| **register.html** | — | Redirects to admin.html (Add User moved to admin panel) |
| **user-list.html** | `user-list.js` | User table with photo, edit/delete (Owner), showConfirm modal for delete |
| **edit-user.html** | `edit-user.js` | Owner only. Fetch user by username, submit to `/admin/users/update` |

### Shared Utilities
- **`js/csrf.js`** — `csrfFetch(url, opts)` — wrapper fetch with CSRF header for POST/PUT/DELETE. Handles both JSON and FormData.
- **`js/toast.js`** — `showToast(message, type, duration)` — slide-in notification. `showConfirm(message, onConfirm)` — custom modal replacing native `confirm()`.

### CSS (`style.css`)
- ~1660 lines, single file
- CSS custom properties for theming (primary color: #DC2626)
- Responsive breakpoint at 768px
- Status badges, priority badges, sidebar with collapse/expand

### PWA (`sw.js`)
- Cache name: `login-app-v2`
- Pre-cache: all HTML pages, JS files, CSS, manifest, FontAwesome CSS
- Strategy: network-first for API, stale-while-revalidate for static assets

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
| role | VARCHAR(50) | DEFAULT 'Teknisi' |
| phone | VARCHAR(20) | NULL |
| photo | VARCHAR(255) | NULL |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

#### `tickets`
12 columns + `deleted_at` for soft-delete. Status workflow: Terlapor, Dikerjakan, Selesai, Pending.
Indexes on: created_by, status, created_at, priority, sub_node, lokasi.

#### `activities`
6 columns. `ticket_id` (FK → tickets ON DELETE SET NULL). Indexes on: username, ticket_id, date.

#### `ticket_status_history`
6 columns. FK `ticket_id` → tickets (CASCADE). `changed_by` stores username as snapshot (no FK — survives user deletion).

#### `settings`
Key-value store (company_name, company_logo).

#### `reference_options`
Migration table (NOT in schema.sql). Types: aktifitas, sub_node, odc, odp, olt, onu, priority. Includes parent_port for FTTH topology.

#### `psb`
11 columns + photo. Status: Terdaftar, Terpasang, Aktif, Batal.

#### `inventory` + `inventory_log`
For stock management. FK-less for simplicity. Tracks device_type, total_stock, used_stock.

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
Parent-child via `reference_options.group_name`. Port tracking via `parent_port` (e.g., "Port 3/8"):
- OLT: no group (top level)
- ODC: group = parent OLT label, parentPort = port on OLT
- ODP: group = parent ODC label, parentPort = port on ODC
- ONU: group = parent ODP label, parentPort = port on ODP

Map popup shows chain with clickable parent links (flyTo).

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
| **Audit trail** | Logger.warn for all delete operations |

### Remaining Concerns
- `innerHTML` used extensively in frontend (backend already escaped)
- CSP uses `'unsafe-inline'` for scripts — tighten for production
- Session cookie `secure: false` — set to `true` for HTTPS
