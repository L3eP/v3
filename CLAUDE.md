# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Common Development Commands

| Task | Command | Notes |
|------|---------|-------|
| Install dependencies | `npm install` | Installs all packages listed in `package.json`.
| Run the application (development) | `npm start` or `npm run dev` | Starts the Express server on the port defined in `.env` (default `3000`).
| Run the application (production) | `npm run prod` | Uses `NODE_ENV=production` and enables secure cookie settings.
| Lint the codebase | `npm run lint` | Runs ESLint (if defined) on `server.js`, `routes/`, `middleware/`, `utils/` and other JS sources.
| Run all tests | `npm test` | Executes the test suite (Mocha/Jest – whichever is configured).
| Run a single test file | `npm test -- <path/to/test/file>` | Replace `<path/to/test/file>` with the relative path to the test you want to focus on.
| Run a single test case (Jest) | `npm test -- -t "test name"` | Works when the test runner is Jest.
| Database migration / seed | `node scripts/init-db.js`<br>`node scripts/seed-tickets.js` | Initialise schema and optional seed data.
| Password hash migration | `node scripts/migrate-passwords.js` | Convert existing plain‑text passwords to bcrypt hashes.
| Clean logs | `npm run clean-logs` | Rotates or deletes old log files in `logs/` (if a script is defined).

> **Tip:** All commands are defined in the `scripts` section of `package.json`. Use `npm run <script>` to invoke any custom script.

---

## High‑Level Architecture Overview

- **Application type:** Multi‑Page Application (MPA) with a Node.js/Express backend serving static assets from `public/`.
- **Database:** MySQL accessed via a `mysql2` connection pool defined in `db.js`. Connection parameters come from environment variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
- **Authentication:** Session‑based using `express-session` with a MySQL store (`express-mysql-session`). Passwords are hashed with `bcryptjs`.
- **Authorization:** Role‑Based Access Control (RBAC) – roles `Owner`, `Operator`, `Teknisi`. Middleware in `middleware/auth.js` provides `isAuthenticated` and `isAdmin` checks.
- **Security stack:**
  - `helmet` for secure HTTP headers
  - `express-rate-limit` (global limit + login‑specific limit) to mitigate brute‑force attacks
  - `express-validator` for request validation
  - Input sanitisation throughout the codebase
- **Logging:** `winston` with daily rotation (`logs/app.log`, `logs/error.log`). Logs are rotated weekly.
- **Frontend:** Vanilla HTML/CSS/JS. Each feature page has a dedicated script under `public/js/` (e.g., `dashboard.js`, `ticket-list.js`). Service Worker `sw.js` enables PWA capabilities.
- **Key backend modules:**
  - `server.js` – entry point, registers global middleware, static serving, session handling, and mounts all route modules.
  - `routes/` – per‑feature routers (`auth.js`, `tickets.js`, `users.js`, `activities.js`, `settings.js`).
  - `middleware/` – authentication helpers.
  - `utils/` – reusable helpers (e.g., pagination, file handling).
- **Static assets:** `public/` contains HTML templates, CSS, client‑side JS, uploaded files (`uploads/`), and the Service Worker.
- **Configuration:** Environment variables are loaded via `.env` (managed by `dotenv`). Critical values:
  - `SESSION_SECRET` – secret for signed cookies
  - `PORT` – HTTP port
  - Database credentials as above.

---\n
## Important Directories & Files

| Path | Purpose |
|------|---------|
| `server.js` | Main Express server bootstrap. |
| `db.js` | MySQL connection pool configuration. |
| `middleware/` | Auth & upload middleware (`auth.js`, `upload.js`). |
| `routes/` | Express route definitions for each domain. |
| `public/` | Client‑side assets (HTML, CSS, JS, uploads). |
| `scripts/` | Utility scripts – DB initialisation, password migration, etc. |
| `logs/` | Application and error logs (rotated). |
| `docs/` | Human‑readable documentation (`code_documentation_en.md`, `code_documentation_id.md`). |
| `.env.example` (if present) | Template for required environment variables. |

---

## Development Tips

- **Service Worker caching:** After changing any JS/CSS file, perform a hard refresh (Ctrl+Shift+R) or unregister the Service Worker from DevTools to avoid stale assets.
- **Session store:** In development the MySQL session store persists across restarts. Clearing the `sessions` table resets all logged‑in users.
- **Database migrations:** Always run `node scripts/migrate-passwords.js` after a schema change that affects password storage.
- **Running tests:** The test suite uses the same configuration as the app; ensure a separate test database is defined in `.env` (e.g., `DB_NAME=login_db_test`).
- **Linting:** The repo includes an ESLint configuration. Fix lint errors before committing to keep code style consistent.
- **Debugging:** Logs are emitted with `winston`. Adjust log level in `utils/logger.js` if you need more verbosity.

---

## Cursor / Copilot Rules (if present)

- No specific `.cursor` or Copilot instruction files were detected in this repository. If such files are added later, include relevant rule excerpts here.

---

*End of CLAUDE.md*