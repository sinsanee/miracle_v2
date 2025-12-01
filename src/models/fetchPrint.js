// fetchCardPrint.js

// Import the necessary database utility (e.g., select2)
const { runQuery } = require('./query'); // Adjust the path as needed

/**
 * Fetches the print status ("dropped") for a given card number from the database.
 * @param {number} cardNumber - The card number to look up.
 * @returns {Promise<boolean>} - The "dropped" status associated with the card number.
 * @throws {Error} - If the card number is not found or if there is an error during the query.
 */
async function fetchPrint(cardNumber) {
  const sql = `SELECT dropped FROM cards WHERE id=${cardNumber}`;
  try {
    const results = await runQuery(sql);
    if (results.length > 0) {
      return results[0].dropped;
    } else {
      throw new Error(`Card number ${cardNumber} not found.`);
    }
  } catch (error) {
    throw new Error(`Error fetching card print status: ${error.message}`);
  }
}

module.exports = { fetchPrint };
