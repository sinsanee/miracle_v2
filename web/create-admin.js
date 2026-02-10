const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const db = new Database(path.join(__dirname, '../src/database/cards.sqlite3'));

console.log('\n=== Create Admin User ===\n');

rl.question('Enter username: ', (username) => {
  rl.question('Enter password: ', async (password) => {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare('INSERT INTO webusers (username, password, admin) VALUES (?, ?, 1)');
      const result = stmt.run(username, hashedPassword);
      
      console.log('\n✅ Admin user created successfully!');
      console.log(`Username: ${username}`);
      console.log(`User ID: ${result.lastInsertRowid}`);
      console.log('\nYou can now login at http://localhost:3000\n');
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        console.log('\n❌ Error: Username already exists');
        console.log('To make an existing user an admin, run:');
        console.log(`sqlite3 ../src/database/cards.sqlite3 "UPDATE webusers SET admin = 1 WHERE username = '${username}'"\n`);
      } else {
        console.log('\n❌ Error creating admin user:', error.message, '\n');
      }
    }
    
    db.close();
    rl.close();
  });
});
