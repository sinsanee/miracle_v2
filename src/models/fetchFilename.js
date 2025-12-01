// fetchCardFilename.js

// Import the necessary database utility (e.g., select2)
const { runQuery } = require('./query'); // Adjust the path as needed

/**
 * Fetches the filename for a given card number from the database.
 * @param {number} cardNumber - The card number to look up.
 * @returns {Promise<string>} - The filename associated with the card number.
 * @throws {Error} - If the card number is not found or if there is an error during the query.
 */
async function fetchFilename(cardNumber) {
  const sql = `SELECT filepath FROM cards WHERE id=${cardNumber}`;
  try {
    const results = await runQuery(sql);
    if (results.length > 0) {
      return results[0].filepath;
    } else {
      throw new Error(`Card number ${cardNumber} not found.`);
    }
  } catch (error) {
    throw new Error(`Error fetching card filename: ${error.message}`);
  }
}

module.exports = { fetchFilename };
