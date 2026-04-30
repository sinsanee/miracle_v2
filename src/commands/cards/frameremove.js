const {
    Client, Interaction, ApplicationCommandOptionType,
    EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder
} = require('discord.js');
const { get, run } = require('../../models/query');

const FRAME_REMOVE_GOLD = 1000;
const GOLD_ITEM_ID      = 7;

module.exports = {
    /**
     * @param {Client} client
     * @param {Interaction} interaction
     */
    callback: async (client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const cardId = interaction.options.getString('id').toUpperCase();
        const userId = interaction.user.id;

        try {
            // Verify card ownership
            const ownedCard = await get(
                'SELECT * FROM owned_cards WHERE id = ? AND owner = ?',
                [cardId, userId]
            );
            if (!ownedCard) {
                return interaction.editReply({ content: `❌ No card with ID **${cardId}** found in your collection.` });
            }

            // Check there's actually a frame on this card
            if (!ownedCard.border_type || !ownedCard.border_item_id) {
                return interaction.editReply({ content: `❌ **${cardId}** doesn't have a frame applied.` });
            }

            // Fetch frame item name for display
            const frameItem = await get(
                'SELECT id, name FROM items WHERE id = ?',
                [ownedCard.border_item_id]
            );
            const frameName = frameItem?.name ?? ownedCard.border_type;

            // Fetch card name for display
            const card = await get('SELECT name FROM cards WHERE id = ?', [ownedCard.card]);

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🖼️ Remove Frame?')
                .setDescription(
                    `Remove **${frameName}** from **${card.name}** (\`${cardId}\`)?\n\n` +
                    `You will receive:\n` +
                    `🖼️ **1x ${frameName}** returned to your inventory\n` +
                    `🪙 **${FRAME_REMOVE_GOLD} Gold**`
                )
                .setColor('#E67E22');

            const confirmBtn = new ButtonBuilder()
                .setCustomId(`fremove_confirm_${interaction.id}`)
                .setLabel('Remove Frame')
                .setEmoji('🖼️')
                .setStyle(ButtonStyle.Danger);

            const cancelBtn = new ButtonBuilder()
                .setCustomId(`fremove_cancel_${interaction.id}`)
                .setLabel('Cancel')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Secondary);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [new ActionRowBuilder().addComponents([confirmBtn, cancelBtn])]
            });

            const collector = message.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                max: 1,
                time: 30000
            });

            collector.on('collect', async (i) => {
                if (i.customId === `fremove_cancel_${interaction.id}`) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ Frame removal cancelled.').setColor('#95A5A6')],
                        components: []
                    });
                }

                // Re-verify the frame is still on the card
                const freshCard = await get(
                    'SELECT border_type, border_item_id FROM owned_cards WHERE id = ? AND owner = ?',
                    [cardId, userId]
                );
                if (!freshCard?.border_type || !freshCard?.border_item_id) {
                    return i.update({
                        embeds: [new EmbedBuilder().setDescription('❌ This card no longer has a frame.').setColor('#E74C3C')],
                        components: []
                    });
                }

                // Remove frame from card
                await run(
                    'UPDATE owned_cards SET border_type = NULL, border_item_id = NULL WHERE id = ?',
                    [cardId]
                );

                // Return frame to inventory
                const existingInv = await get(
                    'SELECT id FROM inventory WHERE userid = ? AND itemid = ?',
                    [userId, ownedCard.border_item_id]
                );
                if (existingInv) {
                    await run(
                        'UPDATE inventory SET amount = amount + 1 WHERE userid = ? AND itemid = ?',
                        [userId, ownedCard.border_item_id]
                    );
                } else {
                    await run(
                        'INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, 1)',
                        [userId, ownedCard.border_item_id]
                    );
                }

                // Award gold
                const existingGold = await get(
                    'SELECT id FROM inventory WHERE userid = ? AND itemid = ?',
                    [userId, GOLD_ITEM_ID]
                );
                if (existingGold) {
                    await run(
                        'UPDATE inventory SET amount = amount + ? WHERE userid = ? AND itemid = ?',
                        [FRAME_REMOVE_GOLD, userId, GOLD_ITEM_ID]
                    );
                } else {
                    await run(
                        'INSERT INTO inventory (userid, itemid, amount) VALUES (?, ?, ?)',
                        [userId, GOLD_ITEM_ID, FRAME_REMOVE_GOLD]
                    );
                }

                return i.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🖼️ Frame Removed')
                            .setDescription(
                                `**${frameName}** removed from **${card.name}** (\`${cardId}\`).\n\n` +
                                `Returned to inventory: 🖼️ 1x ${frameName}\n` +
                                `Gold received: 🪙 ${FRAME_REMOVE_GOLD}`
                            )
                            .setColor('#2ECC71')
                    ],
                    components: []
                });
            });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    await message.edit({
                        embeds: [new EmbedBuilder().setDescription('⏰ Frame removal timed out.').setColor('#95A5A6')],
                        components: []
                    }).catch(console.error);
                }
            });

        } catch (error) {
            console.error('Error in frameremove:', error);
            return interaction.editReply({ content: 'An error occurred while removing the frame.' });
        }
    },

    name: 'frameremove',
    description: 'Remove a frame from a card, returning it to your inventory for 1000 Gold.',
    devOnly: false,
    options: [
        {
            name: 'id',
            description: 'The ID of the card to remove the frame from',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
};
