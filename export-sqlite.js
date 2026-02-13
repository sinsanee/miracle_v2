const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'src/database/cards.sqlite3');
const db = new sqlite3.Database(dbPath);

const outputFile = './sqlite-export.sql';
const tables = ['users', 'webusers', 'sets', 'cards', 'owned_cards', 'items', 'inventory', 'auctions'];

let sqlStatements = [];

async function exportTable(tableName) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${tableName}`, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            if (rows.length === 0) {
                console.log(`${tableName}: No data to export`);
                resolve();
                return;
            }

            rows.forEach(row => {
                const columns = Object.keys(row);
                const values = columns.map(col => {
                    const val = row[col];
                    if (val === null) return 'NULL';
                    if (typeof val === 'number') return val;
                    // Escape single quotes and backslashes for MySQL
                    return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
                });

                const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
                sqlStatements.push(sql);
            });

            console.log(`${tableName}: Exported ${rows.length} rows`);
            resolve();
        });
    });
}

async function exportAll() {
    console.log('Starting SQLite export...\n');
    
    try {
        // Disable foreign key checks during import
        sqlStatements.push('SET FOREIGN_KEY_CHECKS=0;');
        sqlStatements.push('');
        
        for (const table of tables) {
            await exportTable(table);
        }
        
        // Re-enable foreign key checks
        sqlStatements.push('');
        sqlStatements.push('SET FOREIGN_KEY_CHECKS=1;');
        
        fs.writeFileSync(outputFile, sqlStatements.join('\n'));
        console.log(`\n✅ Export complete! Data saved to ${outputFile}`);
        console.log(`📊 Total statements: ${sqlStatements.length}`);
        console.log(`\nNext steps:`);
        console.log(`1. Upload ${outputFile} to your DirectAdmin server`);
        console.log(`2. Import via phpMyAdmin or MySQL command line`);
        console.log(`3. Run: mysql -u username -p database_name < sqlite-export.sql`);
        
    } catch (error) {
        console.error('❌ Export failed:', error);
    } finally {
        db.close();
    }
}

exportAll();
