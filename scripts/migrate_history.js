const db = require('../db');

async function migrate() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS ticket_status_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id INT NOT NULL,
                old_status VARCHAR(50),
                new_status VARCHAR(50) NOT NULL,
                changed_by VARCHAR(255) NOT NULL,
                changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
                FOREIGN KEY (changed_by) REFERENCES users(username) ON DELETE CASCADE
            )
        `);
        console.log('ticket_status_history table created successfully');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();
