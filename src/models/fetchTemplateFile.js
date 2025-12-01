// fetchTemplateFile.js

// Import the necessary database utility
const { runQuery } = require('./query'); // Adjust the path as needed

// Mapping of collection names to their respective template images
const collectionTemplates = {
  'Alpha': '.\\bot\\images\\borders\\atpl.png',
  'Spring': '.\\bot\\images\\borders\\stpl.png',
  'Beta': '.\\bot\\images\\borders\\btpl.png',
  'Winter': '.\\bot\\images\\borders\\wtpl.png',
  'Release': '.\\bot\\images\\borders\\rtpl.png',
  'Portuguese': '.\\bot\\images\\borders\\ptpl.png'
};

/**
 * Fetches the template image for a card's collection from the database.
 * @param {number} cardNumber - The card number to look up.
 * @returns {Promise<string>} - The template image associated with the card's collection.
 * @throws {Error} - If the card or collection is not found or if there is an error during the query.
 */
async function fetchTemplateFile(cardNumber) {
  const sql = `SELECT series FROM Cards WHERE id=?`;
  try {
    const results = await runQuery(sql, [cardNumber]);
    if (results.length > 0) {
      const edition = results[0].series;
      const templateFile = collectionTemplates[edition];
      if (templateFile) {
        return templateFile;
      } else {
        throw new Error(`No template image defined for edition '${edition}'.`);
      }
    } else {
      throw new Error(`Card number ${cardNumber} not found.`);
    }
  } catch (error) {
    throw new Error(`Error fetching template image: ${error.message}`);
  }
}

module.exports = { fetchTemplateFile };
