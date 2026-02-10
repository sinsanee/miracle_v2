/**
 * Generates a unique 8-character alphanumeric ID for owned cards
 * Format: XXXXXXXX (uppercase letters and numbers)
 */
function generateId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    id += characters[randomIndex];
  }
  
  return id;
}

/**
 * Generates a unique ID and verifies it doesn't exist in the database
 * @param {Database} db - Better-sqlite3 database instance
 * @returns {string} Unique 8-character ID
 */
function generateUniqueId(db) {
  let id;
  let exists = true;
  
  // Keep generating until we get a unique ID
  while (exists) {
    id = generateId();
    const stmt = db.prepare('SELECT id FROM owned_cards WHERE id = ?');
    const result = stmt.get(id);
    exists = result !== undefined;
  }
  
  return id;
}

module.exports = { generateId, generateUniqueId };
