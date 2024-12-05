// db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path for SQLite database
const dbPath = path.resolve(__dirname, 'budget-tracker.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Database connected successfully');
    }
});

// Create transactions table if it doesn't exist
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            description TEXT,
            amount REAL,
            category TEXT,
            account TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err);
        } else {
            console.log('Transactions table created or already exists.');
        }
    });
});

module.exports = db;
