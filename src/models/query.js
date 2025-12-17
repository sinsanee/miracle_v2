const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'cards.sqlite3');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

/**
 * Run a SELECT query that returns multiple rows
 */
function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * Run a SELECT query that returns a single row
 */
function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * Run INSERT / UPDATE / DELETE
 */
function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) return reject(err);
            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

/**
 * Gracefully close database (call on app shutdown)
 */
function close() {
    return new Promise((resolve, reject) => {
        db.close(err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

module.exports = {
    all,
    get,
    run,
    close
};