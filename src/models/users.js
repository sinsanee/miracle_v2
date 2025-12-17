const { get, run } = require('./query');

/**
 * Check if a user exists
 */
async function userExists(userId) {
    const row = await get(
        'SELECT 1 FROM users WHERE userid = ?',
        [userId]
    );
    return !!row;
}

/**
 * Get full user data
 */
function getUser(userId) {
    return get(
        'SELECT * FROM users WHERE userid = ?',
        [userId]
    );
}

/**
 * Create a user if they don't exist
 */
function createUser(userId) {
    return run(
        'INSERT INTO users (userid) VALUES (?)',
        [userId]
    );
}

module.exports = {
    userExists,
    getUser,
    createUser
};