# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A web-based ticketing & activity logging system for managing FTTH (Fiber To The Home) network infrastructure, built for an ISP in Lombok, NTB, Indonesia. Stack: Express 5 + MySQL, vanilla JS frontend (no framework), PWA-enabled.

**Important context**: All text in this app is mixed English/Indonesian. The database schema uses Indonesian column names (aktifitas, lokasi, sub_node, date_selesai). Status values in Indonesian: Terlapor (Reported), Dikerjakan (In Progress), Selesai (Done), Pending.

## Architecture

### Backend

```
server.js → routes/* → middleware/ (auth, upload, asyncHandler)
                  → db.js (mysql2/pool)
                  → services/notification.js (Fonnte WhatsApp API)
                  → utils/ (winston logger, phone sanitizer)
                  → scripts/ (migrate_history.js, add_reference_table.sql)
```

- **Express 5** (`server.js`) — JSON body parsing, session-based auth (MySQL session store via `express-mysql-session`), helmet, rate limiting
- All routes mounted at `/` (e.g. `/tickets`, `/login`, `/api/references`, `/api/geo`)
- **Async handler middleware** (`middleware/asyncHandler.js`) wraps every route to eliminate try/catch — catches async errors, logs them, sends 500
- Security: `helmet`, `express-rate-limit`, `bcryptjs`, `express-validator`, `multer` (image uploads only, 5MB limit)
- Global rate limit: 1000 req/15min; Login: 5 req/15min; Register: 5 req/hour

### Routes

All in `routes/`. No route prefix — paths are literal.

| File | Key Endpoints | Auth |
|------|--------------|------|
| `auth.js` | `POST /login`, `POST /logout`, `POST /register` | Register: Owner only |
| `users.js` | `GET /users`, `GET /users/:username`, `POST /update-profile`, `POST /update-role`, `POST /admin/users/update`, `DELETE /users/:username` | List/manage: Owner/Operator; update-profile: self |
| `tickets.js` | `GET /tickets`, `POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/update`, `DELETE /tickets/:id`, `GET /tickets/:id/history` | All authenticated; access control per ticket (creator, PIC, Owner/Operator) |
| `activities.js` | `GET /activities`, `POST /activities`, `DELETE /activities/:id` | GET: Teknisi see own only; POST: self only; DELETE: Owner/Operator |
| `references.js` | `GET /api/references`, `POST /api/references`, `PUT /api/references/:id`, `DELETE /api/references/:id` | CRUD: Owner only; read: all authenticated |
| `geo.js` | `GET /api/geo` — OLT, ODC, ODP, ONU with coordinates | All authenticated |
| `settings.js` | `GET /settings/company-name`, `POST /settings/company-name`, `GET /settings/company-logo`, `POST /settings/company-logo` | Update: Owner only; read: public (no auth) |

### Frontend

Vanilla JS, no bundler. Each HTML page loads its corresponding JS file. Shared components:

```
public/
├── index.html              Login page (js/script.js)
├── dashboard.html          Owner/Operator dashboard (js/dashboard.js)
│   └── Chart.js (CDN) — bar/pie chart, search, activity log
├── user-dashboard.html     Teknisi dashboard (js/user-dashboard.js)
├── ticket-list.html        Paginated, sortable table with CSV/PDF export (js/ticket-list.js)
│   └── jsPDF + jspdf-autotable (CDN)
├── ticket-details.html     Detail + status timeline + edit modal (js/ticket-details.js)
├── new-ticket.html         Form with reference dropdowns (js/new-ticket.js)
├── activity.html           Log activity form + history list + CSV/PDF export (js/activity.js)
├── ftth.html               Tab-based FTTH CRUD: OLT→ODC→ODP→ONU (js/ftth.js)
├── map.html                Leaflet map, NTB bounds, circle markers (js/map.js)
├── admin.html              Admin panel card grid + sections (js/admin.js)
│   └── Sections: aktifitas, sub_node, ftth (tree), priority, psb (placeholder)
├── register.html           Owner: create user form (js/register.js)
├── user-list.html          Owner/Operator: user table with edit/delete (js/user-list.js)
├── settings.html           Profile settings + company name/logo (Owner) (js/settings.js)
├── edit-user.html          Owner: edit specific user info/role (js/edit-user.js)
├── css/style.css           Single stylesheet, CSS custom properties, responsive
├── sw.js                   PWA service worker (versioned cache, stale-while-revalidate)
├── manifest.json           PWA manifest
└── vendor/fontawesome/     Font Awesome 6 local files
```

**Auth flow**: Login saves `{id, username, fullName, role, phone, photo}` as JSON in `localStorage.getItem('user')`. All pages redirect to `index.html` if missing. `dashboard.js` + `user-dashboard.js` override `window.fetch` to redirect on 401.

**Sidebar** (`navbar.js`): dynamically rendered based on role. Accessible pages:
- All roles: Dashboard, Ticket List, New Ticket, Activity, FTTH, Map
- Owner/Operator: Users
- Owner only: Add User, Admin

**Impersonation**: `navbar.js` reads `localStorage.getItem('originalUser')` to show a "Stop Impersonating" button. The impersonation start UI is not visible in the current frontend code — it would need to be triggered by manually setting `originalUser` in localStorage.

### Role-Based Access Control (RBAC)

Three roles, enforced server-side (`middleware/auth.js`) and client-side (navbar visibility):

| Role | Backend Middleware | Capabilities |
|------|-------------------|-------------|
| **Owner** | `isAdmin` (role === 'Owner') | Full: manage references, users, roles, settings (company name/logo) |
| **Operator** | `isOwnerOrOperator` (Owner or Operator) | View users, manage tickets, delete activities, dashboard, FTTH tree, map |
| **Teknisi** | Authenticated only | Own tickets only (created_by or pic), own activities only, cannot delete |

### Database

MySQL database `login_app_db`:

**`users`** — id, username (UNIQUE), password (bcrypt), full_name, role, phone, photo, created_at

**`tickets`** — id, aktifitas, sub_node, odc, lokasi, pic, priority, status (default Terlapor), info, evidence, created_by, date_selesai, created_at
- Indexes: created_by, status, created_at, priority, sub_node, lokasi
- Statuses: Terlapor → Dikerjakan → Selesai, plus Pending

**`activities`** — id, description, username, date, created_at, date_selesai, ticket_id (FK → tickets ON DELETE SET NULL)

**`ticket_status_history`** — id, ticket_id (FK ON DELETE CASCADE), old_status, new_status, changed_by (FK → users.username), changed_at

**`settings`** — setting_key (PK), setting_value, updated_at. Keys: "company_name", "company_logo"

**`reference_options`** — Created by `scripts/add_reference_table.sql` (NOT in schema.sql). Columns: id, type, label, group_name, latitude (DECIMAL(10,7)), longitude (DECIMAL(10,7)), sort_order, created_at. UNIQUE (type, label, group_name). Types: aktifitas, sub_node, odc, odp, olt, onu, priority. This table serves double duty: dropdown options (aktifitas, sub_node, priority) AND network topology with coordinates (olt, odc, odp, onu).

Sessions are stored in MySQL via `express-mysql-session` (table created automatically).

### Key Business Logic

**Ticket access control**: A ticket's creator and assigned PIC can view/edit it. Owner/Operator can view/edit any ticket. This is checked per request (IDOR protection) — NOT in SQL queries for the list endpoint (the list API uses a WHERE clause for Teknisi: `created_by = ? OR pic = ?`).

**WhatsApp notifications** (`services/notification.js`): Fires-and-forgets on ticket create → PIC + all Operators; on status change → PIC + all Operators. Uses Fonnte API (token in `.env`). Phone numbers standardized to 62xx format by `utils/phone.js`.

**FTTH topology**: Stored in `reference_options` with parent-child hierarchy via `group_name`:
- OLT: no group (top level)
- ODC: group_name = parent OLT label
- ODP: group_name = parent ODC label
- ONU: group_name = parent ODP label
- Admin panel (`admin.js`) renders a tree view; FTTH page (`ftth.js`) renders tab-based CRUD
- `routes/geo.js` returns only nodes with non-null lat/lng for the Leaflet map

**ONU**: Reference type `onu` exists with CRUD in `ftth.js`, but `admin.js` FTTH tree shows `ONU: —` placeholder (no rendering logic for ONU children).

### Known Issues / Quirks

- **`form-.action-buttons`** — CSS selector bug at `style.css:1340` (dash instead of period)
- **Registrasi login** — `.env` has `PORT=3000` but code defaults to `PORT=3002` in server.js
- **Export** — Ticket export first fetches ALL tickets (unpaginated), then filters client-side. The `ticket-list.js` export function fetches `/tickets` without pagination params.
- **Sorting** — Applied client-side on the current page only (`ticket-list.js`), not server-side
- **`POST /tickets/:id/update`** — Uses POST (not PUT/PATCH) with `multipart/form-data` via FormData
- **No test runner** — `package.json` test script is a placeholder

## Commands

```bash
npm install                      # Install all dependencies
node server.js                   # Start server (default port 3002)
node scripts/migrate_history.js  # Create ticket_status_history table
```

Database setup: `mysql -u user -p login_app_db < schema.sql` then `mysql -u user -p login_app_db < scripts/add_reference_table.sql`
