const db = require('./query'); // adjust path if needed

/**
 * Get border value from sets table by id
 * @param {number|string} id
 * @returns {Promise<string|null>}
 */
async function getBorder(id) {
    const query = `
        SELECT border
        FROM sets
        WHERE id = ?
        LIMIT 1
    `;

    const row = await db.get(query, [id]);
    return row ? row.border : null;
}

module.exports = {
    getBorder
};