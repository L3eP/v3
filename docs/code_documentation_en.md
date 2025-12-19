# Comprehensive Codebase Documentation

This documentation provides an exhaustive overview of the **Login App** codebase, based on a complete analysis of every file in the project. It is intended for developers who need to understand the inner workings of the application.

## 1. Architecture Overview

-   **Type**: Multi-Page Application (MPA) with a Node.js/Express backend.
-   **Database**: MySQL (accessed via `mysql2` connection pool).
-   **Authentication**: Session-based (`express-session` backed by `express-mysql-session`).
-   **Frontend**: Vanilla JavaScript, HTML5, CSS3.
-   **Security**: `helmet` (Headers), `express-rate-limit` (Brute-force protection), `bcryptjs` (Password hashing), `express-validator` (Input validation).

## 2. Backend Structure (`server.js` & `routes/`)

The backend is the core of the application, handling API requests, database interactions, and serving static files.

### 2.1. `server.js` (Entry Point)
-   **Middleware**:
    -   `helmet`: Sets secure HTTP headers (CSP, XSS protection).
    -   `rateLimit`: Global limit of 100 requests per 15 minutes per IP.
    -   `express.json()`: Parses JSON request bodies.
    -   `express.static('public')`: Serves frontend files.
    -   `session`: Configures persistent sessions using MySQL.
-   **Routes**: Mounts all route handlers from the `routes/` directory.
-   **Error Handling**: Global error handler for unhandled exceptions and Multer errors.

### 2.2. Route Handlers (`routes/`)

| File | Purpose | Key Endpoints |
| :--- | :--- | :--- |
| **`auth.js`** | Authentication | `POST /login` (Verifies credentials), `POST /register` (Creates user), `POST /logout` (Destroys session). |
| **`tickets.js`** | Ticket Management | `GET /tickets` (List), `POST /tickets` (Create), `GET /tickets/:id` (Details), `POST /tickets/:id/update` (Edit), `DELETE /tickets/:id` (Remove), `GET /tickets/:id/history` (Status History). |
| **`users.js`** | User Management | `GET /users` (List), `POST /update-profile` (Self-update), `POST /admin/users/update` (Admin update), `DELETE /users/:username` (Admin delete). |
| **`activities.js`** | Activity Logging | `POST /activities` (Log new action), `GET /activities` (Fetch history), `DELETE /activities/:id` (Delete log). |
| **`settings.js`** | App Configuration | `GET/POST /settings/company-name` (Company branding), `GET/POST /settings/company-logo` (Logo upload). |

### 2.3. Database (`db.js`)
-   Exports a `mysql2` connection pool.
-   Uses environment variables (`DB_HOST`, `DB_USER`, etc.) for configuration.
-   **Logging**: Replaced `console.log` with `winston` logger for creating persistent logs in `logs/` directory (with weekly rotation).
-   **Tables**: `users`, `tickets`, `activities`, `settings`, `ticket_status_history`.

## 3. Frontend Structure (`public/`)

The frontend consists of HTML pages paired with specific JavaScript files.

### 3.1. Core Logic
-   **`js/navbar.js`**:
    -   Dynamically renders the sidebar based on user role (`Owner`, `Operator`, `Teknisi`).
    -   Fetches and displays the company name and logo.
    -   Handles mobile sidebar toggling and responsive header resizing.
-   **`js/script.js`**: Handles the login form on `index.html`.
-   **`sw.js`**: Service Worker for caching static assets (PWA capabilities).

### 3.2. Feature Modules

| Page | JS File | Functionality |
| :--- | :--- | :--- |
| **Dashboard** | `js/dashboard.js` | Main admin dashboard. Fetches tickets, calculates stats, renders charts, lists recent tickets, and **Activity Logs (with Delete support)**. |
| **User Dashboard** | `js/user-dashboard.js` | Limited view for standard users. Shows recent tickets and personal activity. |
| **Ticket List** | `js/ticket-list.js` | Displays tickets in a table with **Global Search**, **Pagination**, **Sorting**, **Filtering** (Date, Status, Priority), and **Export** (CSV/PDF). |
| **New Ticket** | `js/new-ticket.js` | Form to create tickets. Uses a **2-column grid layout** for better responsiveness. |
| **Ticket Details** | `js/ticket-details.js` | Shows full ticket info. Displays **Status History Timeline**. Handles Edit and Delete actions. |
| **User List** | `js/user-list.js` | Admin view of users. Includes improved error handling for empty states. |
| **Edit User** | `js/edit-user.js` | Admin form to update another user's profile (Role, Password, etc.). |
| **Activity** | `js/activity.js` | Personal activity log. Allows logging new actions, filtering by technician, and deleting logs (if Owner). |
| **Settings** | `js/settings.js` | User profile settings. Owners can also update Company Name and Logo here. |

## 4. Key Workflows & Logic

### 4.1. Authentication & Authorization
-   **Login**: `POST /login` validates password with `bcrypt.compare()`. On success, session is created.
-   **Role-Based Access Control (RBAC)**:
    -   Middleware `isAuthenticated` checks for active session.
    -   Middleware `isAdmin` (in `middleware/auth.js`) restricts routes to `Owner`.
    -   Frontend `navbar.js` hides links based on `user.role` stored in `localStorage`.

### 4.2. Ticket Status Tracking
-   Any updates to the `status` field in `POST /tickets/:id/update` are automatically logged to the `ticket_status_history` table.
-   Frontend `ticket-details.js` fetches this history via `GET /tickets/:id/history` to render a timeline.

### 4.3. Data Export
-   **CSV**: Generated client-side in `ticket-list.js` and `activity.js` by creating a Blob URL.
-   **PDF**: Generated client-side using `jspdf` and `jspdf-autotable` libraries.

## 5. Database Schema (Inferred)

**`users`**
-   `id`, `username`, `password`, `full_name`, `role`, `phone`, `photo`, `created_at`

**`tickets`**
-   `id`, `aktifitas`, `sub_node`, `odc`, `lokasi`, `pic`, `priority`, `status`, `info`, `evidence`, `created_by`, `created_at`

**`ticket_status_history`**
-   `id`, `ticket_id`, `old_status`, `new_status`, `changed_by`, `changed_at`

**`activities`**
-   `id`, `description`, `username`, `date`

**`settings`**
-   `setting_key` (Primary Key, e.g., 'company_name'), `setting_value`

## 6. Developer Notes

-   **Service Worker**: The app registers `sw.js` to cache assets. If you make changes to CSS/JS and don't see them, try doing a hard refresh or unregistering the service worker.
-   **Local Storage**: The `user` object in `localStorage` is for UI convenience only. Security is handled by the server-side session cookie.
-   **Logging**: Check `logs/app.log` and `logs/error.log` for backend activity. Logs are rotated weekly.
