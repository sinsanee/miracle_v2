const sqlite3 = require('sqlite3').verbose();

/**
 * Executes a query on a SQLite database.
 * @param {string} query - The SQL query to execute.
 * @param {Array} params - The parameters for the SQL query.
 * @returns {Promise} - Resolves with the query result.
 */
function runQuery(query, params = []) {
    const dbPath = '.\\bot\\database\\cards.sqlite3'
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                return reject(`Could not connect to database: ${err.message}`);
            }
        });

        db.all(query, params, (err, rows) => {
            if (err) {
                return reject(`Query failed: ${err.message}`);
            }
            resolve(rows);
        });

        db.close((err) => {
            if (err) {
                console.error(`Could not close database: ${err.message}`);
            }
        });
    });
}

module.exports = { runQuery };