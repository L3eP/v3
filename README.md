# Ticketing & Activity Logging System

A robust web application for managing tickets and logging user activities, featuring Role-Based Access Control (RBAC), secure authentication, and a responsive dashboard.

## 📚 Documentation

For a detailed technical deep-dive into the codebase, architecture, and API endpoints, please refer to the **[Comprehensive Code Documentation](docs/code_documentation.md)**.

## 🚀 Features

### Authentication & Security
- **Secure Login/Register**: Session-based authentication with secure cookie management.
- **Role-Based Access Control (RBAC)**: Distinct 'Admin' and 'User' roles with protected routes.
- **Security Hardening**:
    - **Password Encryption**: Passwords are hashed using `bcryptjs` for secure storage.
    - **Environment Variables**: Sensitive credentials (DB, Session Secret) are strictly loaded from `.env`.
    - **Secure Headers**: Implemented via `helmet`.
    - **Rate Limiting**: Protection against brute-force attacks (Global & Login-specific).
    - **Input Validation**: Comprehensive validation using `express-validator`.
    - **XSS & IDOR Protection**: Verified resilience against common web vulnerabilities.

### Dashboard & Reporting
- **Interactive Dashboard**:
    - Real-time statistics (Done, On Progress, Total).
    - **Dynamic Charts**: Visualize breakdown by Sub-Node, ODC, or Activity Type.
    - **Activity Log**: View recent user actions, with role-based filtering (Teknisi) and delete capabilities.
- **Ticket Management**:
    - **Responsive Forms**: New grid layout for better usability on all devices.
    - **Status History**: Visual timeline of all status changes on ticket details.
    - **Evidence**: Improved image viewer for ticket attachments.
    - **Advanced Search**: Global search bar to filter tickets by ID, Content, Location, or PIC.
    - **Export**: Download filtered ticket lists as PDF or CSV.
- **System Logs**:
    - **Persistent Logging**: Application and Error logs stored in `logs/` directory.
    - **Log Rotation**: Automatic weekly rotation and cleanup.

### User Management
- **Profile Management**: Update profile details and password.
- **Admin Controls**: Manage users and assign roles.
- **Streamlined Creation**: Admins can create multiple users without being logged out.

## 📂 Project Structure

```
login-app/
├── middleware/         # Authentication middleware
├── public/
│   ├── css/            # Stylesheets
│   ├── js/             # Client-side scripts
│   ├── uploads/        # User uploaded files
│   └── *.html          # HTML Templates
├── routes/             # API Routes (auth, users, tickets, activities)
├── scripts/            # Utility and migration scripts
├── db.js               # Database connection
├── server.js           # Main application entry point
└── .env                # Environment variables
```

## 🛠️ Dependencies

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (via `mysql2`)
- **Security**: `bcryptjs`, `helmet`, `express-rate-limit`, `express-validator`
- **Session**: `express-session`, `express-mysql-session` (Persistent Store)
- **Logging**: `winston`, `winston-daily-rotate-file`
- **Utilities**: `dotenv`, `multer` (File Uploads)

### Frontend
- **Styling**: Vanilla CSS (Responsive Design)
- **Libraries**: `Chart.js` (Visualizations), `jspdf` & `jspdf-autotable` (PDF Export)

## 📦 Deployment Guide

### Prerequisites
- Node.js (v14 or higher)
- MySQL Server

### Installation

1.  **Clone the Repository**
    ```bash
    git clone <repository-url>
    cd login-app
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    - Create a `.env` file in the root directory:
    ```env
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_password
    DB_NAME=login_db
    SESSION_SECRET=your_secure_secret
    PORT=3000
    ```

4.  **Database Setup**
    - Create a MySQL database (e.g., `login_db`).
    - Import the schema:
        ```bash
        mysql -u <user> -p <database_name> < schema.sql
        ```
    - (Optional) Seed initial data:
        ```bash
        node scripts/init-db.js
        node scripts/seed-tickets.js
        ```

5.  **Run Migrations (Important)**
    - If you have existing data with plain-text passwords, run the migration script:
    ```bash
    node scripts/migrate-passwords.js
    ```

6.  **Run the Application**
    ```bash
    npm start
    ```
    - Access the app at `http://localhost:3000`.

### PWA Features
- **Installable**: Can be installed as a standalone app on mobile and desktop.
- **Offline Capable**: Caches static assets for offline access.
- **Responsive**: Optimized for mobile, tablet, and desktop views.

### Production Notes
- Set `NODE_ENV=production`.
- Enable `secure: true` for cookies in `server.js` (requires HTTPS).
- Use a persistent session store (e.g., Redis) instead of MemoryStore.

## 🔮 Future Roadmap

-   **Email Notifications**: Automated emails for ticket updates and password resets.
-   **Docker Support**: Containerize the application for easier deployment.
-   **CI/CD Integration**: Automated testing and deployment pipelines.
-   **Advanced Analytics**: More detailed charts and reporting features.
-   **Real-time Updates**: Use WebSockets (Socket.io) for live ticket updates without refreshing.
