const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cards_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('Connected to MySQL database');
        connection.release();
    })
    .catch(err => {
        console.error('Failed to connect to MySQL database:', err);
    });

/**
 * Run a SELECT query that returns multiple rows
 */
async function all(query, params = []) {
    const [rows] = await pool.execute(query, params);
    return rows;
}

/**
 * Run a SELECT query that returns a single row
 */
async function get(query, params = []) {
    const [rows] = await pool.execute(query, params);
    return rows[0] || null;
}

/**
 * Run INSERT / UPDATE / DELETE
 */
async function run(query, params = []) {
    const [result] = await pool.execute(query, params);
    return {
        lastID: result.insertId,
        changes: result.affectedRows
    };
}

/**
 * Gracefully close database (call on app shutdown)
 */
async function close() {
    await pool.end();
}

module.exports = {
    all,
    get,
    run,
    close,
    pool // Export pool for advanced usage if needed
};
