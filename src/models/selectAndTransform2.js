// Import sqlite3
const sqlite3 = require('sqlite3').verbose();

// Define the selectAndTransform function
async function selectAndTransform2(sql, params) {
    const dbPath = './bot/database/cards.sqlite3';
    const db = new sqlite3.Database(dbPath);

    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error executing query:', err);
                reject(err);
            } else {
                if (!rows || rows.length === 0) {
                    resolve(null);
                } else {
                    const transformedRows = rows.map(row => [row.id, row.name, row.series, row.edition, row.dropped, row.grabbed, row.circulation, row.rarity]);
                    resolve(transformedRows);
                }
            }
        });

        // Close the database connection after executing the query
        db.close();
    });
}

// Export the function as a module
module.exports = {
    selectAndTransform2
};
