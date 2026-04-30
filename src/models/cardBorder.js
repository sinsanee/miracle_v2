const { get } = require('./query');
const { resolveBorderBuffer } = require('./cardGen');
const { resolveImageBuffer } = require('./imageResolver');

/**
 * Resolve the correct tinted border buffer for an owned card.
 * Handles Default border, custom border items, and paint tinting.
 *
 * @param {object} ownedCard  Row from owned_cards (needs border_type, border_item_id, r, g, b)
 * @param {object} setData    Row from sets (needs border)
 * @returns {Buffer}
 */
async function getCardBorder(ownedCard, setData) {
    const setBorderUrl = `${process.env.BORDER_BASE_URL}/${setData.border}`;

    let customBorderUrl = null;
    if (ownedCard.border_item_id) {
        const item = await get('SELECT image FROM items WHERE id = ?', [ownedCard.border_item_id]);
        if (item?.image) {
            customBorderUrl = `${process.env.ITEM_BASE_URL}/${item.image}`;
        }
    }

    return resolveBorderBuffer(
        ownedCard.border_type ?? null,
        setBorderUrl,
        customBorderUrl,
        ownedCard.r ?? null,
        ownedCard.g ?? null,
        ownedCard.b ?? null,
        resolveImageBuffer
    );
}

module.exports = { getCardBorder };
